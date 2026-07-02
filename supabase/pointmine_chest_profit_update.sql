-- 상자 순이익 원장과 상위 곡괭이(황금 이상) 지급 제한
-- pointmine_shop_update.sql 적용 후 Supabase SQL Editor에서 한 번 실행합니다.
--
-- 순매출 = 상자 가격 - (익테봇 수수료 + 로또기금 수수료)  (= 엘케이컴퍼니 몫)
-- 순이익 = 순매출 - 뽑은 곡괭이의 기댓값(기본 내구도 전체 기대 수익)
-- 순이익은 pointmine_chest_ledger에 누적 기록하며,
-- 황금 곡괭이(등급 5)부터는 "누적 순이익 + 이번 순매출"이 곡괭이 기댓값 이상일 때만 지급합니다.

begin;

-- 1) 곡괭이별 기댓값(기본 내구도 전체 기대 수익, docs/mining-expected-values.md) 컬럼 추가
alter table public.pointmine_pickaxes
  add column if not exists expected_value numeric(14, 4);

update public.pointmine_pickaxes set expected_value = case id
  when 'wood' then 6.77
  when 'stone' then 15.58
  when 'rusty_iron' then 30.25
  when 'bronze' then 61.10
  when 'steel' then 131.10
  when 'gold' then 188.54
  when 'titanium' then 674.38
  when 'platinum' then 1849.75
  when 'obsidian' then 4408.87
  when 'alloy' then 8953.27
  when 'ruby' then 19371.68
  when 'sapphire' then 31594.67
  when 'orichalcum' then 39724.14
  when 'adamantium' then 63568.83
  when 'astral' then 167973.97
  when 'master' then 491365.73
  else expected_value end;

alter table public.pointmine_pickaxes
  alter column expected_value set not null;

-- 2) 누적 순이익 원장 (단일 행)
create table if not exists public.pointmine_chest_ledger (
  id boolean primary key default true check (id),
  net_profit numeric(20, 4) not null default 0
);

insert into public.pointmine_chest_ledger (id, net_profit)
values (true, 0)
on conflict (id) do nothing;

alter table public.pointmine_chest_ledger enable row level security;
revoke all on public.pointmine_chest_ledger from anon, authenticated;

-- 3) 개봉 로그에 이번 개봉의 순이익 기록 컬럼 추가
alter table public.pointmine_chest_openings
  add column if not exists net_profit numeric(16, 4);

