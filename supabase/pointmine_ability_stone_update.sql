-- 어빌리티 스톤 시스템
-- pointmine_vip_update.sql 적용 후 Supabase SQL Editor에서 전체 스크립트를 실행합니다.

begin;

create extension if not exists pgcrypto with schema extensions;

-- 옵션 하나를 등급 가중치와 티어 확률에 따라 생성합니다.
create or replace function public.pointmine_roll_ability_stone_option(
  p_sign text,
  p_excluded_ids text[]
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id text;
  v_name text;
  v_effect_id text;
  v_unit text;
  v_rarity text;
  v_values numeric[];
  v_effect_values numeric[];
  v_tier integer;
  v_roll double precision := random();
begin
  select option_id, option_name, effect_id, unit, rarity, display_values, effect_values
  into v_id, v_name, v_effect_id, v_unit, v_rarity, v_values, v_effect_values
  from (values
    ('extra_mineral_chance', '광물 1개 더 채굴할 확률', 'positive', 'extra_mineral_chance', '%', 'normal', array[1, 3, 7, 15]::numeric[], array[1, 3, 7, 15]::numeric[]),
    ('xp_gain', '경험치 획득', 'positive', 'xp_gain', '', 'common', array[1, 2, 4, 10]::numeric[], array[1, 2, 4, 10]::numeric[]),
    ('attack_up', '공격력', 'positive', 'attack', '', 'normal', array[1, 2, 4, 10]::numeric[], array[1, 2, 4, 10]::numeric[]),
    ('mineral_value_up', '이 곡괭이로 캔 광물 가치', 'positive', 'mineral_value', '', 'rare', array[1, 2, 3, 4]::numeric[], array[1, 2, 3, 4]::numeric[]),
    ('daily_repair_chance', '매일 내구도 1 수리 확률', 'positive', 'daily_repair_chance', '%', 'normal', array[5, 10, 20, 50]::numeric[], array[5, 10, 20, 50]::numeric[]),
    ('enchant_mana_cost_down', '마법 부여 마나 소모', 'positive', 'enchant_mana_cost', '', 'normal', array[-1, -2, -3, -4]::numeric[], array[-1, -2, -3, -4]::numeric[]),
    ('monster_reward_chance_up', '몬스터 보상 획득 확률', 'positive', 'monster_reward_chance', '%', 'normal', array[5, 8, 11, 20]::numeric[], array[5, 8, 11, 20]::numeric[]),
    ('daily_points', '곡괭이 보유 시 매일 포인트', 'positive', 'daily_points', '', 'rare', array[5, 10, 20, 50]::numeric[], array[5, 10, 20, 50]::numeric[]),
    ('extra_two_mineral_chance', '광물 2개 더 채굴할 확률', 'positive', 'extra_two_mineral_chance', '%', 'rare', array[0.5, 1, 2, 5]::numeric[], array[0.5, 1, 2, 5]::numeric[]),
    ('daily_mana', '곡괭이 보유 시 매일 마나', 'positive', 'daily_mana', '', 'normal', array[1, 2, 3, 5]::numeric[], array[1, 2, 3, 5]::numeric[]),
    ('mine_fail_chance', '광물을 캐지 못할 확률', 'negative', 'mine_fail_chance', '%', 'normal', array[3, 6, 9, 15]::numeric[], array[3, 6, 9, 15]::numeric[]),
    ('durability_cost_up', '내구도 추가 소모', 'negative', 'durability_cost', '', 'normal', array[1, 2, 3, 5]::numeric[], array[1, 2, 3, 5]::numeric[]),
    ('attack_down', '공격력', 'negative', 'attack', '', 'normal', array[-1, -3, -7, -10]::numeric[], array[-1, -3, -7, -10]::numeric[]),
    ('mineral_value_down', '이 곡괭이로 캔 광물 가치', 'negative', 'mineral_value', '', 'normal', array[-1, -2, -3, -4]::numeric[], array[-1, -2, -3, -4]::numeric[]),
    ('enchant_mana_cost_up', '마법 부여 마나 소모', 'negative', 'enchant_mana_cost', '', 'normal', array[1, 2, 3, 5]::numeric[], array[1, 2, 3, 5]::numeric[]),
    ('monster_reward_chance_down', '몬스터 보상 획득 확률', 'negative', 'monster_reward_chance', '%', 'normal', array[-2, -4, -8, -16]::numeric[], array[-2, -4, -8, -16]::numeric[]),
    ('daily_damage_chance', '매일 내구도 1 손상 확률', 'negative', 'daily_damage_chance', '%', 'normal', array[5, 10, 20, 50]::numeric[], array[5, 10, 20, 50]::numeric[])
  ) as options(option_id, option_name, option_sign, effect_id, unit, rarity, display_values, effect_values)
  where option_sign = p_sign
    and not (option_id = any(coalesce(p_excluded_ids, '{}'::text[])))
  order by -ln(greatest(random(), 0.000000000001)) / case rarity
    when 'common' then 1.35
    when 'rare' then 0.35
    else 1.0
  end
  limit 1;

  if v_id is null then
    raise exception '어빌리티 스톤 옵션을 생성할 수 없습니다.' using errcode = 'P0002';
  end if;

  v_tier := case
    when v_roll < 0.55 then 1
    when v_roll < 0.82 then 2
    when v_roll < 0.96 then 3
    else 4
  end;

  return jsonb_build_object(
    'id', v_id,
    'name', v_name,
    'sign', p_sign,
    'effectId', v_effect_id,
    'value', v_values[v_tier],
    'effectValue', v_effect_values[v_tier],
    'unit', v_unit,
    'tier', v_tier,
    'rarity', v_rarity
  );
end;
$$;

-- 긍정 옵션 2개와 부정 옵션 1개를 가진 스톤을 생성합니다.
create or replace function public.pointmine_roll_ability_stone()
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_positive_one jsonb;
  v_positive_two jsonb;
  v_negative jsonb;
begin
  v_positive_one := public.pointmine_roll_ability_stone_option('positive', '{}'::text[]);
  v_positive_two := public.pointmine_roll_ability_stone_option('positive', array[v_positive_one->>'id']);
  v_negative := public.pointmine_roll_ability_stone_option('negative', '{}'::text[]);

  return jsonb_build_object(
    'type', 'ability_stone',
    'uid', replace(extensions.gen_random_uuid()::text, '-', ''),
    'variant', floor(random() * 4)::integer,
    'createdAt', now(),
    'options', jsonb_build_array(v_positive_one, v_positive_two, v_negative)
  );
end;
$$;

-- 곡괭이에 연결된 스톤에서 특정 효과 값을 합산합니다.
create or replace function public.pointmine_ability_stone_effect(
  p_inventory jsonb,
  p_pickaxe_id text,
  p_effect_id text
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(
    case
      when option_item->>'effectValue' ~ '^-?[0-9]+([.][0-9]+)?$'
        then (option_item->>'effectValue')::numeric
      else 0
    end
  ), 0)
  from jsonb_array_elements(
    case when jsonb_typeof(p_inventory) = 'array' then p_inventory else '[]'::jsonb end
  ) as pickaxe(item)
  join lateral jsonb_array_elements(
    case when jsonb_typeof(p_inventory) = 'array' then p_inventory else '[]'::jsonb end
  ) as stone(item) on true
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(stone.item->'options') = 'array' then stone.item->'options' else '[]'::jsonb end
  ) as option_row(option_item)
  where pickaxe.item->>'type' = 'pickaxe'
    and pickaxe.item->>'id' = p_pickaxe_id
    and stone.item->>'type' = 'ability_stone'
    and stone.item->>'uid' = pickaxe.item->>'abilityStoneUid'
    and option_item->>'effectId' = p_effect_id;
