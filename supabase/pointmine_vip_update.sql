-- VIP 티켓 시스템
-- pointmine_kakao_notify_update.sql, pointmine_chest_bulk_update.sql 적용 후 실행합니다.
--
-- 가격 3,000P / 7일. 매일 일반·고급 상자 1회 무료 개봉, 매일 마나 5 지급,
-- 상자 1개 구매 5% 할인, 5개 구매 10% 할인. 구매 시 카카오 알림 전송.
-- "매일"은 KST(Asia/Seoul) 자정 기준입니다.

begin;

-- 1) users 테이블에 VIP 상태와 일일 수령 날짜(KST) 컬럼 추가
alter table public.users
  add column if not exists vip_expires_at timestamptz,
  add column if not exists vip_last_normal_free date,
  add column if not exists vip_last_premium_free date,
  add column if not exists vip_last_mana date;

-- 2) VIP 티켓 구매 (3,000P, 구매 시 7일 연장)
create or replace function public.purchase_vip_ticket()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text;
  v_balance numeric;
  v_new_balance numeric;
  v_expires timestamptz;
  v_price constant bigint := 3000;
  v_lk_company_share bigint;
  v_iktebot_share bigint;
  v_lotto_fund_share bigint;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select balance, nickname, vip_expires_at
  into v_balance, v_nickname, v_expires
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  if coalesce(v_balance, 0) < v_price then
    return jsonb_build_object('status', 'insufficient_balance');
  end if;

  perform 1 from public.companies where name = '엘케이컴퍼니' for update;
  if not found then return jsonb_build_object('status', 'company_not_found'); end if;
  perform 1 from public.companies where name = '익테봇' for update;
  if not found then return jsonb_build_object('status', 'company_not_found'); end if;
  perform 1 from public.users where nickname = '로또기금' for update;
  if not found then return jsonb_build_object('status', 'company_not_found'); end if;

  v_lk_company_share := (v_price * 98) / 100;
  v_iktebot_share := v_price / 100;
  v_lotto_fund_share := v_price - v_lk_company_share - v_iktebot_share;

  -- 이미 VIP면 남은 기간에 7일 추가
  v_expires := greatest(now(), coalesce(v_expires, now())) + interval '7 days';

  update public.users
  set balance = balance - v_price,
      vip_expires_at = v_expires
  where auth_user_id = v_uid
  returning balance into v_new_balance;

  update public.companies set balance = coalesce(balance, 0) + v_lk_company_share where name = '엘케이컴퍼니';
  update public.companies set balance = coalesce(balance, 0) + v_iktebot_share where name = '익테봇';
  update public.users set balance = coalesce(balance, 0) + v_lotto_fund_share where nickname = '로또기금';

  perform public.send_kakao_notification(
    '[ 포인트 광산 알림 ]' || E'\n' ||
    '✅ ' || coalesce(v_nickname, '광부') || '님이 포인트 광산 VIP 티켓을 구매했습니다.' || E'\n' ||
    '💰 잔액: ' || to_char(v_new_balance, 'FM9,999,999,999') || ' P' || E'\n\n' ||
    '[ 포인트 분배 ]' || E'\n' ||
    '- 로또기금: ' || to_char(v_lotto_fund_share, 'FM9,999,999,999') || ' P' || E'\n' ||
    '- 익테봇: ' || to_char(v_iktebot_share, 'FM9,999,999,999') || ' P' || E'\n' ||
    '- 엘케이컴퍼니: ' || to_char(v_lk_company_share, 'FM9,999,999,999') || ' P'
  );

  return jsonb_build_object(
    'status', 'success',
    'balance', v_new_balance,
    'vip_expires_at', v_expires
  );
end;
$$;

