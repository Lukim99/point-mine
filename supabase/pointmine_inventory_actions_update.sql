-- 기존 포인트 광산 DB에 선택 판매와 곡괭이 수리 기능을 추가합니다.
-- Supabase SQL Editor에서 전체 스크립트를 한 번 실행합니다.

begin;

create table if not exists public.pointmine_repair_costs (
  pickaxe_id text not null references public.pointmine_pickaxes(id) on delete cascade,
  ore_id text not null references public.pointmine_ores(id),
  quantity_per_durability integer not null check (quantity_per_durability > 0),
  primary key (pickaxe_id, ore_id)
);

delete from public.pointmine_repair_costs;

insert into public.pointmine_repair_costs (pickaxe_id, ore_id, quantity_per_durability)
values
  ('stone', 'stone', 2),
  ('rusty_iron', 'iron', 1),
  ('bronze', 'copper', 2),
  ('steel', 'iron', 2),
  ('gold', 'gold', 1),
  ('titanium', 'iron', 2),
  ('titanium', 'silver', 1),
  ('platinum', 'silver', 2),
  ('obsidian', 'obsidian', 1),
  ('alloy', 'obsidian', 1),
  ('alloy', 'iron', 1),
  ('ruby', 'ruby', 1),
  ('sapphire', 'sapphire', 1),
  ('orichalcum', 'emerald', 1),
  ('adamantium', 'diamond', 1),
  ('astral', 'diamond', 1),
  ('astral', 'aquamarine', 1),
  ('master', 'mithril', 1);

alter table public.pointmine_repair_costs enable row level security;
revoke all on public.pointmine_repair_costs from anon, authenticated;

create or replace function public.sell_selected_minerals(p_ore_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ore_ids text[];
  v_inventory jsonb;
  v_new_inventory jsonb;
  v_total bigint;
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

  select inventory into v_inventory
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

  select balance into v_company_balance
  from public.companies
  where name = '엘케이컴퍼니'
  for update;

  if not found then
    return jsonb_build_object('status', 'company_not_found');
  end if;

  if coalesce(v_company_balance, 0) < v_total then
    return jsonb_build_object('status', 'company_insufficient');
  end if;

  select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal)
  where not (
    item->>'type' = 'mineral'
    and item->>'id' = any(v_ore_ids)
  );

  update public.users
  set balance = coalesce(balance, 0) + v_total,
      inventory = v_new_inventory
  where auth_user_id = v_uid
  returning balance into v_new_balance;

  update public.companies
  set balance = balance - v_total
  where name = '엘케이컴퍼니';

  return jsonb_build_object(
    'status', 'success',
    'sold_points', v_total,
    'balance', v_new_balance,
    'inventory', v_new_inventory
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
  v_durability integer;
  v_max_durability integer;
  v_missing integer;
  v_available integer;
  v_required integer;
  v_cost record;
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

  if not exists (select 1 from public.pointmine_repair_costs where pickaxe_id = p_pickaxe_id) then
    return jsonb_build_object('status', 'not_repairable');
  end if;

  v_missing := greatest(v_max_durability - v_durability, 0);
  if v_missing = 0 then
    return jsonb_build_object('status', 'no_damage');
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > v_missing then
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
    'inventory', v_new_inventory
  );
end;
$$;

revoke all on function public.sell_selected_minerals(text[]) from public, anon;
revoke all on function public.repair_pickaxe(text, integer) from public, anon;

grant execute on function public.sell_selected_minerals(text[]) to authenticated;
grant execute on function public.repair_pickaxe(text, integer) to authenticated;

comment on function public.sell_selected_minerals(text[]) is
  '인증 사용자가 선택한 광물 스택만 판매하고 잔액을 원자적으로 정산하는 함수';

comment on function public.repair_pickaxe(text, integer) is
  '인증 사용자의 수리 재료를 검증·차감하고 곡괭이 내구도를 원자적으로 복구하는 함수';

commit;