$$;

-- 상점에서 100P로 어빌리티 스톤을 구매합니다.
create or replace function public.purchase_ability_stone()
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
  v_inventory jsonb;
  v_stone jsonb;
  v_price constant bigint := 100;
  v_lk_company_share bigint := 98;
  v_iktebot_share bigint := 1;
  v_lotto_fund_share bigint := 1;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select nickname, balance, inventory
  into v_nickname, v_balance, v_inventory
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

  if jsonb_typeof(v_inventory) <> 'array' then
    v_inventory := '[]'::jsonb;
  end if;

  v_stone := public.pointmine_roll_ability_stone();
  v_inventory := v_inventory || jsonb_build_array(v_stone);

  update public.users
  set balance = coalesce(balance, 0) - v_price,
      inventory = v_inventory
  where auth_user_id = v_uid
  returning balance into v_new_balance;

  update public.companies set balance = coalesce(balance, 0) + v_lk_company_share where name = '엘케이컴퍼니';
  update public.companies set balance = coalesce(balance, 0) + v_iktebot_share where name = '익테봇';
  update public.users set balance = coalesce(balance, 0) + v_lotto_fund_share where nickname = '로또기금';

  perform public.send_kakao_notification(
    '[ 포인트 광산 구매 ]' || E'\n' ||
    '✅ ' || coalesce(v_nickname, '광부') || '님이 ' || to_char(v_price, 'FM9,999,999,999') || ' P를 소모해 어빌리티 스톤을 구매했습니다.' || E'\n' ||
    '💰 잔액: ' || to_char(v_new_balance, 'FM9,999,999,999') || ' P' || E'\n\n' ||
    '[ 포인트 분배 ]' || E'\n' ||
    '- 로또기금: ' || to_char(v_lotto_fund_share, 'FM9,999,999,999') || ' P' || E'\n' ||
    '- 익테봇: ' || to_char(v_iktebot_share, 'FM9,999,999,999') || ' P' || E'\n' ||
    '- 엘케이컴퍼니: ' || to_char(v_lk_company_share, 'FM9,999,999,999') || ' P'
  );

  return jsonb_build_object(
    'status', 'success',
    'balance', v_new_balance,
    'inventory', v_inventory,
    'ability_stone', v_stone,
    'lk_company_share', v_lk_company_share,
    'iktebot_share', v_iktebot_share,
    'lotto_fund_share', v_lotto_fund_share
  );
end;
$$;

-- 스톤은 인벤토리에 유지하고 곡괭이에 UID를 연결합니다. 기존 스톤은 자동 교체됩니다.
create or replace function public.engrave_ability_stone(
  p_stone_uid text,
  p_pickaxe_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inventory jsonb;
  v_new_inventory jsonb;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select inventory into v_inventory
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'ability_stone' and item->>'uid' = p_stone_uid
  ) then
    return jsonb_build_object('status', 'stone_not_found');
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'pickaxe' and item->>'id' = p_pickaxe_id
  ) then
    return jsonb_build_object('status', 'pickaxe_not_found');
  end if;

  select coalesce(jsonb_agg(
    case
      when item->>'type' = 'pickaxe' and item->>'id' = p_pickaxe_id
        then item || jsonb_build_object('abilityStoneUid', p_stone_uid)
      when item->>'type' = 'pickaxe' and item->>'abilityStoneUid' = p_stone_uid
        then item - 'abilityStoneUid'
      else item
    end
    order by ordinal
  ), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);

  update public.users set inventory = v_new_inventory where auth_user_id = v_uid;

  return jsonb_build_object('status', 'success', 'inventory', v_new_inventory);
end;
$$;

