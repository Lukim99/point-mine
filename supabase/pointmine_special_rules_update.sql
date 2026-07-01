-- 나무 곡괭이 포인트 수리, 20층 돌 예외, 고급 상자 실제 지급 제한을 적용합니다.
-- pointmine_experience_update.sql 적용 후 Supabase SQL Editor에서 전체 스크립트를 실행합니다.

begin;

-- 표시 확률은 프런트에 유지하지만 서버 추첨 데이터에서는 오리하르콘 이상을 제거합니다.
delete from public.pointmine_chest_drops
where chest_id = 'premium'
  and pickaxe_id in ('orichalcum', 'adamantium', 'astral', 'master');

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
  v_user_balance numeric;
  v_new_balance numeric;
  v_durability integer;
  v_max_durability integer;
  v_missing integer;
  v_repaired_amount integer;
  v_available integer;
  v_required integer;
  v_cost record;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  select inventory, balance
  into v_inventory, v_user_balance
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  select
    coalesce((item->>'durability')::integer, 0),
    coalesce((item->>'maxDurability')::integer, 0)
  into v_durability, v_max_durability
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

  if p_pickaxe_id = 'wood' then
    if coalesce(v_user_balance, 0) < 8 then
      return jsonb_build_object('status', 'insufficient_balance', 'required_points', 8, 'balance', coalesce(v_user_balance, 0));
    end if;

    v_repaired_amount := least(5, v_missing);

    select coalesce(jsonb_agg(
      case
        when item->>'type' = 'pickaxe' and item->>'id' = 'wood'
          then item || jsonb_build_object('durability', v_durability + v_repaired_amount)
        else item
      end
      order by ordinal
    ), '[]'::jsonb)
    into v_new_inventory
    from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);

    update public.users
    set inventory = v_new_inventory,
        balance = balance - 8
    where auth_user_id = v_uid
    returning balance into v_new_balance;

    return jsonb_build_object(
      'status', 'success',
      'repaired_amount', v_repaired_amount,
      'durability', v_durability + v_repaired_amount,
      'repair_cost_points', 8,
      'balance', v_new_balance,
      'inventory', v_new_inventory
    );
  end if;

  if not exists (select 1 from public.pointmine_repair_costs where pickaxe_id = p_pickaxe_id) then
    return jsonb_build_object('status', 'not_repairable');
  end if;

  if p_amount > v_missing then
    return jsonb_build_object('status', 'invalid_amount');
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
    v_required := v_cost.quantity_per_durability * p_amount;

    select coalesce(jsonb_agg(updated_item order by ordinal), '[]'::jsonb)
    into v_new_inventory
    from (
      select
        ordinal,
        case
          when item->>'type' = 'mineral' and item->>'id' = v_cost.ore_id
            then item || jsonb_build_object('quantity', (item->>'quantity')::integer - v_required)
          else item
        end as updated_item
      from jsonb_array_elements(v_new_inventory) with ordinality as items(item, ordinal)
      where not (
        item->>'type' = 'mineral'
        and item->>'id' = v_cost.ore_id
        and (item->>'quantity')::integer <= v_required
      )
    ) as rebuilt;
  end loop;

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

  update public.users
  set inventory = v_new_inventory
  where auth_user_id = v_uid;

  return jsonb_build_object(
    'status', 'success',
    'repaired_amount', p_amount,
    'durability', v_durability + p_amount,
    'balance', v_user_balance,
    'inventory', v_new_inventory
  );
end;
$$;

revoke all on function public.mine_ore() from public, anon;
revoke all on function public.repair_pickaxe(text, integer) from public, anon;

grant execute on function public.mine_ore() to authenticated;
grant execute on function public.repair_pickaxe(text, integer) to authenticated;

comment on function public.mine_ore() is
  '인증 사용자의 채굴과 경험치를 처리하며 20층 이상에서도 나무 곡괭이에 돌을 허용하는 함수';
comment on function public.repair_pickaxe(text, integer) is
  '나무 곡괭이는 8P로 최대 5 내구도, 나머지는 광물 재료로 수리하는 함수';

commit;
