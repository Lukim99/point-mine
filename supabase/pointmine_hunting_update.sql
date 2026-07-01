-- 포인트 광산 사냥 시스템: 몬스터 전투, 마나 자원, 몬스터 아이템, 곡괭이 마법 부여
-- 기존 SQL(setup ~ disable_wood_repair)을 모두 적용한 뒤 Supabase SQL Editor에서 한 번 실행합니다.

begin;

-- 1) users 테이블에 마나 잔액과 현재 사냥 몬스터 상태 컬럼 추가
alter table public.users
  add column if not exists mana bigint not null default 0,
  add column if not exists hunt_monster text,
  add column if not exists hunt_monster_hp integer;

-- 2) 곡괭이 기본 공격력(1~32) 컬럼 추가 및 값 세팅
alter table public.pointmine_pickaxes
  add column if not exists attack_power smallint;

update public.pointmine_pickaxes set attack_power = case id
  when 'wood' then 1
  when 'stone' then 2
  when 'rusty_iron' then 3
  when 'bronze' then 5
  when 'steel' then 7
  when 'gold' then 9
  when 'titanium' then 11
  when 'platinum' then 13
  when 'obsidian' then 15
  when 'alloy' then 17
  when 'ruby' then 19
  when 'sapphire' then 21
  when 'orichalcum' then 24
  when 'adamantium' then 27
  when 'astral' then 30
  when 'master' then 32
  else attack_power end;

alter table public.pointmine_pickaxes
  alter column attack_power set not null;

-- 3) 몬스터 정의 (monsters.png 3x3, 층 구간별 등장 · 돌 골렘 280 기준)
create table if not exists public.pointmine_monsters (
  id text primary key,
  name text not null unique,
  sprite_index smallint not null check (sprite_index between 0 and 8),
  max_hp integer not null check (max_hp > 0),
  min_floor smallint not null check (min_floor between 1 and 100),
  max_floor smallint not null check (max_floor between 1 and 100)
);

insert into public.pointmine_monsters (id, name, sprite_index, max_hp, min_floor, max_floor)
values
  ('fly', '파리', 0, 8, 1, 10),
  ('bug', '좀벌레', 1, 12, 1, 10),
  ('larva', '유충', 2, 5, 1, 10),
  ('stone_slime', '돌 슬라임', 3, 45, 11, 30),
  ('cave_bat', '동굴 박쥐', 4, 35, 11, 30),
  ('sulfur_slime', '유황 슬라임', 5, 110, 31, 80),
  ('miner_skeleton', '광부 해골', 6, 140, 31, 80),
  ('ghost', '유령', 7, 200, 81, 100),
  ('stone_golem', '돌 골렘', 8, 280, 81, 100)
on conflict (id) do update set
  name = excluded.name,
  sprite_index = excluded.sprite_index,
  max_hp = excluded.max_hp,
  min_floor = excluded.min_floor,
  max_floor = excluded.max_floor;

-- 4) 몬스터 아이템 정의 (monster-items.png 2x2, 판매 시 마나 획득)
create table if not exists public.pointmine_monster_items (
  id text primary key,
  name text not null unique,
  sprite_index smallint not null check (sprite_index between 0 and 3),
  mana_value integer not null check (mana_value > 0)
);

insert into public.pointmine_monster_items (id, name, sprite_index, mana_value)
values
  ('fly_wing', '파리 날개', 0, 1),
  ('bug_shell', '좀벌레 껍질', 1, 1),
  ('bat_wing', '박쥐 날개', 2, 2),
  ('sulfur', '유황', 3, 3)
on conflict (id) do update set
  name = excluded.name,
  sprite_index = excluded.sprite_index,
  mana_value = excluded.mana_value;

-- 5) 신규 테이블 RLS 및 권한
alter table public.pointmine_monsters enable row level security;
alter table public.pointmine_monster_items enable row level security;

