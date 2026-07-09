-- 어빌리티 스톤 10칸 세공 시스템
-- pointmine_ability_stone_update.sql 적용 후 실행합니다.

begin;

-- 옵션별 6/7/9/10 성공 단계의 표시값과 실제 효과값입니다.
create or replace function public.pointmine_ability_stone_option_levels(p_option_id text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_option_id
    when 'extra_mineral_chance' then jsonb_build_object('values', jsonb_build_array(1, 3, 7, 15), 'effectValues', jsonb_build_array(1, 3, 7, 15))
    when 'xp_gain' then jsonb_build_object('values', jsonb_build_array(1, 2, 4, 10), 'effectValues', jsonb_build_array(1, 2, 4, 10))
    when 'attack_up' then jsonb_build_object('values', jsonb_build_array(1, 2, 4, 10), 'effectValues', jsonb_build_array(1, 2, 4, 10))
    when 'mineral_value_up' then jsonb_build_object('values', jsonb_build_array(1, 2, 3, 4), 'effectValues', jsonb_build_array(1, 2, 3, 4))
    when 'daily_repair_chance' then jsonb_build_object('values', jsonb_build_array(5, 10, 20, 50), 'effectValues', jsonb_build_array(5, 10, 20, 50))
    when 'enchant_mana_cost_down' then jsonb_build_object('values', jsonb_build_array(-1, -2, -3, -4), 'effectValues', jsonb_build_array(-1, -2, -3, -4))
    when 'monster_reward_chance_up' then jsonb_build_object('values', jsonb_build_array(5, 8, 11, 20), 'effectValues', jsonb_build_array(5, 8, 11, 20))
    when 'daily_points' then jsonb_build_object('values', jsonb_build_array(5, 10, 20, 50), 'effectValues', jsonb_build_array(5, 10, 20, 50))
    when 'extra_two_mineral_chance' then jsonb_build_object('values', jsonb_build_array(0.5, 1, 2, 5), 'effectValues', jsonb_build_array(0.5, 1, 2, 5))
    when 'daily_mana' then jsonb_build_object('values', jsonb_build_array(1, 2, 3, 5), 'effectValues', jsonb_build_array(1, 2, 3, 5))
    when 'mine_fail_chance' then jsonb_build_object('values', jsonb_build_array(3, 6, 9, 15), 'effectValues', jsonb_build_array(3, 6, 9, 15))
    when 'durability_cost_up' then jsonb_build_object('values', jsonb_build_array(1, 2, 3, 5), 'effectValues', jsonb_build_array(1, 2, 3, 5))
    when 'attack_down' then jsonb_build_object('values', jsonb_build_array(-1, -3, -7, -10), 'effectValues', jsonb_build_array(-1, -3, -7, -10))
    when 'mineral_value_down' then jsonb_build_object('values', jsonb_build_array(-1, -2, -3, -4), 'effectValues', jsonb_build_array(-1, -2, -3, -4))
    when 'enchant_mana_cost_up' then jsonb_build_object('values', jsonb_build_array(1, 2, 3, 5), 'effectValues', jsonb_build_array(1, 2, 3, 5))
    when 'monster_reward_chance_down' then jsonb_build_object('values', jsonb_build_array(-2, -4, -8, -16), 'effectValues', jsonb_build_array(-2, -4, -8, -16))
    when 'daily_damage_chance' then jsonb_build_object('values', jsonb_build_array(5, 10, 20, 50), 'effectValues', jsonb_build_array(5, 10, 20, 50))
    else jsonb_build_object('values', '[]'::jsonb, 'effectValues', '[]'::jsonb)
  end;
$$;

-- 성공 횟수를 실제 적용 티어로 변환합니다.
create or replace function public.pointmine_ability_stone_tier(p_successes integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_successes >= 10 then 4
    when p_successes >= 9 then 3
    when p_successes >= 7 then 2
    when p_successes >= 6 then 1
    else 0
  end;
$$;

-- 새 스톤은 옵션 종류만 결정하고 모든 효과는 미활성 상태로 생성합니다.
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
  v_levels jsonb;
begin
  select option_id, option_name, effect_id, unit, rarity
  into v_id, v_name, v_effect_id, v_unit, v_rarity
  from (values
    ('extra_mineral_chance', '광물 1개 더 채굴할 확률', 'positive', 'extra_mineral_chance', '%', 'normal'),
    ('xp_gain', '경험치 획득', 'positive', 'xp_gain', '', 'common'),
    ('attack_up', '공격력', 'positive', 'attack', '', 'normal'),
    ('mineral_value_up', '이 곡괭이로 캔 광물 가치', 'positive', 'mineral_value', '', 'rare'),
    ('daily_repair_chance', '매일 내구도 1 수리 확률', 'positive', 'daily_repair_chance', '%', 'normal'),
    ('enchant_mana_cost_down', '마법 부여 마나 소모', 'positive', 'enchant_mana_cost', '', 'normal'),
    ('monster_reward_chance_up', '몬스터 보상 획득 확률', 'positive', 'monster_reward_chance', '%', 'normal'),
    ('daily_points', '곡괭이 보유 시 매일 포인트', 'positive', 'daily_points', '', 'rare'),
    ('extra_two_mineral_chance', '광물 2개 더 채굴할 확률', 'positive', 'extra_two_mineral_chance', '%', 'rare'),
    ('daily_mana', '곡괭이 보유 시 매일 마나', 'positive', 'daily_mana', '', 'normal'),
    ('mine_fail_chance', '광물을 캐지 못할 확률', 'negative', 'mine_fail_chance', '%', 'normal'),
    ('durability_cost_up', '내구도 추가 소모', 'negative', 'durability_cost', '', 'normal'),
    ('attack_down', '공격력', 'negative', 'attack', '', 'normal'),
    ('mineral_value_down', '이 곡괭이로 캔 광물 가치', 'negative', 'mineral_value', '', 'normal'),
    ('enchant_mana_cost_up', '마법 부여 마나 소모', 'negative', 'enchant_mana_cost', '', 'normal'),
    ('monster_reward_chance_down', '몬스터 보상 획득 확률', 'negative', 'monster_reward_chance', '%', 'normal'),
    ('daily_damage_chance', '매일 내구도 1 손상 확률', 'negative', 'daily_damage_chance', '%', 'normal')
  ) as options(option_id, option_name, option_sign, effect_id, unit, rarity)
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

  v_levels := public.pointmine_ability_stone_option_levels(v_id);

  return jsonb_build_object(
    'id', v_id,
    'name', v_name,
    'sign', p_sign,
    'effectId', v_effect_id,
    'value', 0,
    'effectValue', 0,
    'unit', v_unit,
    'tier', 0,
    'rarity', v_rarity,
    'facets', '[]'::jsonb
  ) || v_levels;
end;
$$;

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
    'facetChance', 75,
    'faceted', false,
    'options', jsonb_build_array(v_positive_one, v_positive_two, v_negative)
  );
end;
$$;

-- 기존 스톤은 옵션 종류만 유지하고 직접 세공할 수 있는 미세공 상태로 변환합니다.
create or replace function public.pointmine_upgrade_legacy_ability_stone(p_stone jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_option jsonb;
  v_options jsonb := '[]'::jsonb;
  v_levels jsonb;
begin
  if p_stone ? 'faceted' then
    return p_stone;
  end if;

  for v_option in
    select value from jsonb_array_elements(
      case when jsonb_typeof(p_stone->'options') = 'array' then p_stone->'options' else '[]'::jsonb end
    ) as options(value)
  loop
    v_levels := public.pointmine_ability_stone_option_levels(v_option->>'id');
    v_options := v_options || jsonb_build_array(
      v_option || v_levels || jsonb_build_object(
        'facets', '[]'::jsonb,
        'tier', 0,
        'value', 0,
        'effectValue', 0
      )
    );
  end loop;

  return p_stone || jsonb_build_object(
    'options', v_options,
    'facetChance', 75,
    'faceted', false
  );
end;
$$;

update public.users as target
set inventory = upgraded.inventory
from (
  select u.auth_user_id,
         coalesce(jsonb_agg(
           case
             when item->>'type' = 'ability_stone'
               then public.pointmine_upgrade_legacy_ability_stone(item)
             else item
           end
           order by ordinal
         ), '[]'::jsonb) as inventory
  from public.users as u
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(u.inventory) = 'array' then u.inventory else '[]'::jsonb end
  ) with ordinality as items(item, ordinal)
  where exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(u.inventory) = 'array' then u.inventory else '[]'::jsonb end
    ) as owned(item)
    where owned.item->>'type' = 'ability_stone'
      and not (owned.item ? 'faceted')
  )
  group by u.auth_user_id
) as upgraded
where target.auth_user_id = upgraded.auth_user_id;

