-- 광물 판매 최소 금액과 수수료 분배를 적용합니다.
-- 기존 설치 환경에서는 Supabase SQL Editor에서 전체 스크립트를 한 번 실행합니다.

begin;

create or replace function public.sell_selected_minerals(p_ore_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ore_ids text[];
  v_inventory jsonb;
  v_new_inventory jsonb;
  v_total bigint;
  v_iktebot_fee bigint;
  v_lotto_fee bigint;
  v_received bigint;
  v_company_balance numeric;
  v_new_balance numeric;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct ore_id), '{}'::text[])
  into v_ore_ids
  from unnest(coalesce(p_ore_ids, '{}'::text[])) as selected(ore_id)
  where exists (select 1 from public.pointmine_ores where id = selected.ore_id);

  if cardinality(v_ore_ids) = 0 then
    return jsonb_build_object('status', 'empty_selection');
  end if;

  select inventory into v_inventory
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  select coalesce(sum(
    ore.sell_price * case
      when item->>'quantity' ~ '^[0-9]+$' then (item->>'quantity')::integer
      else 0
    end
  ), 0)::bigint
  into v_total
  from jsonb_array_elements(v_inventory) as item
  join public.pointmine_ores as ore on ore.id = item->>'id'
  where item->>'type' = 'mineral'
    and ore.id = any(v_ore_ids);

  if v_total <= 0 then
    return jsonb_build_object('status', 'empty');
  end if;

  if v_total < 10 then
    return jsonb_build_object('status', 'minimum_sale', 'minimum_points', 10, 'selected_points', v_total);
  end if;

  select balance into v_company_balance
  from public.companies
  where name = '엘케이컴퍼니'
  for update;

  if not found then
    return jsonb_build_object('status', 'company_not_found');
  end if;

  perform 1 from public.companies where name = '익테봇' for update;
  if not found then
    return jsonb_build_object('status', 'fee_account_not_found');
  end if;

  perform 1 from public.users where nickname = '로또기금' for update;
  if not found then
    return jsonb_build_object('status', 'fee_account_not_found');
  end if;

  if coalesce(v_company_balance, 0) < v_total then
    return jsonb_build_object('status', 'company_insufficient');
  end if;

  v_iktebot_fee := greatest(v_total / 100, 1);
  v_lotto_fee := greatest(v_total / 100, 1);
  v_received := v_total - v_iktebot_fee - v_lotto_fee;

  select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal)
  where not (
    item->>'type' = 'mineral'
    and item->>'id' = any(v_ore_ids)
  );

  update public.users
  set balance = coalesce(balance, 0) + v_received,
      inventory = v_new_inventory
  where auth_user_id = v_uid
  returning balance into v_new_balance;

  update public.companies
  set balance = balance - v_total
  where name = '엘케이컴퍼니';

  update public.companies
  set balance = coalesce(balance, 0) + v_iktebot_fee
  where name = '익테봇';

  update public.users
  set balance = coalesce(balance, 0) + v_lotto_fee
  where nickname = '로또기금';

  return jsonb_build_object(
    'status', 'success',
    'sold_points', v_total,
    'received_points', v_received,
    'iktebot_fee', v_iktebot_fee,
    'lotto_fee', v_lotto_fee,
    'balance', v_new_balance,
    'inventory', v_new_inventory
  );
end;
$$;

create or replace function public.sell_all_minerals()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ore_ids text[];
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct item->>'id'), '{}'::text[])
  into v_ore_ids
  from public.users,
       jsonb_array_elements(inventory) as item
  where auth_user_id = v_uid
    and item->>'type' = 'mineral';

  return public.sell_selected_minerals(v_ore_ids);
end;
$$;

revoke all on function public.sell_selected_minerals(text[]) from public, anon;
revoke all on function public.sell_all_minerals() from public, anon;

grant execute on function public.sell_selected_minerals(text[]) to authenticated;
grant execute on function public.sell_all_minerals() to authenticated;

comment on function public.sell_selected_minerals(text[]) is
  '최소 10P의 선택 광물을 판매하고 익테봇·로또기금에 각각 1% 이상 1P를 분배하는 함수';
comment on function public.sell_all_minerals() is
  '전체 광물 판매를 선택 판매 수수료 함수로 위임하는 함수';

commit;