-- 3) VIP 무료 상자 개봉 (일반·고급 각각 하루 1회, 쿠폰과 동일한 원장·지급 제한 적용)
create or replace function public.open_free_vip_chest(p_chest_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text;
  v_inventory jsonb;
  v_new_inventory jsonb;
  v_expires timestamptz;
  v_last date;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_has_equipped boolean;
  v_is_duplicate boolean;
  v_pickaxe_id text;
  v_pickaxe_name text;
  v_pickaxe_durability integer;
  v_pickaxe_ev numeric(14, 4);
  v_chest_name text;
  v_net_profit numeric(20, 4);
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  if p_chest_id not in ('normal', 'premium') then
    return jsonb_build_object('status', 'invalid_chest');
  end if;

  select nickname, inventory, vip_expires_at,
         case when p_chest_id = 'normal' then vip_last_normal_free else vip_last_premium_free end
  into v_nickname, v_inventory, v_expires, v_last
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  if v_expires is null or v_expires <= now() then
    return jsonb_build_object('status', 'not_vip');
  end if;

  if v_last = v_today then
    return jsonb_build_object('status', 'already_claimed');
  end if;

  if jsonb_typeof(v_inventory) <> 'array' then
    v_inventory := '[]'::jsonb;
  end if;
  v_new_inventory := v_inventory;

  select name into v_chest_name
  from public.pointmine_chests
  where id = p_chest_id;

  select net_profit into v_net_profit
  from public.pointmine_chest_ledger
  where id = true
  for update;

  if not found then
    insert into public.pointmine_chest_ledger (id, net_profit)
    values (true, 0)
    on conflict (id) do nothing;

    select net_profit into v_net_profit
    from public.pointmine_chest_ledger
    where id = true
    for update;
  end if;

  v_net_profit := coalesce(v_net_profit, 0);

  select exists (
    select 1 from jsonb_array_elements(v_new_inventory) as item
    where item->>'type' = 'pickaxe' and coalesce((item->>'equipped')::boolean, false)
  ) into v_has_equipped;

  select pickaxe.id, pickaxe.name, pickaxe.max_durability, pickaxe.expected_value
  into v_pickaxe_id, v_pickaxe_name, v_pickaxe_durability, v_pickaxe_ev
  from public.pointmine_chest_drops as drop_rate
  join public.pointmine_pickaxes as pickaxe on pickaxe.id = drop_rate.pickaxe_id
  where drop_rate.chest_id = p_chest_id
    and not (p_chest_id = 'premium' and pickaxe.id = 'master')
    and (pickaxe.rarity_rank < 5 or pickaxe.expected_value <= v_net_profit)
  order by -ln(greatest(random(), 0.000000000001)) / drop_rate.weight
  limit 1;

  if v_pickaxe_id is null then
    raise exception '상자 확률 정보가 없습니다.' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_new_inventory) as item
    where item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
  ) into v_is_duplicate;

  if v_is_duplicate then
    select coalesce(jsonb_agg(
      case when item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
        then item || jsonb_build_object(
          'durability', coalesce((item->>'durability')::integer, 0) + v_pickaxe_durability,
          'maxDurability', coalesce((item->>'maxDurability')::integer, v_pickaxe_durability) + v_pickaxe_durability
        )
        else item end
      order by ordinal
    ), '[]'::jsonb)
    into v_new_inventory
    from jsonb_array_elements(v_new_inventory) with ordinality as items(item, ordinal);
  else
    v_new_inventory := v_new_inventory || jsonb_build_array(jsonb_build_object(
      'type', 'pickaxe', 'id', v_pickaxe_id,
      'durability', v_pickaxe_durability, 'maxDurability', v_pickaxe_durability,
      'equipped', not v_has_equipped
    ));
  end if;

  if p_chest_id = 'normal' then
    update public.users set inventory = v_new_inventory, vip_last_normal_free = v_today where auth_user_id = v_uid;
  else
    update public.users set inventory = v_new_inventory, vip_last_premium_free = v_today where auth_user_id = v_uid;
  end if;

  update public.pointmine_chest_ledger
  set net_profit = v_net_profit - v_pickaxe_ev
  where id = true;

  insert into public.pointmine_chest_openings
    (auth_user_id, chest_id, pickaxe_id, price, lk_company_share, iktebot_share,
     lotto_fund_share, net_profit, opening_source)
  values
    (v_uid, p_chest_id, v_pickaxe_id, 0, 0, 0, 0, -v_pickaxe_ev, 'coupon');

  perform public.send_kakao_notification(
    '[ 포인트 광산 알림 ]' || E'\n' ||
    '✅ ' || v_nickname || '님이 VIP 무료 혜택으로 ' || v_chest_name || '를 열었습니다.' || E'\n' ||
    '⛏️ 획득 곡괭이: ' || v_pickaxe_name
  );

  return jsonb_build_object(
    'status', 'success',
    'chest_id', p_chest_id,
    'count', 1,
    'results', jsonb_build_array(jsonb_build_object(
      'pickaxe_id', v_pickaxe_id,
      'pickaxe_name', v_pickaxe_name,
      'durability', v_pickaxe_durability,
      'is_duplicate', v_is_duplicate
    )),
    'inventory', v_new_inventory
  );
