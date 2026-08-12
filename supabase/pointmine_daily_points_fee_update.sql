-- 어빌리티 스톤의 "곡괭이 보유 시 매일 포인트" 효과를 엘케이컴퍼니 부담 정산으로 처리합니다.
-- pointmine_ability_stone_faceting_update.sql 적용 후 실행합니다.

create or replace function public.apply_daily_upkeep()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text;
  v_inventory jsonb;
  v_new_inventory jsonb := '[]'::jsonb;
  v_item jsonb;
  v_updated_item jsonb;
  v_pickaxe_id text;
  v_durability integer;
  v_max_durability integer;
  v_repair_chance numeric;
  v_damage_chance numeric;
  v_pickaxe_points_gain bigint;
  v_points_gain bigint := 0;
  v_points_reward_count bigint := 0;
  v_iktebot_fee bigint := 0;
  v_lotto_fee bigint := 0;
  v_company_charge bigint := 0;
  v_stone_mana_gain bigint := 0;
  v_vip_mana_gain bigint := 0;
  v_mana bigint;
  v_balance numeric;
  v_company_balance numeric;
  v_expires timestamptz;
  v_last_mana date;
  v_today text := to_char((now() at time zone 'Asia/Seoul'), 'YYYY-MM-DD');
  v_today_date date := (now() at time zone 'Asia/Seoul')::date;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select nickname, inventory, mana, balance, vip_expires_at, vip_last_mana
  into v_nickname, v_inventory, v_mana, v_balance, v_expires, v_last_mana
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  for v_item in select value from jsonb_array_elements(v_inventory) loop
    v_updated_item := v_item;

    if v_item->>'type' = 'pickaxe' then
      v_pickaxe_id := v_item->>'id';
      v_durability := coalesce((v_item->>'durability')::integer, 0);
      v_max_durability := coalesce((v_item->>'maxDurability')::integer, 0);

      if coalesce((v_item->'enchants'->>'self_repair')::integer, 0) >= 1
         and coalesce(v_item->>'lastUpkeep', '') <> v_today then
        v_durability := least(v_max_durability, v_durability + 1);
        v_updated_item := v_updated_item || jsonb_build_object('durability', v_durability, 'lastUpkeep', v_today);
      end if;

      if coalesce(v_item->>'abilityStoneUid', '') <> ''
         and coalesce(v_item->>'lastAbilityStoneUpkeep', '') <> v_today then
        v_repair_chance := public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'daily_repair_chance');
        v_damage_chance := public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'daily_damage_chance');
        v_stone_mana_gain := v_stone_mana_gain + greatest(0, public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'daily_mana')::bigint);

        if random() < least(1.0, greatest(0, v_repair_chance)::double precision / 100) then
          v_durability := least(v_max_durability, v_durability + 1);
        end if;
        if random() < least(1.0, greatest(0, v_damage_chance)::double precision / 100) then
          v_durability := greatest(0, v_durability - 1);
        end if;

        v_updated_item := v_updated_item || jsonb_build_object(
          'durability', v_durability,
          'equipped', case when v_durability <= 0 then false else coalesce((v_updated_item->>'equipped')::boolean, false) end,
          'lastAbilityStoneUpkeep', v_today
        );
      end if;

      -- 일일 포인트는 곡괭이별 전용 마커로 정산합니다. 각인 시 lastDailyPointsUpkeep이 당일로 찍히므로
      -- 장착 당일에는 지급되지 않고, 스톤을 다른 곡괭이로 옮겨 껴도 중복 지급되지 않습니다.
      if coalesce(v_item->>'abilityStoneUid', '') <> ''
         and coalesce(v_item->>'lastDailyPointsUpkeep', '') <> v_today then
        v_pickaxe_points_gain := greatest(0, public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'daily_points')::bigint);
        if v_pickaxe_points_gain > 0 then
          v_points_gain := v_points_gain + v_pickaxe_points_gain;
          v_points_reward_count := v_points_reward_count + 1;
        end if;
        v_updated_item := v_updated_item || jsonb_build_object('lastDailyPointsUpkeep', v_today);
      end if;
    end if;

    v_new_inventory := v_new_inventory || jsonb_build_array(v_updated_item);
  end loop;

  if v_expires is not null and v_expires > now()
     and (v_last_mana is null or v_last_mana < v_today_date) then
    v_vip_mana_gain := 5;
  end if;

  if v_points_gain > 0 then
    v_iktebot_fee := v_points_reward_count;
    v_lotto_fee := v_points_reward_count;
    v_company_charge := v_points_gain + v_iktebot_fee + v_lotto_fee;

    select balance
    into v_company_balance
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

    if coalesce(v_company_balance, 0) < v_company_charge then
      return jsonb_build_object(
        'status', 'company_insufficient',
        'required_points', v_company_charge,
        'company_balance', coalesce(v_company_balance, 0)
      );
    end if;
  end if;

  update public.users
  set inventory = v_new_inventory,
      balance = coalesce(balance, 0) + v_points_gain,
      mana = coalesce(mana, 0) + v_stone_mana_gain + v_vip_mana_gain,
      vip_last_mana = case when v_vip_mana_gain > 0 then v_today_date else vip_last_mana end
  where auth_user_id = v_uid
  returning mana, balance into v_mana, v_balance;

  if v_points_gain > 0 then
    update public.companies set balance = coalesce(balance, 0) - v_company_charge where name = '엘케이컴퍼니';
    update public.companies set balance = coalesce(balance, 0) + v_iktebot_fee where name = '익테봇';
    update public.users set balance = coalesce(balance, 0) + v_lotto_fee where nickname = '로또기금';

    perform public.send_kakao_notification(
      '[ 포인트 광산 일일 포인트 ]' || E'\n' ||
      '✅ ' || coalesce(v_nickname, '광부') || '님이 어빌리티 스톤 효과로 ' || to_char(v_points_gain, 'FM9,999,999,999') || ' P를 획득했습니다.' || E'\n' ||
      '💰 잔액: ' || to_char(v_balance, 'FM9,999,999,999') || ' P' || E'\n\n' ||
      '[ 엘케이컴퍼니 부담 ]' || E'\n' ||
      '- 사용자 지급: ' || to_char(v_points_gain, 'FM9,999,999,999') || ' P' || E'\n' ||
      '- 로또기금 수수료: ' || to_char(v_lotto_fee, 'FM9,999,999,999') || ' P' || E'\n' ||
      '- 익테봇 수수료: ' || to_char(v_iktebot_fee, 'FM9,999,999,999') || ' P' || E'\n' ||
      '- 엘케이컴퍼니 차감: ' || to_char(v_company_charge, 'FM9,999,999,999') || ' P'
    );
  end if;

  return jsonb_build_object(
    'status', 'success',
    'inventory', v_new_inventory,
    'mana', v_mana,
    'balance', v_balance,
    'gained_mana', v_stone_mana_gain + v_vip_mana_gain,
    'gained_points', v_points_gain,
    'daily_points_company_charge', v_company_charge,
    'daily_points_iktebot_fee', v_iktebot_fee,
    'daily_points_lotto_fee', v_lotto_fee
  );
end;
$$;

revoke all on function public.apply_daily_upkeep() from public, anon;
grant execute on function public.apply_daily_upkeep() to authenticated;

comment on function public.apply_daily_upkeep() is
  '자가 복원, VIP 마나, 어빌리티 스톤 일일 효과를 처리하며 daily_points는 엘케이컴퍼니 부담과 1P+1P 수수료로 정산한다';