drop policy if exists pointmine_read_monsters on public.pointmine_monsters;
create policy pointmine_read_monsters
  on public.pointmine_monsters for select to authenticated using (true);

drop policy if exists pointmine_read_monster_items on public.pointmine_monster_items;
create policy pointmine_read_monster_items
  on public.pointmine_monster_items for select to authenticated using (true);

grant select on public.pointmine_monsters to authenticated;
grant select on public.pointmine_monster_items to authenticated;
revoke insert, update, delete on public.pointmine_monsters from anon, authenticated;
revoke insert, update, delete on public.pointmine_monster_items from anon, authenticated;

-- 6) 채굴 함수 재정의: 기존 로직 + 마법 부여 효과(행운/광부의 눈/지혜/더블 채굴/취약/불운)
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
  v_xp_gain smallint;
  v_floor_up boolean;
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

  if v_durability <= 0 then
    return jsonb_build_object('status', 'broken_pickaxe');
  end if;

  -- 마법 부여 레벨 추출 (없으면 0)
  v_luck := coalesce((v_enchants->>'luck')::smallint, 0);
  v_miner_eye := coalesce((v_enchants->>'miner_eye')::smallint, 0);
  v_wisdom := coalesce((v_enchants->>'wisdom')::smallint, 0);
  v_fragile := coalesce((v_enchants->>'fragile')::smallint, 0);
  v_unlucky := coalesce((v_enchants->>'unlucky')::smallint, 0);
  v_double := coalesce((v_enchants->>'double_mine')::smallint, 0);

  select rarity_rank into v_pickaxe_rank
  from public.pointmine_pickaxes
  where id = v_pickaxe_id;

  -- 채굴 대상 광물 추첨. 광부의 눈은 등급(rarity_rank)에 비례해 가중치를 높입니다.
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
    * power(
        0.9::double precision,
        power(greatest(v_pickaxe_rank - coalesce(ore.min_pickaxe_rank, v_pickaxe_rank), 0)::double precision, 2)
      )
    * (1 + ((v_floor - 1) * ore.rarity_rank * 0.0005::double precision))
    * (1 + (v_miner_eye * 0.01::double precision * ore.rarity_rank))
  )
  limit 1;

  -- 내구도 소모: 취약은 소모 +레벨, 더블 채굴은 2배
  v_dur_cost := (1 + v_fragile) * (case when v_double > 0 then 2 else 1 end);
  v_remaining := greatest(0, v_durability - v_dur_cost);

  -- 불운: 레벨당 5% 확률로 채굴 실패(내구도는 소모)
  v_mined := random() >= v_unlucky * 0.05;

  -- 채굴 수량: 더블 채굴 시 2개, 행운 발동 시 +1
  v_qty := 0;
  if v_mined then
    v_qty := case when v_double > 0 then 2 else 1 end;
    v_luck_chance := case v_luck when 1 then 0.05 when 2 then 0.13 else 0 end;
    if random() < v_luck_chance then
      v_qty := v_qty + 1;
    end if;
  end if;

  v_xp_gain := case when v_floor < 100 and v_mined then v_pickaxe_rank + 1 + v_wisdom else 0 end;
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

  -- 곡괭이 내구도 갱신
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

  -- 채굴 성공 시에만 광물 지급
  if v_qty > 0 then
    if exists (
      select 1 from jsonb_array_elements(v_new_inventory) as item
      where item->>'type' = 'mineral' and item->>'id' = v_ore.id
    ) then
      select coalesce(jsonb_agg(
        case
          when item->>'type' = 'mineral' and item->>'id' = v_ore.id
            then item || jsonb_build_object('quantity', coalesce((item->>'quantity')::integer, 0) + v_qty)
          else item
        end
        order by ordinal
      ), '[]'::jsonb)
      into v_new_inventory
      from jsonb_array_elements(v_new_inventory) with ordinality as items(item, ordinal);
    else
      v_new_inventory := v_new_inventory || jsonb_build_array(jsonb_build_object(
        'type', 'mineral', 'id', v_ore.id, 'quantity', v_qty
      ));
    end if;
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
    'points', v_ore.sell_price,
    'mined', v_mined,
    'quantity', v_qty,
    'remaining_durability', v_remaining,
    'inventory', v_new_inventory,
    'xp_gained', v_xp_gain,
    'mine_floor', v_new_floor,
    'mine_experience', v_new_experience::text,
    'required_experience', case when v_new_floor >= 100 then '0' else (100 * power(2::numeric, v_new_floor - 1))::text end,
    'floor_up', v_floor_up
  );
