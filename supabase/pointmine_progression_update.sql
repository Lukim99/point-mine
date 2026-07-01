-- 층별 필요 경험치를 매 층 2배로 증가시키고 대형 정수 정밀도를 보존합니다.
-- pointmine_special_rules_update.sql 적용 후 Supabase SQL Editor에서 실행합니다.

begin;

alter table public.users
  drop constraint if exists users_mine_experience_range;

alter table public.users
  alter column mine_experience type numeric(40, 0)
  using mine_experience::numeric;

update public.users
set mine_experience = case
  when mine_floor >= 100 then 0
  else greatest(0, least(
    mine_experience,
    (100 * power(2::numeric, mine_floor - 1)) - 1
  ))
end;

alter table public.users
  add constraint users_mine_experience_range check (
    mine_experience >= 0
    and (
      (mine_floor = 100 and mine_experience = 0)
      or (
        mine_floor < 100
        and mine_experience < 100 * power(2::numeric, mine_floor - 1)
      )
    )
  );

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
    and (v_floor < 20 or ore.id <> 'stone' or v_pickaxe_id = 'wood')
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
    * (1 + ((v_floor - 1) * ore.rarity_rank * 0.0005::double precision))
  )
  limit 1;

  v_remaining := v_durability - 1;
  v_xp_gain := case when v_floor < 100 then v_pickaxe_rank + 1 else 0 end;
  v_new_floor := v_floor;
  v_new_experience := v_experience;

  if v_floor < 100 then
    v_required_experience := 100 * power(2::numeric, v_floor - 1);
    v_total_experience := v_experience + v_xp_gain;

    if v_total_experience >= v_required_experience then
      v_new_floor := least(100, v_floor + 1);
      v_new_experience := case
        when v_new_floor >= 100 then 0
        else v_total_experience - v_required_experience
      end;
    else
      v_new_experience := v_total_experience;
    end if;
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
    'mine_experience', v_new_experience::text,
    'required_experience', case
      when v_new_floor >= 100 then '0'
      else (100 * power(2::numeric, v_new_floor - 1))::text
    end,
    'floor_up', v_floor_up
  );
end;
$$;

revoke all on function public.mine_ore() from public, anon;
grant execute on function public.mine_ore() to authenticated;

comment on column public.users.mine_experience is
  '현재 층 진행 경험치. 다음 층 요구량은 100 × 2^(현재 층-1)';
comment on function public.mine_ore() is
  '매 층 2배 경험치 요구량과 대형 정수 정밀도를 적용한 원자적 채굴 함수';

commit;