-- 스톤을 제거하고 마나 1~2를 지급합니다. 각인 중이면 연결도 해제합니다.
create or replace function public.dismantle_ability_stone(p_stone_uid text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inventory jsonb;
  v_new_inventory jsonb;
  v_gain integer := 1 + floor(random() * 2)::integer;
  v_new_mana bigint;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select inventory into v_inventory
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'ability_stone' and item->>'uid' = p_stone_uid
  ) then
    return jsonb_build_object('status', 'stone_not_found');
  end if;

  select coalesce(jsonb_agg(
    case
      when item->>'type' = 'pickaxe' and item->>'abilityStoneUid' = p_stone_uid
        then item - 'abilityStoneUid'
      else item
    end
    order by ordinal
  ), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal)
  where not (item->>'type' = 'ability_stone' and item->>'uid' = p_stone_uid);

  update public.users
  set inventory = v_new_inventory,
      mana = coalesce(mana, 0) + v_gain
  where auth_user_id = v_uid
  returning mana into v_new_mana;

  return jsonb_build_object(
    'status', 'success',
    'gained_mana', v_gain,
    'mana', v_new_mana,
    'inventory', v_new_inventory
  );
end;
$$;

-- 채굴: 기존 마법 부여 + 어빌리티 스톤 효과 + 백금 이상 1% 스톤 드롭
create or replace function public.mine_ore()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inventory jsonb;
  v_new_inventory jsonb;
  v_pickaxe_id text;
  v_pickaxe_rank smallint;
  v_durability integer;
  v_remaining integer;
  v_enchants jsonb;
  v_luck smallint;
  v_miner_eye smallint;
  v_wisdom smallint;
  v_fragile smallint;
  v_unlucky smallint;
  v_double smallint;
  v_stone_extra_one numeric;
  v_stone_extra_two numeric;
  v_stone_xp integer;
  v_stone_durability integer;
  v_stone_fail numeric;
  v_stone_value integer;
  v_dur_cost integer;
  v_mined boolean;
  v_qty integer;
  v_luck_chance double precision;
  v_floor smallint;
  v_experience numeric(40, 0);
  v_new_floor smallint;
  v_new_experience numeric(40, 0);
  v_required_experience numeric(40, 0);
  v_total_experience numeric(40, 0);
  v_xp_gain integer;
  v_floor_up boolean;
  v_unit_points bigint;
  v_ability_stone jsonb := null;
  v_ore public.pointmine_ores%rowtype;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select inventory, mine_floor, mine_experience
  into v_inventory, v_floor, v_experience
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  select item->>'id', coalesce((item->>'durability')::integer, 0), item->'enchants'
  into v_pickaxe_id, v_durability, v_enchants
  from jsonb_array_elements(v_inventory) as item
  where item->>'type' = 'pickaxe' and coalesce((item->>'equipped')::boolean, false)
  limit 1;

  if v_pickaxe_id is null then
    return jsonb_build_object('status', 'no_pickaxe');
  end if;

  v_luck := coalesce((v_enchants->>'luck')::smallint, 0);
  v_miner_eye := coalesce((v_enchants->>'miner_eye')::smallint, 0);
  v_wisdom := coalesce((v_enchants->>'wisdom')::smallint, 0);
  v_fragile := coalesce((v_enchants->>'fragile')::smallint, 0);
  v_unlucky := coalesce((v_enchants->>'unlucky')::smallint, 0);
  v_double := coalesce((v_enchants->>'double_mine')::smallint, 0);
  v_stone_extra_one := public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'extra_mineral_chance');
  v_stone_extra_two := public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'extra_two_mineral_chance');
  v_stone_xp := public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'xp_gain')::integer;
  v_stone_durability := greatest(0, public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'durability_cost')::integer);
  v_stone_fail := public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'mine_fail_chance');
  v_stone_value := public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'mineral_value')::integer;

  v_dur_cost := (1 + v_fragile + v_stone_durability) * (case when v_double > 0 then 2 else 1 end);
  if v_durability < v_dur_cost then
    return jsonb_build_object('status', 'broken_pickaxe');
  end if;

  select rarity_rank into v_pickaxe_rank
  from public.pointmine_pickaxes
  where id = v_pickaxe_id;

  select ore.* into v_ore
  from public.pointmine_ores as ore
  where (
    ore.exact_pickaxe_id = v_pickaxe_id
    or (
      ore.exact_pickaxe_id is null
      and v_pickaxe_rank >= ore.min_pickaxe_rank
      and (ore.blocked_pickaxe_id is null or ore.blocked_pickaxe_id <> v_pickaxe_id)
    )
  )
    and (v_floor < 20 or ore.id <> 'stone' or v_pickaxe_id = 'wood')
  order by -ln(greatest(random(), 0.000000000001)) / (
    ore.rarity_weight
    * power(0.9::double precision, power(greatest(v_pickaxe_rank - coalesce(ore.min_pickaxe_rank, v_pickaxe_rank), 0)::double precision, 2))
    * (1 + ((v_floor - 1) * ore.rarity_rank * 0.0005::double precision))
    * (1 + (v_miner_eye * 0.01::double precision * ore.rarity_rank))
  )
  limit 1;

  v_remaining := greatest(0, v_durability - v_dur_cost);
  v_mined := random() >= least(1.0, ((v_unlucky * 5) + v_stone_fail)::double precision / 100);
  v_qty := 0;

  if v_mined then
    v_qty := case when v_double > 0 then 2 else 1 end;
    v_luck_chance := case v_luck when 1 then 0.05 when 2 then 0.13 else 0 end;
    if random() < least(1.0, v_luck_chance + v_stone_extra_one::double precision / 100) then
      v_qty := v_qty + 1;
    end if;
    if random() < least(1.0, v_stone_extra_two::double precision / 100) then
      v_qty := v_qty + 2;
    end if;
  end if;

  v_xp_gain := case when v_floor < 100 and v_mined then v_pickaxe_rank + 1 + v_wisdom + v_stone_xp else 0 end;
  v_new_floor := v_floor;
  v_new_experience := v_experience;

  if v_floor < 100 then
    v_required_experience := 100 * power(2::numeric, v_floor - 1);
    v_total_experience := v_experience + v_xp_gain;
    if v_total_experience >= v_required_experience then
      v_new_floor := least(100, v_floor + 1);
      v_new_experience := case when v_new_floor >= 100 then 0 else v_total_experience - v_required_experience end;
    else
      v_new_experience := v_total_experience;
    end if;
  end if;

  v_floor_up := v_new_floor > v_floor;
  v_unit_points := greatest(0, v_ore.sell_price + v_stone_value);

  select coalesce(jsonb_agg(
    case
      when item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
        then item || jsonb_build_object('durability', v_remaining, 'equipped', v_remaining > 0)
      else item
    end
    order by ordinal
  ), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);

  if v_qty > 0 then
    if exists (
      select 1 from jsonb_array_elements(v_new_inventory) as item
      where item->>'type' = 'mineral'
        and item->>'id' = v_ore.id
        and (
          case when item->>'unitPoints' ~ '^[0-9]+$'
            then (item->>'unitPoints')::bigint
            else v_ore.sell_price
          end
        ) = v_unit_points
    ) then
      select coalesce(jsonb_agg(
        case
          when item->>'type' = 'mineral'
            and item->>'id' = v_ore.id
            and (
              case when item->>'unitPoints' ~ '^[0-9]+$'
                then (item->>'unitPoints')::bigint
                else v_ore.sell_price
              end
            ) = v_unit_points
          then item || jsonb_build_object(
            'quantity', coalesce((item->>'quantity')::integer, 0) + v_qty,
            'unitPoints', v_unit_points
          )
          else item
        end
        order by ordinal
      ), '[]'::jsonb)
      into v_new_inventory
      from jsonb_array_elements(v_new_inventory) with ordinality as items(item, ordinal);
    else
      v_new_inventory := v_new_inventory || jsonb_build_array(jsonb_build_object(
        'type', 'mineral',
        'id', v_ore.id,
        'quantity', v_qty,
        'unitPoints', v_unit_points
      ));
    end if;
  end if;

  if v_pickaxe_rank >= 7 and random() < 0.01 then
    v_ability_stone := public.pointmine_roll_ability_stone();
    v_new_inventory := v_new_inventory || jsonb_build_array(v_ability_stone);
  end if;

  update public.users
  set inventory = v_new_inventory,
      mine_floor = v_new_floor,
      mine_experience = v_new_experience
  where auth_user_id = v_uid;

  return jsonb_build_object(
    'status', 'success',
    'ore_id', v_ore.id,
    'ore_name', v_ore.name,
    'points', v_unit_points * v_qty,
    'mined', v_mined,
    'quantity', v_qty,
    'remaining_durability', v_remaining,
    'inventory', v_new_inventory,
    'xp_gained', v_xp_gain,
    'mine_floor', v_new_floor,
    'mine_experience', v_new_experience::text,
    'required_experience', case when v_new_floor >= 100 then '0' else (100 * power(2::numeric, v_new_floor - 1))::text end,
    'floor_up', v_floor_up,
    'ability_stone', v_ability_stone
  );