end;
$$;

-- 7) 수리 함수 재정의: 나무 거부 + 손실형 광물 수리 + 파괴자(수리 실패) 마법 부여
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
  v_durability integer;
  v_max_durability integer;
  v_missing integer;
  v_available integer;
  v_required integer;
  v_destroyer smallint;
  v_failed boolean;
  v_cost record;
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

  select coalesce((item->>'durability')::integer, 0), coalesce((item->>'maxDurability')::integer, 0),
         coalesce((item->'enchants'->>'destroyer')::smallint, 0)
  into v_durability, v_max_durability, v_destroyer
  from jsonb_array_elements(v_inventory) as item
  where item->>'type' = 'pickaxe' and item->>'id' = p_pickaxe_id
  limit 1;

  if not found then
    return jsonb_build_object('status', 'pickaxe_not_found');
  end if;

  v_missing := greatest(v_max_durability - v_durability, 0);
  if v_missing = 0 then
    return jsonb_build_object('status', 'no_damage');
  end if;

  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('status', 'invalid_amount');
  end if;

  if not exists (select 1 from public.pointmine_repair_costs where pickaxe_id = p_pickaxe_id) then
    return jsonb_build_object('status', 'not_repairable');
  end if;

  if p_amount > v_missing then
    return jsonb_build_object('status', 'invalid_amount');
  end if;

  -- 재료 충분 여부 확인
  for v_cost in select ore_id, quantity_per_durability from public.pointmine_repair_costs where pickaxe_id = p_pickaxe_id order by ore_id loop
    v_required := v_cost.quantity_per_durability * p_amount;
    select coalesce(sum(case when item->>'quantity' ~ '^[0-9]+$' then (item->>'quantity')::integer else 0 end), 0)::integer
    into v_available from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'mineral' and item->>'id' = v_cost.ore_id;
    if v_available < v_required then
      return jsonb_build_object('status', 'insufficient_materials', 'ore_id', v_cost.ore_id, 'required', v_required, 'available', v_available);
    end if;
  end loop;

  -- 재료 소모 (성공/실패와 무관하게 손실)
  v_new_inventory := v_inventory;
  for v_cost in select ore_id, quantity_per_durability from public.pointmine_repair_costs where pickaxe_id = p_pickaxe_id order by ore_id loop
    v_required := v_cost.quantity_per_durability * p_amount;
    select coalesce(jsonb_agg(updated_item order by ordinal), '[]'::jsonb)
    into v_new_inventory
    from (
      select ordinal,
        case when item->>'type' = 'mineral' and item->>'id' = v_cost.ore_id
          then item || jsonb_build_object('quantity', (item->>'quantity')::integer - v_required)
          else item end as updated_item
      from jsonb_array_elements(v_new_inventory) with ordinality as items(item, ordinal)
      where not (item->>'type' = 'mineral' and item->>'id' = v_cost.ore_id and (item->>'quantity')::integer <= v_required)
    ) as rebuilt;
  end loop;

  -- 파괴자: 레벨당 8% 확률로 수리 실패(재료만 소모, 내구도 미회복)
  v_failed := random() < v_destroyer * 0.08;

  if not v_failed then
    select coalesce(jsonb_agg(
      case when item->>'type' = 'pickaxe' and item->>'id' = p_pickaxe_id
        then item || jsonb_build_object('durability', v_durability + p_amount)
        else item end order by ordinal
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

-- 8) 사냥: 현재 층 구간의 몬스터를 공격해 처치하고 보상을 지급
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
  v_group_bonus integer;
  v_damage integer;
  v_dur_cost integer;
  v_wisdom smallint;
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

  -- 현재 몬스터가 층 구간을 벗어났으면 초기화
  if v_monster_id is not null then
    select max_hp into v_monster_max
    from public.pointmine_monsters
    where id = v_monster_id and v_floor between min_floor and max_floor;
    if not found then
      v_monster_id := null;
    end if;
  end if;

  -- 몬스터가 없으면 등장만 시키고 공격 없이 반환(탐색 단계)
  if v_monster_id is null then
    select id, max_hp into v_monster_id, v_monster_max
    from public.pointmine_monsters
    where v_floor between min_floor and max_floor
    order by random()
    limit 1;

    if v_monster_id is null then
      raise exception '해당 층의 몬스터 정보가 없습니다.' using errcode = 'P0002';
    end if;

    select name into v_monster_name from public.pointmine_monsters where id = v_monster_id;

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

  if v_monster_hp is null then
    v_monster_hp := v_monster_max;
  end if;

  -- 공격 단계: 곡괭이 필요
  select item->>'id', coalesce((item->>'durability')::integer, 0), item->'enchants'
  into v_pickaxe_id, v_durability, v_enchants
  from jsonb_array_elements(v_inventory) as item
  where item->>'type' = 'pickaxe' and coalesce((item->>'equipped')::boolean, false)
  limit 1;

  if v_pickaxe_id is null then
    return jsonb_build_object('status', 'no_pickaxe');
  end if;

  if v_durability <= 0 then
    return jsonb_build_object('status', 'broken_pickaxe');
  end if;

  select attack_power, rarity_rank into v_base_attack, v_pickaxe_rank
  from public.pointmine_pickaxes where id = v_pickaxe_id;

  v_sharp := coalesce((v_enchants->>'sharp')::smallint, 0);
  v_weaken := coalesce((v_enchants->>'weaken')::smallint, 0);
  v_fragile := coalesce((v_enchants->>'fragile')::smallint, 0);
  v_plunder := coalesce((v_enchants->>'plunder')::smallint, 0);
  v_wisdom := coalesce((v_enchants->>'wisdom')::smallint, 0);

  select name into v_monster_name from public.pointmine_monsters where id = v_monster_id;

  -- 그룹 특화 마법 부여 보너스(레벨당 +2)
  v_group_bonus := case
    when v_monster_id in ('fly', 'bug', 'larva') then 2 * coalesce((v_enchants->>'bug_hunter')::smallint, 0)
    when v_monster_id in ('stone_slime', 'sulfur_slime') then 2 * coalesce((v_enchants->>'slime_slayer')::smallint, 0)
    when v_monster_id in ('miner_skeleton', 'ghost') then 2 * coalesce((v_enchants->>'holy')::smallint, 0)
    when v_monster_id = 'cave_bat' then 2 * coalesce((v_enchants->>'bat_hunter')::smallint, 0)
    when v_monster_id = 'stone_golem' then 2 * coalesce((v_enchants->>'golem_breaker')::smallint, 0)
    else 0
  end;

  v_damage := greatest(1, v_base_attack + v_sharp - v_weaken + v_group_bonus);
  v_dur_cost := 1 + v_fragile;
  v_remaining := greatest(0, v_durability - v_dur_cost);
  v_monster_hp := v_monster_hp - v_damage;
  v_defeated := v_monster_hp <= 0;

  -- 경험치: 공격당 (곡괭이 등급+1+지혜), 처치 시 몬스터 최대 체력만큼 추가 획득
  v_xp_gain := case when v_floor < 100 then v_pickaxe_rank + 1 + v_wisdom else 0 end;
  if v_defeated and v_floor < 100 then
    v_xp_gain := v_xp_gain + v_monster_max;
  end if;

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

  -- 곡괭이 내구도 갱신
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
    v_mult := power(1.1::double precision, v_plunder);

    if v_monster_id = 'fly' then
      if random() < least(1.0, 0.6 * v_mult) then
        v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'monster_item', 'id', 'fly_wing', 'name', '파리 날개', 'quantity', 1));
      end if;
    elsif v_monster_id = 'bug' then
      if random() < least(1.0, 0.6 * v_mult) then
        v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'monster_item', 'id', 'bug_shell', 'name', '좀벌레 껍질', 'quantity', 1));
      end if;
    elsif v_monster_id = 'larva' then
      null; -- 유충은 보상 없음
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
      -- 돌~흑요석 중 랜덤 2개 추첨(확정)
      for i in 1..2 loop
        v_pick := v_pool[1 + floor(random() * array_length(v_pool, 1))::int];
        v_rewards := v_rewards || jsonb_build_array(jsonb_build_object(
          'kind', 'mineral', 'id', v_pick,
          'name', (select name from public.pointmine_ores where id = v_pick), 'quantity', 1));
      end loop;
    elsif v_monster_id = 'stone_golem' then
      v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'mineral', 'id', 'stone', 'name', '돌', 'quantity', 2));
      v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'mineral', 'id', 'aquamarine', 'name', '아쿠아마린', 'quantity', 1));
      v_mana_gain := v_mana_gain + 3;
      v_rewards := v_rewards || jsonb_build_array(jsonb_build_object('kind', 'mana', 'name', '마나', 'quantity', 3));
    end if;

    -- 광물/몬스터 아이템 보상을 인벤토리에 반영
    for v_reward in select value from jsonb_array_elements(v_rewards) as r(value) loop
      v_kind := v_reward->>'kind';
      if v_kind in ('mineral', 'monster_item') then
        v_rid := v_reward->>'id';
        v_rqty := (v_reward->>'quantity')::integer;
        if exists (
          select 1 from jsonb_array_elements(v_new_inventory) as item
          where item->>'type' = v_kind and item->>'id' = v_rid
        ) then
          select coalesce(jsonb_agg(
            case when item->>'type' = v_kind and item->>'id' = v_rid
              then item || jsonb_build_object('quantity', coalesce((item->>'quantity')::integer, 0) + v_rqty)
              else item end
            order by ordinal
          ), '[]'::jsonb)
          into v_new_inventory
          from jsonb_array_elements(v_new_inventory) with ordinality as items(item, ordinal);
        else
          v_new_inventory := v_new_inventory || jsonb_build_array(jsonb_build_object('type', v_kind, 'id', v_rid, 'quantity', v_rqty));
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