-- 4) 개봉 함수 재정의: 순이익 원장 반영 + 황금 이상 지급 제한
create or replace function public.open_pickaxe_chest(p_chest_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inventory jsonb;
  v_new_inventory jsonb;
  v_user_balance numeric;
  v_new_balance numeric;
  v_price bigint;
  v_lk_company_share bigint;
  v_iktebot_share bigint;
  v_lotto_fund_share bigint;
  v_net_revenue bigint;
  v_net_profit numeric(20, 4);
  v_available numeric(20, 4);
  v_pickaxe_id text;
  v_pickaxe_name text;
  v_pickaxe_durability integer;
  v_pickaxe_ev numeric(14, 4);
  v_is_duplicate boolean;
  v_has_equipped boolean;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select price into v_price
  from public.pointmine_chests
  where id = p_chest_id;

  if not found then
    return jsonb_build_object('status', 'invalid_chest');
  end if;

  select balance, inventory
  into v_user_balance, v_inventory
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  if coalesce(v_user_balance, 0) < v_price then
    return jsonb_build_object('status', 'insufficient_balance');
  end if;

  perform 1 from public.companies where name = '엘케이컴퍼니' for update;
  if not found then
    return jsonb_build_object('status', 'company_not_found');
  end if;

  perform 1 from public.companies where name = '익테봇' for update;
  if not found then
    return jsonb_build_object('status', 'company_not_found');
  end if;

  perform 1 from public.users where nickname = '로또기금' for update;
  if not found then
    return jsonb_build_object('status', 'company_not_found');
  end if;

  -- 수수료 분배와 순매출 계산 (순매출 = 가격 - 익테봇 - 로또기금 = 엘케이컴퍼니 몫)
  v_lk_company_share := (v_price * 98) / 100;
  v_iktebot_share := v_price / 100;
  v_lotto_fund_share := v_price - v_lk_company_share - v_iktebot_share;
  v_net_revenue := v_price - v_iktebot_share - v_lotto_fund_share;

  -- 누적 순이익 원장 잠금 후 이번 개봉에서 지급 가능한 순이익 산출
  select net_profit into v_net_profit
  from public.pointmine_chest_ledger
  where id = true
  for update;

  if not found then
    insert into public.pointmine_chest_ledger (id, net_profit) values (true, 0)
    on conflict (id) do nothing;
    v_net_profit := 0;
  end if;

  v_available := coalesce(v_net_profit, 0) + v_net_revenue;

  -- 곡괭이 추첨. 마스터는 프리미엄에서 제외하고,
  -- 황금(등급 5) 이상은 순이익(v_available)이 곡괭이 기댓값 이상일 때만 후보에 포함합니다.
  select pickaxe.id, pickaxe.name, pickaxe.max_durability, pickaxe.expected_value
  into v_pickaxe_id, v_pickaxe_name, v_pickaxe_durability, v_pickaxe_ev
  from public.pointmine_chest_drops as drop_rate
  join public.pointmine_pickaxes as pickaxe on pickaxe.id = drop_rate.pickaxe_id
  where drop_rate.chest_id = p_chest_id
    and not (p_chest_id = 'premium' and pickaxe.id = 'master')
    and (pickaxe.rarity_rank < 5 or pickaxe.expected_value <= v_available)
  order by -ln(greatest(random(), 0.000000000001)) / drop_rate.weight
  limit 1;

  if v_pickaxe_id is null then
    raise exception '상자 확률 정보가 없습니다.' using errcode = 'P0002';
  end if;

  if jsonb_typeof(v_inventory) <> 'array' then
    v_inventory := '[]'::jsonb;
  end if;

  select exists (
    select 1
    from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
  ) into v_is_duplicate;

  select exists (
    select 1
    from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'pickaxe' and coalesce((item->>'equipped')::boolean, false)
  ) into v_has_equipped;

  if v_is_duplicate then
    select coalesce(jsonb_agg(
      case
        when item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
          then item || jsonb_build_object(
            'durability', coalesce((item->>'durability')::integer, 0) + v_pickaxe_durability,
            'maxDurability', coalesce((item->>'maxDurability')::integer, v_pickaxe_durability) + v_pickaxe_durability
          )
        else item
      end
      order by ordinal
    ), '[]'::jsonb)
    into v_new_inventory
    from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);
  else
    v_new_inventory := v_inventory || jsonb_build_array(jsonb_build_object(
      'type', 'pickaxe',
      'id', v_pickaxe_id,
      'durability', v_pickaxe_durability,
      'maxDurability', v_pickaxe_durability,
      'equipped', not v_has_equipped
    ));
  end if;

  update public.users
  set balance = balance - v_price,
      inventory = v_new_inventory
  where auth_user_id = v_uid
  returning balance into v_new_balance;

  update public.companies
  set balance = coalesce(balance, 0) + v_lk_company_share
  where name = '엘케이컴퍼니';

  update public.companies
  set balance = coalesce(balance, 0) + v_iktebot_share
  where name = '익테봇';

  update public.users
  set balance = coalesce(balance, 0) + v_lotto_fund_share
  where nickname = '로또기금';

  -- 순이익 원장 갱신: 이번 개봉의 순이익(순매출 - 곡괭이 기댓값)을 누적
  update public.pointmine_chest_ledger
  set net_profit = v_available - v_pickaxe_ev
  where id = true;

  insert into public.pointmine_chest_openings
    (auth_user_id, chest_id, pickaxe_id, price, lk_company_share, iktebot_share, lotto_fund_share, net_profit)
  values
    (v_uid, p_chest_id, v_pickaxe_id, v_price, v_lk_company_share, v_iktebot_share, v_lotto_fund_share, v_net_revenue - v_pickaxe_ev);

  return jsonb_build_object(
    'status', 'success',
    'chest_id', p_chest_id,
    'pickaxe_id', v_pickaxe_id,
    'pickaxe_name', v_pickaxe_name,
    'balance', v_new_balance,
    'inventory', v_new_inventory,
    'is_duplicate', v_is_duplicate
  );
end;
$$;

revoke all on function public.open_pickaxe_chest(text) from public, anon;
grant execute on function public.open_pickaxe_chest(text) to authenticated;

comment on table public.pointmine_chest_ledger is
  '상자 개봉 누적 순이익 원장. 순이익 = 순매출(가격-수수료) - 뽑은 곡괭이 기댓값';
comment on column public.pointmine_pickaxes.expected_value is
  '기본 내구도 전체 기대 수익(P). 상자 순이익 계산과 상위 곡괭이 지급 제한에 사용';
comment on function public.open_pickaxe_chest(text) is
  '순이익 원장을 갱신하고 황금 이상 곡괭이는 순이익이 기댓값 이상일 때만 지급하는 상자 개봉 함수';

commit;