end;
$$;

-- 4) 일일 정비 재정의: self_repair(내구도 +1) + VIP 일일 마나 5 지급
create or replace function public.apply_daily_upkeep()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inventory jsonb;
  v_new_inventory jsonb;
  v_mana bigint;
  v_expires timestamptz;
  v_last_mana date;
  v_today text := to_char((now() at time zone 'Asia/Seoul'), 'YYYY-MM-DD');
  v_today_date date := (now() at time zone 'Asia/Seoul')::date;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select inventory, mana, vip_expires_at, vip_last_mana
  into v_inventory, v_mana, v_expires, v_last_mana
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  -- 자가 복원: self_repair 곡괭이 내구도 하루 1 회복
  select coalesce(jsonb_agg(
    case
      when item->>'type' = 'pickaxe'
        and coalesce((item->'enchants'->>'self_repair')::int, 0) >= 1
        and coalesce(item->>'lastUpkeep', '') <> v_today
      then item || jsonb_build_object(
        'durability', least(coalesce((item->>'maxDurability')::int, 0), coalesce((item->>'durability')::int, 0) + 1),
        'lastUpkeep', v_today
      )
      else item
    end
    order by ordinal
  ), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);

  if v_new_inventory is distinct from v_inventory then
    update public.users set inventory = v_new_inventory where auth_user_id = v_uid;
  end if;

  -- VIP 일일 마나 5 지급 (KST 자정 기준 하루 1회)
  if v_expires is not null and v_expires > now()
     and (v_last_mana is null or v_last_mana < v_today_date) then
    update public.users
    set mana = coalesce(mana, 0) + 5,
        vip_last_mana = v_today_date
    where auth_user_id = v_uid
    returning mana into v_mana;
  end if;

  return jsonb_build_object(
    'status', 'success',
    'inventory', v_new_inventory,
    'mana', v_mana
  );
end;
$$;

