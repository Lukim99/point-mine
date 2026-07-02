-- 포인트 사용/지급 시 카카오톡 알림 전송
-- pointmine_sale_fee_update.sql, pointmine_chest_profit_update.sql 적용 후 마지막에 실행합니다.
--
-- 상자 구매(포인트 사용)와 광물 판매(포인트 지급) 성공 시 카카오톡 채널로 메시지를 보냅니다.
-- 서버(Supabase)에서 pg_net으로 전송하므로 API 키가 클라이언트에 노출되지 않습니다.

begin;

create extension if not exists pg_net;

-- 카카오톡 채널로 알림을 보내는 헬퍼. 전송 실패는 게임 동작에 영향을 주지 않습니다.
create or replace function public.send_kakao_notification(p_content text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://rpgenius.kro.kr/send-kakao',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-api-key', 'delutive-kakao-1mdk2kfe'
    ),
    body := jsonb_build_object(
      'channelId', '18476999533546780',
      'content', p_content
    )
  );
exception when others then
  null;
end;
$$;

-- 상자 개봉: 순이익 원장 반영 + 황금 이상 지급 제한 + 구매 카카오 알림
create or replace function public.open_pickaxe_chest(p_chest_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text;
  v_chest_name text;
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

  select price, name into v_price, v_chest_name
  from public.pointmine_chests
  where id = p_chest_id;

  if not found then
    return jsonb_build_object('status', 'invalid_chest');
  end if;

  select balance, inventory, nickname
  into v_user_balance, v_inventory, v_nickname
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

  -- 구매 카카오 알림
  perform public.send_kakao_notification(
    '[ 포인트 광산 구매 ]' || E'\n' ||
    '✅ ' || coalesce(v_nickname, '광부') || '님이 ' || to_char(v_price, 'FM9,999,999,999') || ' P를 소모해 ' || v_chest_name || '를 구매했습니다.' || E'\n' ||
    '💰 잔액: ' || to_char(v_new_balance, 'FM9,999,999,999') || ' P' || E'\n\n' ||
    '[ 포인트 분배 ]' || E'\n' ||
    '- 로또기금: ' || to_char(v_lotto_fund_share, 'FM9,999,999,999') || ' P' || E'\n' ||
    '- 익테봇: ' || to_char(v_iktebot_share, 'FM9,999,999,999') || ' P' || E'\n' ||
    '- 엘케이컴퍼니: ' || to_char(v_lk_company_share, 'FM9,999,999,999') || ' P'
  );

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

-- 광물 선택 판매: 수수료 분배 + 판매 카카오 알림
create or replace function public.sell_selected_minerals(p_ore_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text;
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

  select inventory, nickname into v_inventory, v_nickname
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

  -- 판매 카카오 알림
  perform public.send_kakao_notification(
    '[ 포인트 광산 판매 ]' || E'\n' ||
    '✅ ' || coalesce(v_nickname, '광부') || '님이 광물을 판매해 ' || to_char(v_received, 'FM9,999,999,999') || ' P를 획득했습니다.' || E'\n' ||
    '💰 잔액: ' || to_char(v_new_balance, 'FM9,999,999,999') || ' P' || E'\n\n' ||
    '[ 수수료 ]' || E'\n' ||
    '- 로또기금: ' || to_char(v_lotto_fee, 'FM9,999,999,999') || ' P' || E'\n' ||
    '- 익테봇: ' || to_char(v_iktebot_fee, 'FM9,999,999,999') || ' P'
  );

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

revoke all on function public.send_kakao_notification(text) from public, anon, authenticated;
revoke all on function public.open_pickaxe_chest(text) from public, anon;
revoke all on function public.sell_selected_minerals(text[]) from public, anon;
grant execute on function public.open_pickaxe_chest(text) to authenticated;
grant execute on function public.sell_selected_minerals(text[]) to authenticated;

comment on function public.send_kakao_notification(text) is
  '카카오톡 채널로 알림 메시지를 전송하는 헬퍼 (pg_net 비동기 POST)';

commit;
