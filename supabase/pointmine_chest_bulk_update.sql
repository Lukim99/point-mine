-- 상자 여러 개(기본 5개)를 한 번에 구매·개봉
-- pointmine_chest_profit_update.sql, pointmine_kakao_notify_update.sql 적용 후 실행합니다.
--
-- 단일 개봉(open_pickaxe_chest)과 동일한 규칙(순이익 원장, 황금 이상 지급 제한, 수수료 분배)을
-- p_count회 반복하며, 카카오 알림은 1건으로 요약해 전송합니다.

begin;

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
  v_price bigint;
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

  v_total_price := v_price * v_count;

  if coalesce(v_user_balance, 0) < v_total_price then
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

  -- 상자 1개당 수수료 분배와 순매출
  v_lk_company_share := (v_price * 98) / 100;
  v_iktebot_share := v_price / 100;
  v_lotto_fund_share := v_price - v_lk_company_share - v_iktebot_share;
  v_net_revenue := v_price - v_iktebot_share - v_lotto_fund_share;

  if jsonb_typeof(v_inventory) <> 'array' then
    v_inventory := '[]'::jsonb;
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'pickaxe' and coalesce((item->>'equipped')::boolean, false)
  ) into v_has_equipped;

  -- 순이익 원장 잠금 (반복 동안 유지)
  select net_profit into v_net_profit
  from public.pointmine_chest_ledger
  where id = true
  for update;

  if not found then
    insert into public.pointmine_chest_ledger (id, net_profit) values (true, 0)
    on conflict (id) do nothing;
    v_net_profit := 0;
  end if;

  for v_i in 1..v_count loop
    v_available := coalesce(v_net_profit, 0) + v_net_revenue;

    -- 곡괭이 추첨 (마스터 제외, 황금 이상은 순이익 이상일 때만)
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

    -- 순이익 누적 (메모리 변수; 원장은 반복 종료 후 1회 기록)
    v_net_profit := v_available - v_pickaxe_ev;

    select exists (
      select 1 from jsonb_array_elements(v_inventory) as item
      where item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
    ) into v_is_duplicate;

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
      into v_inventory
      from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);
    else
      v_inventory := v_inventory || jsonb_build_array(jsonb_build_object(
        'type', 'pickaxe',
        'id', v_pickaxe_id,
        'durability', v_pickaxe_durability,
        'maxDurability', v_pickaxe_durability,
        'equipped', not v_has_equipped
      ));
      v_has_equipped := true;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'pickaxe_id', v_pickaxe_id,
      'pickaxe_name', v_pickaxe_name,
      'durability', v_pickaxe_durability,
      'is_duplicate', v_is_duplicate
    ));
    v_reward_names := array_append(v_reward_names, v_pickaxe_name);

    insert into public.pointmine_chest_openings
      (auth_user_id, chest_id, pickaxe_id, price, lk_company_share, iktebot_share, lotto_fund_share, net_profit)
    values
      (v_uid, p_chest_id, v_pickaxe_id, v_price, v_lk_company_share, v_iktebot_share, v_lotto_fund_share, v_net_revenue - v_pickaxe_ev);
  end loop;

  -- 원장에 최종 누적 순이익 기록
  update public.pointmine_chest_ledger
  set net_profit = v_net_profit
  where id = true;

  update public.users
  set balance = balance - v_total_price,
      inventory = v_inventory
  where auth_user_id = v_uid
  returning balance into v_new_balance;

  update public.companies
  set balance = coalesce(balance, 0) + v_lk_company_share * v_count
  where name = '엘케이컴퍼니';

  update public.companies
  set balance = coalesce(balance, 0) + v_iktebot_share * v_count
  where name = '익테봇';

  update public.users
  set balance = coalesce(balance, 0) + v_lotto_fund_share * v_count
  where nickname = '로또기금';

  -- 구매 카카오 알림 (요약 1건)
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

revoke all on function public.open_pickaxe_chest_bulk(text, integer) from public, anon;
grant execute on function public.open_pickaxe_chest_bulk(text, integer) to authenticated;

comment on function public.open_pickaxe_chest_bulk(text, integer) is
  '상자 p_count개를 한 번에 구매·개봉하는 함수 (순이익 원장·황금 제한·수수료 규칙 동일, 카카오 요약 1건)';

commit;