-- 5) 단일 상자 개봉 재정의: VIP 5% 할인 적용
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
  v_vip_expires_at timestamptz;
  v_price bigint;
  v_paid bigint;
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
  from public.pointmine_chests where id = p_chest_id;
  if not found then
    return jsonb_build_object('status', 'invalid_chest');
  end if;

  select balance, inventory, nickname, vip_expires_at
  into v_user_balance, v_inventory, v_nickname, v_vip_expires_at
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  -- VIP면 5% 할인된 금액을 지불
  if v_vip_expires_at is not null and v_vip_expires_at > now() then
    v_paid := v_price - (v_price * 5) / 100;
  else
    v_paid := v_price;
  end if;

  if coalesce(v_user_balance, 0) < v_paid then
    return jsonb_build_object('status', 'insufficient_balance');
  end if;

  perform 1 from public.companies where name = '엘케이컴퍼니' for update;
  if not found then return jsonb_build_object('status', 'company_not_found'); end if;
  perform 1 from public.companies where name = '익테봇' for update;
  if not found then return jsonb_build_object('status', 'company_not_found'); end if;
  perform 1 from public.users where nickname = '로또기금' for update;
  if not found then return jsonb_build_object('status', 'company_not_found'); end if;

  -- 정수 포인트에서도 두 1% 몫이 동일하도록 반올림하고, 엘케이컴퍼니가 나머지를 받습니다.
  v_iktebot_share := round(v_paid::numeric / 100)::bigint;
  v_lotto_fund_share := v_iktebot_share;
  v_lk_company_share := v_paid - v_iktebot_share - v_lotto_fund_share;
  v_net_revenue := v_paid - v_iktebot_share - v_lotto_fund_share;

  select net_profit into v_net_profit
  from public.pointmine_chest_ledger where id = true for update;
  if not found then
    insert into public.pointmine_chest_ledger (id, net_profit) values (true, 0) on conflict (id) do nothing;
    v_net_profit := 0;
  end if;

  v_available := coalesce(v_net_profit, 0) + v_net_revenue;

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
    select 1 from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
  ) into v_is_duplicate;

  select exists (
    select 1 from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'pickaxe' and coalesce((item->>'equipped')::boolean, false)
  ) into v_has_equipped;

  if v_is_duplicate then
    select coalesce(jsonb_agg(
      case when item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
        then item || jsonb_build_object(
          'durability', coalesce((item->>'durability')::integer, 0) + v_pickaxe_durability,
          'maxDurability', coalesce((item->>'maxDurability')::integer, v_pickaxe_durability) + v_pickaxe_durability
        )
        else item end
      order by ordinal
    ), '[]'::jsonb)
    into v_new_inventory
    from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);
  else
    v_new_inventory := v_inventory || jsonb_build_array(jsonb_build_object(
      'type', 'pickaxe', 'id', v_pickaxe_id,
      'durability', v_pickaxe_durability, 'maxDurability', v_pickaxe_durability,
      'equipped', not v_has_equipped
    ));
  end if;

  update public.users
  set balance = balance - v_paid, inventory = v_new_inventory
  where auth_user_id = v_uid
  returning balance into v_new_balance;

  update public.companies set balance = coalesce(balance, 0) + v_lk_company_share where name = '엘케이컴퍼니';
  update public.companies set balance = coalesce(balance, 0) + v_iktebot_share where name = '익테봇';
  update public.users set balance = coalesce(balance, 0) + v_lotto_fund_share where nickname = '로또기금';

  update public.pointmine_chest_ledger set net_profit = v_available - v_pickaxe_ev where id = true;

  insert into public.pointmine_chest_openings
    (auth_user_id, chest_id, pickaxe_id, price, lk_company_share, iktebot_share, lotto_fund_share, net_profit)
  values
    (v_uid, p_chest_id, v_pickaxe_id, v_paid, v_lk_company_share, v_iktebot_share, v_lotto_fund_share, v_net_revenue - v_pickaxe_ev);

  perform public.send_kakao_notification(
    '[ 포인트 광산 구매 ]' || E'\n' ||
    '✅ ' || coalesce(v_nickname, '광부') || '님이 ' || to_char(v_paid, 'FM9,999,999,999') || ' P를 소모해 ' || v_chest_name || '를 구매했습니다.' || E'\n' ||
    '⛏️ 획득 곡괭이: ' || v_pickaxe_name || E'\n' ||
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

-- 6) 일괄 상자 개봉 재정의: VIP 10% 할인 및 VIP 전용 10개 구매 적용
create or replace function public.open_pickaxe_chest_bulk(p_chest_id text, p_count integer)
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
  v_user_balance numeric;
  v_new_balance numeric;
  v_vip_expires_at timestamptz;
  v_price bigint;
  v_paid bigint;
  v_total_price bigint;
  v_lk_company_share bigint;
  v_iktebot_share bigint;
  v_lotto_fund_share bigint;
  v_net_revenue bigint;
  v_net_profit numeric(20, 4);
  v_available numeric(20, 4);
  v_count integer;
  v_i integer;
  v_pickaxe_id text;
  v_pickaxe_name text;
  v_pickaxe_durability integer;
  v_pickaxe_ev numeric(14, 4);
  v_is_duplicate boolean;
  v_has_equipped boolean;
  v_reward_names text[] := '{}'::text[];
  v_results jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  v_count := p_count;
  if v_count is null or v_count < 1 or v_count > 10 then
    return jsonb_build_object('status', 'invalid_count');
  end if;

  select price, name into v_price, v_chest_name
  from public.pointmine_chests where id = p_chest_id;
  if not found then
    return jsonb_build_object('status', 'invalid_chest');
  end if;

  select balance, inventory, nickname, vip_expires_at
  into v_user_balance, v_inventory, v_nickname, v_vip_expires_at
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  if v_count = 10 and (v_vip_expires_at is null or v_vip_expires_at <= now()) then
    return jsonb_build_object('status', 'vip_required');
  end if;

  -- VIP면 상자 1개당 10% 할인
  if v_vip_expires_at is not null and v_vip_expires_at > now() then
    v_paid := v_price - (v_price * 10) / 100;
  else
    v_paid := v_price;
  end if;
  v_total_price := v_paid * v_count;

  if coalesce(v_user_balance, 0) < v_total_price then
    return jsonb_build_object('status', 'insufficient_balance');
  end if;

  perform 1 from public.companies where name = '엘케이컴퍼니' for update;
  if not found then return jsonb_build_object('status', 'company_not_found'); end if;
  perform 1 from public.companies where name = '익테봇' for update;
  if not found then return jsonb_build_object('status', 'company_not_found'); end if;
  perform 1 from public.users where nickname = '로또기금' for update;
  if not found then return jsonb_build_object('status', 'company_not_found'); end if;

  -- 정수 포인트에서도 두 1% 몫이 동일하도록 반올림하고, 엘케이컴퍼니가 나머지를 받습니다.
  v_iktebot_share := round(v_paid::numeric / 100)::bigint;
  v_lotto_fund_share := v_iktebot_share;
  v_lk_company_share := v_paid - v_iktebot_share - v_lotto_fund_share;
  v_net_revenue := v_paid - v_iktebot_share - v_lotto_fund_share;

  if jsonb_typeof(v_inventory) <> 'array' then
    v_inventory := '[]'::jsonb;
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'pickaxe' and coalesce((item->>'equipped')::boolean, false)
  ) into v_has_equipped;

  select net_profit into v_net_profit
  from public.pointmine_chest_ledger where id = true for update;
  if not found then
    insert into public.pointmine_chest_ledger (id, net_profit) values (true, 0) on conflict (id) do nothing;
    v_net_profit := 0;
  end if;

  for v_i in 1..v_count loop
    v_available := coalesce(v_net_profit, 0) + v_net_revenue;

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

    v_net_profit := v_available - v_pickaxe_ev;

    select exists (
      select 1 from jsonb_array_elements(v_inventory) as item
      where item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
    ) into v_is_duplicate;

    if v_is_duplicate then
      select coalesce(jsonb_agg(
        case when item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
          then item || jsonb_build_object(
            'durability', coalesce((item->>'durability')::integer, 0) + v_pickaxe_durability,
            'maxDurability', coalesce((item->>'maxDurability')::integer, v_pickaxe_durability) + v_pickaxe_durability
          )
          else item end
        order by ordinal
      ), '[]'::jsonb)
      into v_inventory
      from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);
    else
      v_inventory := v_inventory || jsonb_build_array(jsonb_build_object(
        'type', 'pickaxe', 'id', v_pickaxe_id,
        'durability', v_pickaxe_durability, 'maxDurability', v_pickaxe_durability,
        'equipped', not v_has_equipped
      ));
      v_has_equipped := true;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'pickaxe_id', v_pickaxe_id, 'pickaxe_name', v_pickaxe_name,
      'durability', v_pickaxe_durability, 'is_duplicate', v_is_duplicate
    ));
    v_reward_names := array_append(v_reward_names, v_pickaxe_name);

    insert into public.pointmine_chest_openings
      (auth_user_id, chest_id, pickaxe_id, price, lk_company_share, iktebot_share, lotto_fund_share, net_profit)
    values
      (v_uid, p_chest_id, v_pickaxe_id, v_paid, v_lk_company_share, v_iktebot_share, v_lotto_fund_share, v_net_revenue - v_pickaxe_ev);
  end loop;

  update public.pointmine_chest_ledger set net_profit = v_net_profit where id = true;

  update public.users
  set balance = balance - v_total_price, inventory = v_inventory
  where auth_user_id = v_uid
  returning balance into v_new_balance;

  update public.companies set balance = coalesce(balance, 0) + v_lk_company_share * v_count where name = '엘케이컴퍼니';
  update public.companies set balance = coalesce(balance, 0) + v_iktebot_share * v_count where name = '익테봇';
  update public.users set balance = coalesce(balance, 0) + v_lotto_fund_share * v_count where nickname = '로또기금';

  perform public.send_kakao_notification(
    '[ 포인트 광산 구매 ]' || E'\n' ||
    '✅ ' || coalesce(v_nickname, '광부') || '님이 ' || to_char(v_total_price, 'FM9,999,999,999') || ' P를 소모해 ' || v_chest_name || ' ' || v_count || '개를 구매했습니다.' || E'\n' ||
    '⛏️ 획득 곡괭이:' || E'\n- ' || array_to_string(v_reward_names, E'\n- ') || E'\n' ||
    '💰 잔액: ' || to_char(v_new_balance, 'FM9,999,999,999') || ' P' || E'\n\n' ||
    '[ 포인트 분배 ]' || E'\n' ||
    '- 로또기금: ' || to_char(v_lotto_fund_share * v_count, 'FM9,999,999,999') || ' P' || E'\n' ||
    '- 익테봇: ' || to_char(v_iktebot_share * v_count, 'FM9,999,999,999') || ' P' || E'\n' ||
    '- 엘케이컴퍼니: ' || to_char(v_lk_company_share * v_count, 'FM9,999,999,999') || ' P'
  );

  return jsonb_build_object(
    'status', 'success',
    'chest_id', p_chest_id,
    'count', v_count,
    'results', v_results,
    'balance', v_new_balance,
    'inventory', v_inventory
  );
end;
$$;

revoke all on function public.purchase_vip_ticket() from public, anon;
revoke all on function public.open_free_vip_chest(text) from public, anon;
revoke all on function public.apply_daily_upkeep() from public, anon;
revoke all on function public.open_pickaxe_chest(text) from public, anon;
revoke all on function public.open_pickaxe_chest_bulk(text, integer) from public, anon;

grant execute on function public.purchase_vip_ticket() to authenticated;
grant execute on function public.open_free_vip_chest(text) to authenticated;
grant execute on function public.apply_daily_upkeep() to authenticated;
grant execute on function public.open_pickaxe_chest(text) to authenticated;
grant execute on function public.open_pickaxe_chest_bulk(text, integer) to authenticated;

comment on column public.users.vip_expires_at is 'VIP 티켓 만료 시각(없거나 과거면 비VIP)';
comment on function public.purchase_vip_ticket() is '3,000P로 VIP 7일을 구매(연장)하고 카카오 알림을 보내는 함수';
comment on function public.open_free_vip_chest(text) is 'VIP 전용 일일 무료 상자 개봉(일반·고급 각 1회/일, 쿠폰과 동일한 원장·지급 제한 적용)';

commit;