end;
$$;

-- 수리: 가치가 다른 동일 광물 묶음에서도 필요한 수량만 정확히 차감합니다.
create or replace function public.repair_pickaxe(p_pickaxe_id text, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inventory jsonb;
  v_new_inventory jsonb;
  v_rebuilt_inventory jsonb;
  v_durability integer;
  v_max_durability integer;
  v_missing integer;
  v_available integer;
  v_required integer;
  v_remaining_required integer;
  v_item_quantity integer;
  v_destroyer smallint;
  v_failed boolean;
  v_cost record;
  v_item jsonb;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  if p_pickaxe_id = 'wood' then
    return jsonb_build_object('status', 'not_repairable');
  end if;

  select inventory into v_inventory
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  select coalesce((item->>'durability')::integer, 0),
         coalesce((item->>'maxDurability')::integer, 0),
         coalesce((item->'enchants'->>'destroyer')::smallint, 0)
  into v_durability, v_max_durability, v_destroyer
  from jsonb_array_elements(v_inventory) as item
  where item->>'type' = 'pickaxe' and item->>'id' = p_pickaxe_id
  limit 1;

  if not found then return jsonb_build_object('status', 'pickaxe_not_found'); end if;

  v_missing := greatest(v_max_durability - v_durability, 0);
  if v_missing = 0 then return jsonb_build_object('status', 'no_damage'); end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_missing then
    return jsonb_build_object('status', 'invalid_amount');
  end if;
  if not exists (select 1 from public.pointmine_repair_costs where pickaxe_id = p_pickaxe_id) then
    return jsonb_build_object('status', 'not_repairable');
  end if;

  for v_cost in
    select ore_id, quantity_per_durability
    from public.pointmine_repair_costs
    where pickaxe_id = p_pickaxe_id
    order by ore_id
  loop
    v_required := v_cost.quantity_per_durability * p_amount;
    select coalesce(sum(
      case when item->>'quantity' ~ '^[0-9]+$' then (item->>'quantity')::integer else 0 end
    ), 0)::integer
    into v_available
    from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'mineral' and item->>'id' = v_cost.ore_id;

    if v_available < v_required then
      return jsonb_build_object(
        'status', 'insufficient_materials',
        'ore_id', v_cost.ore_id,
        'required', v_required,
        'available', v_available
      );
    end if;
  end loop;

  v_new_inventory := v_inventory;

  for v_cost in
    select ore_id, quantity_per_durability
    from public.pointmine_repair_costs
    where pickaxe_id = p_pickaxe_id
    order by ore_id
  loop
    v_remaining_required := v_cost.quantity_per_durability * p_amount;
    v_rebuilt_inventory := '[]'::jsonb;

    for v_item in select value from jsonb_array_elements(v_new_inventory) loop
      if v_item->>'type' = 'mineral'
         and v_item->>'id' = v_cost.ore_id
         and v_remaining_required > 0 then
        v_item_quantity := case when v_item->>'quantity' ~ '^[0-9]+$' then (v_item->>'quantity')::integer else 0 end;
        if v_item_quantity > v_remaining_required then
          v_rebuilt_inventory := v_rebuilt_inventory || jsonb_build_array(
            v_item || jsonb_build_object('quantity', v_item_quantity - v_remaining_required)
          );
          v_remaining_required := 0;
        else
          v_remaining_required := greatest(0, v_remaining_required - v_item_quantity);
        end if;
      else
        v_rebuilt_inventory := v_rebuilt_inventory || jsonb_build_array(v_item);
      end if;
    end loop;

    v_new_inventory := v_rebuilt_inventory;
  end loop;

  v_failed := random() < v_destroyer * 0.08;

  if not v_failed then
    select coalesce(jsonb_agg(
      case
        when item->>'type' = 'pickaxe' and item->>'id' = p_pickaxe_id
          then item || jsonb_build_object('durability', v_durability + p_amount)
        else item
      end
      order by ordinal
    ), '[]'::jsonb)
    into v_new_inventory
    from jsonb_array_elements(v_new_inventory) with ordinality as items(item, ordinal);
  end if;

  update public.users set inventory = v_new_inventory where auth_user_id = v_uid;

  if v_failed then
    return jsonb_build_object('status', 'repair_failed', 'repaired_amount', 0, 'durability', v_durability, 'inventory', v_new_inventory);
  end if;

  return jsonb_build_object('status', 'success', 'repaired_amount', p_amount, 'durability', v_durability + p_amount, 'inventory', v_new_inventory);
end;
$$;

-- 사냥: 공격력, 추가 내구도 소모, 경험치, 보상 확률 스톤 효과를 적용합니다.
create or replace function public.attack_monster()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inventory jsonb;
  v_new_inventory jsonb;
  v_floor smallint;
  v_mana bigint;
  v_pickaxe_id text;
  v_pickaxe_rank smallint;
  v_base_attack smallint;
  v_durability integer;
  v_remaining integer;
  v_enchants jsonb;
  v_sharp smallint;
  v_weaken smallint;
  v_fragile smallint;
  v_plunder smallint;
  v_wisdom smallint;
  v_stone_attack integer;
  v_stone_durability integer;
  v_stone_reward numeric;
  v_stone_xp integer;
  v_group_bonus integer;
  v_damage integer;
  v_dur_cost integer;
  v_experience numeric(40, 0);
  v_new_floor smallint;
  v_new_experience numeric(40, 0);
  v_required_experience numeric(40, 0);
  v_total_experience numeric(40, 0);
  v_xp_gain integer;
  v_floor_up boolean;
  v_monster_id text;
  v_monster_hp integer;
  v_monster_max integer;
  v_monster_name text;
  v_defeated boolean;
  v_mult double precision;
  v_rewards jsonb := '[]'::jsonb;
  v_mana_gain bigint := 0;
  v_reward jsonb;
  v_kind text;
  v_rid text;
  v_rqty integer;
  v_pick text;
  v_base_unit_points bigint;
  v_pool text[] := array['stone', 'coal', 'copper', 'iron', 'silver', 'gold', 'jade', 'obsidian'];
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select inventory, mine_floor, mine_experience, mana, hunt_monster, hunt_monster_hp
  into v_inventory, v_floor, v_experience, v_mana, v_monster_id, v_monster_hp
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  if v_monster_id is not null then
    select max_hp into v_monster_max
    from public.pointmine_monsters
    where id = v_monster_id and v_floor between min_floor and max_floor;
    if not found then v_monster_id := null; end if;
  end if;

  if v_monster_id is null then
    select id, max_hp, name
    into v_monster_id, v_monster_max, v_monster_name
    from public.pointmine_monsters
    where v_floor between min_floor and max_floor
    order by random()
    limit 1;

    if v_monster_id is null then
      raise exception '해당 층의 몬스터 정보가 없습니다.' using errcode = 'P0002';
    end if;

    update public.users
    set hunt_monster = v_monster_id, hunt_monster_hp = v_monster_max
    where auth_user_id = v_uid;

    return jsonb_build_object(
      'status', 'spawned',
      'monster_id', v_monster_id,
      'monster_name', v_monster_name,
      'monster_hp', v_monster_max,
      'monster_max_hp', v_monster_max,
      'defeated', false,
      'inventory', v_inventory,
      'mana', v_mana
    );
  end if;

  if v_monster_hp is null then v_monster_hp := v_monster_max; end if;

  select item->>'id', coalesce((item->>'durability')::integer, 0), item->'enchants'
  into v_pickaxe_id, v_durability, v_enchants
  from jsonb_array_elements(v_inventory) as item
  where item->>'type' = 'pickaxe' and coalesce((item->>'equipped')::boolean, false)
  limit 1;

  if v_pickaxe_id is null then return jsonb_build_object('status', 'no_pickaxe'); end if;

  select attack_power, rarity_rank into v_base_attack, v_pickaxe_rank
  from public.pointmine_pickaxes where id = v_pickaxe_id;

  v_sharp := coalesce((v_enchants->>'sharp')::smallint, 0);
  v_weaken := coalesce((v_enchants->>'weaken')::smallint, 0);
  v_fragile := coalesce((v_enchants->>'fragile')::smallint, 0);
  v_plunder := coalesce((v_enchants->>'plunder')::smallint, 0);
  v_wisdom := coalesce((v_enchants->>'wisdom')::smallint, 0);
  v_stone_attack := public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'attack')::integer;
  v_stone_durability := greatest(0, public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'durability_cost')::integer);
  v_stone_reward := public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'monster_reward_chance');
  v_stone_xp := public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'xp_gain')::integer;

  v_dur_cost := 1 + v_fragile + v_stone_durability;
  if v_durability < v_dur_cost then return jsonb_build_object('status', 'broken_pickaxe'); end if;

  select name into v_monster_name from public.pointmine_monsters where id = v_monster_id;

  v_group_bonus := case
    when v_monster_id in ('fly', 'bug', 'larva') then 2 * coalesce((v_enchants->>'bug_hunter')::smallint, 0)
    when v_monster_id in ('stone_slime', 'sulfur_slime') then 2 * coalesce((v_enchants->>'slime_slayer')::smallint, 0)
    when v_monster_id in ('miner_skeleton', 'ghost') then 2 * coalesce((v_enchants->>'holy')::smallint, 0)
    when v_monster_id = 'cave_bat' then 2 * coalesce((v_enchants->>'bat_hunter')::smallint, 0)
    when v_monster_id = 'stone_golem' then 2 * coalesce((v_enchants->>'golem_breaker')::smallint, 0)
    else 0
  end;

  v_damage := greatest(1, v_base_attack + v_sharp - v_weaken + v_group_bonus + v_stone_attack);
  v_remaining := greatest(0, v_durability - v_dur_cost);
  v_monster_hp := v_monster_hp - v_damage;
  v_defeated := v_monster_hp <= 0;

  v_xp_gain := case when v_floor < 100 then v_pickaxe_rank + 1 + v_wisdom + v_stone_xp else 0 end;
  if v_defeated and v_floor < 100 then v_xp_gain := v_xp_gain + v_monster_max; end if;

  v_new_floor := v_floor;
  v_new_experience := v_experience;
  if v_floor < 100 then
    v_required_experience := 100 * power(2::numeric, v_floor - 1);
    v_total_experience := v_experience + v_xp_gain;
    if v_total_experience >= v_required_experience then
      v_new_floor := least(100, v_floor + 1);
      v_new_experience := case when v_new_floor >= 100 then 0 else v_total_experience - v_required_experience end;
    else
      v_new_experience := v_total_experience;
    end if;
  end if;
  v_floor_up := v_new_floor > v_floor;

  select coalesce(jsonb_agg(
    case
      when item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
        then item || jsonb_build_object('durability', v_remaining, 'equipped', v_remaining > 0)
      else item
    end
    order by ordinal
  ), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);

  if v_defeated then
    v_mult := greatest(0, power(1.1::double precision, v_plunder) * (1 + v_stone_reward::double precision / 100));

    if v_monster_id = 'fly' then
      if random() < least(1.0, 0.6 * v_mult) then
        v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'monster_item', 'id', 'fly_wing', 'name', '파리 날개', 'quantity', 1));
      end if;
    elsif v_monster_id = 'bug' then
      if random() < least(1.0, 0.6 * v_mult) then
        v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'monster_item', 'id', 'bug_shell', 'name', '좀벌레 껍질', 'quantity', 1));
      end if;
    elsif v_monster_id = 'larva' then
      null;
    elsif v_monster_id = 'stone_slime' then
      if random() < least(1.0, 0.7 * v_mult) then
        if random() < 0.65 then
          v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'mineral', 'id', 'stone', 'name', '돌', 'quantity', 1));
        else
          v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'mineral', 'id', 'iron', 'name', '철 광석', 'quantity', 1));
        end if;
      end if;
    elsif v_monster_id = 'cave_bat' then
      if random() < least(1.0, 0.55 * v_mult) then
        v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'monster_item', 'id', 'bat_wing', 'name', '박쥐 날개', 'quantity', 1));
      end if;
    elsif v_monster_id = 'sulfur_slime' then
      if random() < least(1.0, 0.6 * v_mult) then
        v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'monster_item', 'id', 'sulfur', 'name', '유황', 'quantity', 1));
      end if;
    elsif v_monster_id = 'ghost' then
      v_mana_gain := v_mana_gain + 4;
      v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'mana', 'name', '마나', 'quantity', 4));
    elsif v_monster_id = 'miner_skeleton' then
      for i in 1..2 loop
        v_pick := v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
        v_rewards := v_rewards || jsonb_build_array(jsonb_build_object(
          'kind', 'mineral',
          'id', v_pick,
          'name', (select name from public.pointmine_ores where id = v_pick),
          'quantity', 1
        ));
      end loop;
    elsif v_monster_id = 'stone_golem' then
      v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'mineral', 'id', 'stone', 'name', '돌', 'quantity', 2));
      v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'mineral', 'id', 'aquamarine', 'name', '아쿠아마린', 'quantity', 1));
      v_mana_gain := v_mana_gain + 3;
      v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'mana', 'name', '마나', 'quantity', 3));
    end if;

    for v_reward in select value from jsonb_array_elements(v_rewards) as rewards(value) loop
      v_kind := v_reward->>'kind';
      if v_kind in ('mineral', 'monster_item') then
        v_rid := v_reward->>'id';
        v_rqty := (v_reward->>'quantity')::integer;

        if v_kind = 'mineral' then
          select sell_price into v_base_unit_points from public.pointmine_ores where id = v_rid;
        else
          v_base_unit_points := null;
        end if;

        if exists (
          select 1 from jsonb_array_elements(v_new_inventory) as item
          where item->>'type' = v_kind
            and item->>'id' = v_rid
            and (
              v_kind = 'monster_item'
              or case when item->>'unitPoints' ~ '^[0-9]+$'
                then (item->>'unitPoints')::bigint = v_base_unit_points
                else true
              end
            )
        ) then
          select coalesce(jsonb_agg(
            case
              when item->>'type' = v_kind
                and item->>'id' = v_rid
                and (
                  v_kind = 'monster_item'
                  or case when item->>'unitPoints' ~ '^[0-9]+$'
                    then (item->>'unitPoints')::bigint = v_base_unit_points
                    else true
                  end
                )
              then item || jsonb_build_object('quantity', coalesce((item->>'quantity')::integer, 0) + v_rqty)
                || case when v_kind = 'mineral' then jsonb_build_object('unitPoints', v_base_unit_points) else '{}'::jsonb end
              else item
            end
            order by ordinal
          ), '[]'::jsonb)
          into v_new_inventory
          from jsonb_array_elements(v_new_inventory) with ordinality as items(item, ordinal);
        else
          v_new_inventory := v_new_inventory || jsonb_build_array(
            jsonb_build_object('type', v_kind, 'id', v_rid, 'quantity', v_rqty)
            || case when v_kind = 'mineral' then jsonb_build_object('unitPoints', v_base_unit_points) else '{}'::jsonb end
          );
        end if;
      end if;
    end loop;
  end if;

  update public.users
  set inventory = v_new_inventory,
      mana = coalesce(mana, 0) + v_mana_gain,
      mine_floor = v_new_floor,
      mine_experience = v_new_experience,
      hunt_monster = case when v_defeated then null else v_monster_id end,
      hunt_monster_hp = case when v_defeated then null else v_monster_hp end
  where auth_user_id = v_uid
  returning mana into v_mana;

  return jsonb_build_object(
    'status', 'success',
    'monster_id', v_monster_id,
    'monster_name', v_monster_name,
    'monster_hp', greatest(0, v_monster_hp),
    'monster_max_hp', v_monster_max,
    'damage', v_damage,
    'defeated', v_defeated,
    'remaining_durability', v_remaining,
    'rewards', v_rewards,
    'inventory', v_new_inventory,
    'mana', v_mana,
    'xp_gained', v_xp_gain,
    'mine_floor', v_new_floor,
    'mine_experience', v_new_experience::text,
    'required_experience', case when v_new_floor >= 100 then '0' else (100 * power(2::numeric, v_new_floor - 1))::text end,
    'floor_up', v_floor_up
  );