-- 선택한 한 줄을 현재 확률로 세공하고 성공/실패에 따라 확률을 10%p 변경합니다.
create or replace function public.facet_ability_stone(p_stone_uid text, p_option_index integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inventory jsonb;
  v_new_inventory jsonb;
  v_stone jsonb;
  v_new_stone jsonb;
  v_options jsonb;
  v_option jsonb;
  v_new_option jsonb;
  v_levels jsonb;
  v_facets jsonb;
  v_new_facets jsonb;
  v_chance integer;
  v_new_chance integer;
  v_success boolean;
  v_successes integer;
  v_tier integer;
  v_value numeric := 0;
  v_effect_value numeric := 0;
  v_line_complete boolean;
  v_completed boolean;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  if p_stone_uid is null or p_option_index is null or p_option_index < 0 or p_option_index > 2 then
    return jsonb_build_object('status', 'invalid_option');
  end if;

  select inventory into v_inventory
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  select item into v_stone
  from jsonb_array_elements(
    case when jsonb_typeof(v_inventory) = 'array' then v_inventory else '[]'::jsonb end
  ) as owned(item)
  where item->>'type' = 'ability_stone'
    and item->>'uid' = p_stone_uid
  limit 1;

  if v_stone is null then
    return jsonb_build_object('status', 'stone_not_found');
  end if;

  if coalesce((v_stone->>'faceted')::boolean, false) then
    return jsonb_build_object('status', 'already_faceted', 'ability_stone', v_stone);
  end if;

  v_options := case when jsonb_typeof(v_stone->'options') = 'array' then v_stone->'options' else '[]'::jsonb end;
  if jsonb_array_length(v_options) <> 3 then
    return jsonb_build_object('status', 'invalid_option');
  end if;

  v_option := v_options->p_option_index;
  v_facets := case when jsonb_typeof(v_option->'facets') = 'array' then v_option->'facets' else '[]'::jsonb end;
  if jsonb_array_length(v_facets) >= 10 then
    return jsonb_build_object('status', 'line_complete', 'ability_stone', v_stone);
  end if;

  v_chance := greatest(25, least(75, coalesce((v_stone->>'facetChance')::integer, 75)));
  v_success := random() < v_chance::numeric / 100;
  v_new_chance := case when v_success then greatest(25, v_chance - 10) else least(75, v_chance + 10) end;
  v_new_facets := v_facets || to_jsonb(v_success);

  select count(*) filter (where value::boolean)
  into v_successes
  from jsonb_array_elements(v_new_facets) as results(value);

  v_tier := public.pointmine_ability_stone_tier(v_successes);
  v_levels := public.pointmine_ability_stone_option_levels(v_option->>'id');
  if v_tier > 0 then
    v_value := (v_levels->'values'->>(v_tier - 1))::numeric;
    v_effect_value := (v_levels->'effectValues'->>(v_tier - 1))::numeric;
  end if;

  v_new_option := v_option || v_levels || jsonb_build_object(
    'facets', v_new_facets,
    'tier', v_tier,
    'value', v_value,
    'effectValue', v_effect_value
  );
  v_options := jsonb_set(v_options, array[p_option_index::text], v_new_option, false);

  select coalesce(bool_and(jsonb_array_length(
    case when jsonb_typeof(option_item->'facets') = 'array' then option_item->'facets' else '[]'::jsonb end
  ) >= 10), false)
  into v_completed
  from jsonb_array_elements(v_options) as options(option_item);

  v_line_complete := jsonb_array_length(v_new_facets) >= 10;
  v_new_stone := v_stone || jsonb_build_object(
    'options', v_options,
    'facetChance', v_new_chance,
    'faceted', v_completed
  );

  select coalesce(jsonb_agg(
    case
      when item->>'type' = 'ability_stone' and item->>'uid' = p_stone_uid then v_new_stone
      else item
    end
    order by ordinal
  ), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);

  update public.users
  set inventory = v_new_inventory
  where auth_user_id = v_uid;

  return jsonb_build_object(
    'status', 'success',
    'success', v_success,
    'chance_before', v_chance,
    'chance', v_new_chance,
    'option_index', p_option_index,
    'successes', v_successes,
    'tier', v_tier,
    'line_complete', v_line_complete,
    'completed', v_completed,
    'inventory', v_new_inventory,
    'ability_stone', v_new_stone
  );
end;
$$;

-- 세공을 모두 마친 스톤만 곡괭이에 각인할 수 있습니다.
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
  v_stone jsonb;
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

  select item into v_stone
  from jsonb_array_elements(v_inventory) as owned(item)
  where item->>'type' = 'ability_stone' and item->>'uid' = p_stone_uid
  limit 1;

  if v_stone is null then
    return jsonb_build_object('status', 'stone_not_found');
  end if;

  if not coalesce((v_stone->>'faceted')::boolean, false) then
    return jsonb_build_object('status', 'stone_not_faceted');
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

-- 티어가 활성화된 옵션만 게임 효과에 반영합니다.
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
    and option_item->>'effectId' = p_effect_id
    and coalesce((option_item->>'tier')::integer, 0) > 0;
$$;

revoke all on function public.pointmine_ability_stone_option_levels(text) from public, anon, authenticated;
revoke all on function public.pointmine_ability_stone_tier(integer) from public, anon, authenticated;
revoke all on function public.pointmine_roll_ability_stone_option(text, text[]) from public, anon, authenticated;
revoke all on function public.pointmine_roll_ability_stone() from public, anon, authenticated;
revoke all on function public.pointmine_upgrade_legacy_ability_stone(jsonb) from public, anon, authenticated;
revoke all on function public.pointmine_ability_stone_effect(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.facet_ability_stone(text, integer) from public, anon;
revoke all on function public.engrave_ability_stone(text, text) from public, anon;

grant execute on function public.facet_ability_stone(text, integer) to authenticated;
grant execute on function public.engrave_ability_stone(text, text) to authenticated;

comment on function public.facet_ability_stone(text, integer) is '선택한 어빌리티 스톤 옵션 한 줄을 서버 확률로 세공하고 6/7/9/10 성공 단계 효과를 갱신하는 함수';

commit;