-- 9) 몬스터 아이템 판매 → 마나 획득 (수수료 없음)
create or replace function public.sell_monster_items(p_item_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item_ids text[];
  v_inventory jsonb;
  v_new_inventory jsonb;
  v_gain bigint;
  v_new_mana bigint;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct item_id), '{}'::text[])
  into v_item_ids
  from unnest(coalesce(p_item_ids, '{}'::text[])) as selected(item_id)
  where exists (select 1 from public.pointmine_monster_items where id = selected.item_id);

  if cardinality(v_item_ids) = 0 then
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
    def.mana_value * case when item->>'quantity' ~ '^[0-9]+$' then (item->>'quantity')::integer else 0 end
  ), 0)::bigint
  into v_gain
  from jsonb_array_elements(v_inventory) as item
  join public.pointmine_monster_items as def on def.id = item->>'id'
  where item->>'type' = 'monster_item'
    and def.id = any(v_item_ids);

  if v_gain <= 0 then
    return jsonb_build_object('status', 'empty');
  end if;

  select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal)
  where not (item->>'type' = 'monster_item' and item->>'id' = any(v_item_ids));

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

-- 10) 마법 부여: 마나 5 소모, 긍정 2개 + 부정 1개 무작위 부여(재부여는 덮어씀)
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

  if coalesce(v_mana, 0) < 5 then
    return jsonb_build_object('status', 'insufficient_mana', 'mana', coalesce(v_mana, 0));
  end if;

  -- 긍정 2개 (서로 다름)
  for v_rec in
    select id, max_level from (values
      ('luck', 2), ('miner_eye', 5), ('sharp', 5), ('self_repair', 1), ('wisdom', 3),
      ('bug_hunter', 5), ('slime_slayer', 5), ('holy', 5), ('bat_hunter', 5),
      ('golem_breaker', 5), ('plunder', 3), ('double_mine', 1)
    ) as p(id, max_level)
    order by random() limit 2
  loop
    v_level := 1 + floor(random() * v_rec.max_level)::int;
    v_enchants := v_enchants || jsonb_build_object(v_rec.id, v_level);
  end loop;

  -- 부정 1개
  select id, max_level into v_neg_id, v_neg_max from (values
    ('fragile', 5), ('unlucky', 3), ('destroyer', 2), ('weaken', 5)
  ) as n(id, max_level)
  order by random() limit 1;
  v_level := 1 + floor(random() * v_neg_max)::int;
  v_enchants := v_enchants || jsonb_build_object(v_neg_id, v_level);

  select coalesce(jsonb_agg(
    case when item->>'type' = 'pickaxe' and item->>'id' = p_pickaxe_id
      then item || jsonb_build_object('enchants', v_enchants)
      else item end
    order by ordinal
  ), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);

  update public.users
  set inventory = v_new_inventory,
      mana = coalesce(mana, 0) - 5
  where auth_user_id = v_uid
  returning mana into v_new_mana;

  return jsonb_build_object(
    'status', 'success',
    'pickaxe_id', p_pickaxe_id,
    'enchants', v_enchants,
    'mana', v_new_mana,
    'inventory', v_new_inventory
  );