end;
$$;

-- 마법 부여: 각인된 스톤의 마나 소모 증감 효과를 적용합니다.
create or replace function public.enchant_pickaxe(p_pickaxe_id text)
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
  v_new_mana bigint;
  v_mana_cost integer;
  v_enchants jsonb := '{}'::jsonb;
  v_rec record;
  v_neg_id text;
  v_neg_max integer;
  v_level integer;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select inventory, mana
  into v_inventory, v_mana
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'pickaxe' and item->>'id' = p_pickaxe_id
  ) then
    return jsonb_build_object('status', 'pickaxe_not_found');
  end if;

  v_mana_cost := greatest(1, 5 + public.pointmine_ability_stone_effect(v_inventory, p_pickaxe_id, 'enchant_mana_cost')::integer);

  if coalesce(v_mana, 0) < v_mana_cost then
    return jsonb_build_object('status', 'insufficient_mana', 'mana', coalesce(v_mana, 0), 'mana_cost', v_mana_cost);
  end if;

  for v_rec in
    select id, max_level from (values
      ('luck', 2), ('miner_eye', 5), ('sharp', 5), ('self_repair', 1), ('wisdom', 3),
      ('bug_hunter', 5), ('slime_slayer', 5), ('holy', 5), ('bat_hunter', 5),
      ('golem_breaker', 5), ('plunder', 3), ('double_mine', 1)
    ) as positive_options(id, max_level)
    order by random()
    limit 2
  loop
    v_level := 1 + floor(random() * v_rec.max_level)::integer;
    v_enchants := v_enchants || jsonb_build_object(v_rec.id, v_level);
  end loop;

  select id, max_level
  into v_neg_id, v_neg_max
  from (values
    ('fragile', 5), ('unlucky', 3), ('destroyer', 2), ('weaken', 5)
  ) as negative_options(id, max_level)
  order by random()
  limit 1;

  v_level := 1 + floor(random() * v_neg_max)::integer;
  v_enchants := v_enchants || jsonb_build_object(v_neg_id, v_level);

  select coalesce(jsonb_agg(
    case
      when item->>'type' = 'pickaxe' and item->>'id' = p_pickaxe_id
        then item || jsonb_build_object('enchants', v_enchants)
      else item
    end
    order by ordinal
  ), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);

  update public.users
  set inventory = v_new_inventory,
      mana = coalesce(mana, 0) - v_mana_cost
  where auth_user_id = v_uid
  returning mana into v_new_mana;

  return jsonb_build_object(
    'status', 'success',
    'pickaxe_id', p_pickaxe_id,
    'enchants', v_enchants,
    'mana_cost', v_mana_cost,
    'mana', v_new_mana,
    'inventory', v_new_inventory
  );
