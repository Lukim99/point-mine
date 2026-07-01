-- 채굴 경험치, 지하 층수, 층별 광물 확률 보정을 추가합니다.
-- 기존 설치 환경에서는 Supabase SQL Editor에서 전체 스크립트를 한 번 실행합니다.

begin;

alter table public.users
  add column if not exists mine_floor smallint not null default 1,
  add column if not exists mine_experience smallint not null default 0;

update public.users
set mine_floor = greatest(1, least(coalesce(mine_floor, 1), 100)),
    mine_experience = case
      when coalesce(mine_floor, 1) >= 100 then 0
      else greatest(0, least(coalesce(mine_experience, 0), 99))
    end;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_mine_floor_range'
  ) then
    alter table public.users
      add constraint users_mine_floor_range check (mine_floor between 1 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_mine_experience_range'
  ) then
    alter table public.users
      add constraint users_mine_experience_range check (mine_experience between 0 and 99);
  end if;
end;
$$;

alter table public.pointmine_ores
  add column if not exists rarity_rank smallint;

update public.pointmine_ores
set rarity_rank = case id
  when 'stone' then 0
  when 'coal' then 1
  when 'copper' then 2
  when 'iron' then 3
  when 'silver' then 4
  when 'gold' then 5
  when 'jade' then 6
  when 'obsidian' then 7
  when 'topaz' then 8
  when 'amethyst' then 9
  when 'aquamarine' then 10
  when 'ruby' then 11
  when 'sapphire' then 12
  when 'emerald' then 13
  when 'diamond' then 14
  when 'mithril' then 15
end;

alter table public.pointmine_ores
  alter column rarity_rank set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pointmine_ores'::regclass
      and conname = 'pointmine_ores_rarity_rank_range'
  ) then
    alter table public.pointmine_ores
      add constraint pointmine_ores_rarity_rank_range check (rarity_rank between 0 and 15);
  end if;
end;
$$;

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
  v_floor smallint;
  v_experience smallint;
  v_new_floor smallint;
  v_new_experience smallint;
  v_total_experience integer;
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

  select item->>'id', coalesce((item->>'durability')::integer, 0)
  into v_pickaxe_id, v_durability
  from jsonb_array_elements(v_inventory) as item
  where item->>'type' = 'pickaxe' and coalesce((item->>'equipped')::boolean, false)
  limit 1;

  if v_pickaxe_id is null then
    return jsonb_build_object('status', 'no_pickaxe');
  end if;

  if v_durability <= 0 then
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
    and (v_floor < 20 or ore.id <> 'stone')
  order by -ln(greatest(random(), 0.000000000001)) / (
    ore.rarity_weight
    * power(
      0.9::double precision,
      power(
        greatest(
          v_pickaxe_rank - coalesce(ore.min_pickaxe_rank, v_pickaxe_rank),
          0
        )::double precision,
        2
      )
    )
    -- 층과 희귀도가 높을수록 최대 74.25%까지 가중치를 완만하게 올립니다.
    * (1 + ((v_floor - 1) * ore.rarity_rank * 0.0005::double precision))
  )
  limit 1;

  v_remaining := v_durability - 1;
  v_xp_gain := v_pickaxe_rank + 1;
  v_new_floor := v_floor;
  v_new_experience := v_experience;

  if v_floor < 100 then
    v_total_experience := v_experience + v_xp_gain;
    v_new_floor := least(100, v_floor + (v_total_experience / 100));
    v_new_experience := case
      when v_new_floor >= 100 then 0
      else mod(v_total_experience, 100)
    end;
  end if;

  v_floor_up := v_new_floor > v_floor;

  select coalesce(jsonb_agg(
    case
      when item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
        then item || jsonb_build_object(
          'durability', v_remaining,
          'equipped', v_remaining > 0
        )
      else item
    end
    order by ordinal
  ), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);

  if exists (
    select 1 from jsonb_array_elements(v_new_inventory) as item
    where item->>'type' = 'mineral' and item->>'id' = v_ore.id
  ) then
    select coalesce(jsonb_agg(
      case
        when item->>'type' = 'mineral' and item->>'id' = v_ore.id
          then item || jsonb_build_object('quantity', coalesce((item->>'quantity')::integer, 0) + 1)
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
      'quantity', 1
    ));
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
    'remaining_durability', v_remaining,
    'inventory', v_new_inventory,
    'xp_gained', v_xp_gain,
    'mine_floor', v_new_floor,
    'mine_experience', v_new_experience,
    'floor_up', v_floor_up
  );
end;
$$;

revoke all on function public.mine_ore() from public, anon;
grant execute on function public.mine_ore() to authenticated;

comment on column public.users.mine_floor is '포인트 광산 현재 지하 층수. 1~100층';
comment on column public.users.mine_experience is '현재 층 진행 경험치. 층당 100 EXP';
comment on function public.mine_ore() is
  '인증 사용자의 채굴, 내구도, 경험치, 층수, 층별 광물 확률을 원자적으로 처리하는 함수';

commit;