end;
$$;

-- 11) 자가 복원: 하루 1회 self_repair 곡괭이 내구도 +1 (프로필 로드 시 호출)
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
  v_today text := to_char(current_date, 'YYYY-MM-DD');
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

  return jsonb_build_object('status', 'success', 'inventory', v_new_inventory);
end;
$$;

-- 12) 함수 권한
revoke all on function public.mine_ore() from public, anon;
revoke all on function public.repair_pickaxe(text, integer) from public, anon;
revoke all on function public.attack_monster() from public, anon;
revoke all on function public.sell_monster_items(text[]) from public, anon;
revoke all on function public.enchant_pickaxe(text) from public, anon;
revoke all on function public.apply_daily_upkeep() from public, anon;

grant execute on function public.mine_ore() to authenticated;
grant execute on function public.repair_pickaxe(text, integer) to authenticated;
grant execute on function public.attack_monster() to authenticated;
grant execute on function public.sell_monster_items(text[]) to authenticated;
grant execute on function public.enchant_pickaxe(text) to authenticated;
grant execute on function public.apply_daily_upkeep() to authenticated;

comment on column public.users.mana is '마법 부여에 사용하는 마나 잔액';
comment on column public.users.hunt_monster is '현재 사냥 중인 몬스터 id (없으면 null)';
comment on column public.users.hunt_monster_hp is '현재 사냥 몬스터의 남은 체력';
comment on function public.attack_monster() is '현재 층 구간 몬스터를 공격·처치하고 보상을 지급하는 사냥 함수';
comment on function public.enchant_pickaxe(text) is '마나 5로 긍정 2개 + 부정 1개 마법 부여를 무작위 적용하는 함수';

commit;