end;
$$;

-- 일일 정비: 기존 자가 복원과 VIP 마나에 스톤 일일 효과를 추가합니다.
create or replace function public.apply_daily_upkeep()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inventory jsonb;
  v_new_inventory jsonb := '[]'::jsonb;
  v_item jsonb;
  v_updated_item jsonb;
  v_pickaxe_id text;
  v_durability integer;
  v_max_durability integer;
  v_repair_chance numeric;
  v_damage_chance numeric;
  v_points_gain bigint := 0;
  v_stone_mana_gain bigint := 0;
  v_vip_mana_gain bigint := 0;
  v_mana bigint;
  v_balance numeric;
  v_expires timestamptz;
  v_last_mana date;
  v_today text := to_char((now() at time zone 'Asia/Seoul'), 'YYYY-MM-DD');
  v_today_date date := (now() at time zone 'Asia/Seoul')::date;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select inventory, mana, balance, vip_expires_at, vip_last_mana
  into v_inventory, v_mana, v_balance, v_expires, v_last_mana
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
        v_points_gain := v_points_gain + greatest(0, public.pointmine_ability_stone_effect(v_inventory, v_pickaxe_id, 'daily_points')::bigint);
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
    end if;

    v_new_inventory := v_new_inventory || jsonb_build_array(v_updated_item);
  end loop;

  if v_expires is not null and v_expires > now()
     and (v_last_mana is null or v_last_mana < v_today_date) then
    v_vip_mana_gain := 5;
  end if;

  update public.users
  set inventory = v_new_inventory,
      balance = coalesce(balance, 0) + v_points_gain,
      mana = coalesce(mana, 0) + v_stone_mana_gain + v_vip_mana_gain,
      vip_last_mana = case when v_vip_mana_gain > 0 then v_today_date else vip_last_mana end
  where auth_user_id = v_uid
  returning mana, balance into v_mana, v_balance;

  return jsonb_build_object(
    'status', 'success',
    'inventory', v_new_inventory,
    'mana', v_mana,
    'balance', v_balance,
    'gained_mana', v_stone_mana_gain + v_vip_mana_gain,
    'gained_points', v_points_gain
  );
