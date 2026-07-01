-- 나무 곡괭이 수리비 분배와 곡괭이별 수리 손실 밸런스를 적용합니다.
-- 기존 설치 환경에서는 Supabase SQL Editor에서 전체 스크립트를 한 번 실행합니다.

begin;

delete from public.pointmine_repair_costs;

insert into public.pointmine_repair_costs (pickaxe_id, ore_id, quantity_per_durability)
values
  ('stone', 'stone', 2),
  ('rusty_iron', 'copper', 1),
  ('bronze', 'coal', 2),
  ('steel', 'copper', 2),
  ('gold', 'iron', 1),
  ('titanium', 'silver', 1),
  ('titanium', 'coal', 1),
  ('titanium', 'stone', 1),
  ('platinum', 'silver', 2),
  ('platinum', 'coal', 2),
  ('obsidian', 'obsidian', 1),
  ('alloy', 'obsidian', 1),
  ('alloy', 'silver', 1),
  ('alloy', 'iron', 1),
  ('ruby', 'amethyst', 1),
  ('ruby', 'coal', 1),
  ('ruby', 'stone', 1),
  ('sapphire', 'amethyst', 1),
  ('sapphire', 'gold', 1),
  ('sapphire', 'stone', 1),
  ('orichalcum', 'amethyst', 1),
  ('orichalcum', 'iron', 1),
  ('orichalcum', 'coal', 1),
  ('adamantium', 'aquamarine', 1),
  ('astral', 'emerald', 1),
  ('astral', 'obsidian', 1),
  ('astral', 'coal', 1),
  ('master', 'diamond', 1),
  ('master', 'silver', 1);

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

  select coalesce((item->>'durability')::integer, 0), coalesce((item->>'maxDurability')::integer, 0)
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

    perform 1 from public.companies where name = '엘케이컴퍼니' for update;
    if not found then raise exception '엘케이컴퍼니 정산 계정이 없습니다.' using errcode = 'P0002'; end if;

    perform 1 from public.companies where name = '익테봇' for update;
    if not found then raise exception '익테봇 정산 계정이 없습니다.' using errcode = 'P0002'; end if;

    perform 1 from public.users where nickname = '로또기금' for update;
    if not found then raise exception '로또기금 정산 계정이 없습니다.' using errcode = 'P0002'; end if;

    v_repaired_amount := least(5, v_missing);

    select coalesce(jsonb_agg(
      case when item->>'type' = 'pickaxe' and item->>'id' = 'wood'
        then item || jsonb_build_object('durability', v_durability + v_repaired_amount)
        else item end
      order by ordinal
    ), '[]'::jsonb)
    into v_new_inventory
    from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);

    update public.users
    set inventory = v_new_inventory, balance = balance - 8
    where auth_user_id = v_uid
    returning balance into v_new_balance;

    update public.companies set balance = coalesce(balance, 0) + 6 where name = '엘케이컴퍼니';
    update public.companies set balance = coalesce(balance, 0) + 1 where name = '익테봇';
    update public.users set balance = coalesce(balance, 0) + 1 where nickname = '로또기금';

    return jsonb_build_object('status', 'success', 'repaired_amount', v_repaired_amount, 'durability', v_durability + v_repaired_amount, 'repair_cost_points', 8, 'balance', v_new_balance, 'inventory', v_new_inventory);
  end if;

  if not exists (select 1 from public.pointmine_repair_costs where pickaxe_id = p_pickaxe_id) then
    return jsonb_build_object('status', 'not_repairable');
  end if;

  if p_amount > v_missing then return jsonb_build_object('status', 'invalid_amount'); end if;

  for v_cost in select ore_id, quantity_per_durability from public.pointmine_repair_costs where pickaxe_id = p_pickaxe_id order by ore_id loop
    v_required := v_cost.quantity_per_durability * p_amount;
    select coalesce(sum(case when item->>'quantity' ~ '^[0-9]+$' then (item->>'quantity')::integer else 0 end), 0)::integer
    into v_available from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'mineral' and item->>'id' = v_cost.ore_id;
    if v_available < v_required then
      return jsonb_build_object('status', 'insufficient_materials', 'ore_id', v_cost.ore_id, 'required', v_required, 'available', v_available);
    end if;
  end loop;

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

  select coalesce(jsonb_agg(
    case when item->>'type' = 'pickaxe' and item->>'id' = p_pickaxe_id
      then item || jsonb_build_object('durability', v_durability + p_amount)
      else item end order by ordinal
  ), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_new_inventory) with ordinality as items(item, ordinal);

  update public.users set inventory = v_new_inventory where auth_user_id = v_uid;
  return jsonb_build_object('status', 'success', 'repaired_amount', p_amount, 'durability', v_durability + p_amount, 'balance', v_user_balance, 'inventory', v_new_inventory);
end;
$$;

revoke all on function public.repair_pickaxe(text, integer) from public, anon;
grant execute on function public.repair_pickaxe(text, integer) to authenticated;

comment on function public.repair_pickaxe(text, integer) is
  '나무 수리비 8P를 6:1:1로 분배하고 나머지 곡괭이는 손실형 광물 비용으로 수리하는 함수';

commit;