end;
$$;

-- 광물 판매: 광물 묶음의 unitPoints가 있으면 해당 단가를 사용합니다.
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
    case when item->>'unitPoints' ~ '^[0-9]+$'
      then (item->>'unitPoints')::bigint
      else ore.sell_price
    end
    * case when item->>'quantity' ~ '^[0-9]+$' then (item->>'quantity')::integer else 0 end
  ), 0)::bigint
  into v_total
  from jsonb_array_elements(v_inventory) as item
  join public.pointmine_ores as ore on ore.id = item->>'id'
  where item->>'type' = 'mineral'
    and ore.id = any(v_ore_ids);

  if v_total <= 0 then return jsonb_build_object('status', 'empty'); end if;
  if v_total < 10 then
    return jsonb_build_object('status', 'minimum_sale', 'minimum_points', 10, 'selected_points', v_total);
  end if;

  select balance into v_company_balance
  from public.companies
  where name = '엘케이컴퍼니'
  for update;

  if not found then return jsonb_build_object('status', 'company_not_found'); end if;
  perform 1 from public.companies where name = '익테봇' for update;
  if not found then return jsonb_build_object('status', 'fee_account_not_found'); end if;
  perform 1 from public.users where nickname = '로또기금' for update;
  if not found then return jsonb_build_object('status', 'fee_account_not_found'); end if;
  if coalesce(v_company_balance, 0) < v_total then
    return jsonb_build_object('status', 'company_insufficient');
  end if;

  v_iktebot_fee := greatest(v_total / 100, 1);
  v_lotto_fee := greatest(v_total / 100, 1);
  v_received := v_total - v_iktebot_fee - v_lotto_fee;

  select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal)
  where not (item->>'type' = 'mineral' and item->>'id' = any(v_ore_ids));

  update public.users
  set balance = coalesce(balance, 0) + v_received,
      inventory = v_new_inventory
  where auth_user_id = v_uid
  returning balance into v_new_balance;

  update public.companies set balance = balance - v_total where name = '엘케이컴퍼니';
  update public.companies set balance = coalesce(balance, 0) + v_iktebot_fee where name = '익테봇';
  update public.users set balance = coalesce(balance, 0) + v_lotto_fee where nickname = '로또기금';

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

revoke all on function public.pointmine_roll_ability_stone_option(text, text[]) from public, anon, authenticated;
revoke all on function public.pointmine_roll_ability_stone() from public, anon, authenticated;
revoke all on function public.pointmine_ability_stone_effect(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.purchase_ability_stone() from public, anon;
revoke all on function public.engrave_ability_stone(text, text) from public, anon;
revoke all on function public.dismantle_ability_stone(text) from public, anon;
revoke all on function public.mine_ore() from public, anon;
revoke all on function public.repair_pickaxe(text, integer) from public, anon;
revoke all on function public.attack_monster() from public, anon;
revoke all on function public.enchant_pickaxe(text) from public, anon;
revoke all on function public.apply_daily_upkeep() from public, anon;
revoke all on function public.sell_selected_minerals(text[]) from public, anon;
revoke all on function public.sell_all_minerals() from public, anon;

grant execute on function public.purchase_ability_stone() to authenticated;
grant execute on function public.engrave_ability_stone(text, text) to authenticated;
grant execute on function public.dismantle_ability_stone(text) to authenticated;
grant execute on function public.mine_ore() to authenticated;
grant execute on function public.repair_pickaxe(text, integer) to authenticated;
grant execute on function public.attack_monster() to authenticated;
grant execute on function public.enchant_pickaxe(text) to authenticated;
grant execute on function public.apply_daily_upkeep() to authenticated;
grant execute on function public.sell_selected_minerals(text[]) to authenticated;
grant execute on function public.sell_all_minerals() to authenticated;

comment on function public.purchase_ability_stone() is '100P로 긍정 2개와 부정 1개 옵션이 결정된 어빌리티 스톤을 구매하는 함수';
comment on function public.engrave_ability_stone(text, text) is '보유 어빌리티 스톤을 곡괭이에 연결하고 기존 스톤을 교체하는 함수';
comment on function public.dismantle_ability_stone(text) is '보유 어빌리티 스톤을 제거하고 마나 1~2를 지급하는 함수';

commit;
