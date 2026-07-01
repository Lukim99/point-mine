-- 곡괭이 등급별 채굴 가중치와 상자 확률을 재조정합니다.
-- 기존 설치 환경에서는 Supabase SQL Editor에서 전체 스크립트를 한 번 실행합니다.

begin;

delete from public.pointmine_chest_drops
where chest_id in ('normal', 'premium');

-- 가중치 총합은 상자별 10,000이며, 1은 표시 확률 0.01%를 의미합니다.
insert into public.pointmine_chest_drops (chest_id, pickaxe_id, weight)
values
  ('normal', 'wood', 2450),
  ('normal', 'stone', 2450),
  ('normal', 'rusty_iron', 2000),
  ('normal', 'bronze', 1600),
  ('normal', 'steel', 900),
  ('normal', 'gold', 400),
  ('normal', 'titanium', 120),
  ('normal', 'platinum', 50),
  ('normal', 'obsidian', 18),
  ('normal', 'alloy', 7),
  ('normal', 'ruby', 3),
  ('normal', 'sapphire', 2),
  ('premium', 'bronze', 5283),
  ('premium', 'steel', 2400),
  ('premium', 'gold', 1300),
  ('premium', 'titanium', 600),
  ('premium', 'platinum', 250),
  ('premium', 'obsidian', 80),
  ('premium', 'alloy', 40),
  ('premium', 'ruby', 17),
  ('premium', 'sapphire', 10),
  ('premium', 'orichalcum', 8),
  ('premium', 'adamantium', 5),
  ('premium', 'astral', 2),
  ('premium', 'master', 5);

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
  v_ore public.pointmine_ores%rowtype;
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
  -- 곡괭이와 광물 해금 등급의 차이가 커질수록 하위 광물 가중치를 제곱 감쇠합니다.
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
  )
  limit 1;

  v_remaining := v_durability - 1;

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
  set inventory = v_new_inventory
  where auth_user_id = v_uid;

  return jsonb_build_object(
    'status', 'success',
    'ore_id', v_ore.id,
    'ore_name', v_ore.name,
    'points', v_ore.sell_price,
    'remaining_durability', v_remaining,
    'inventory', v_new_inventory
  );
end;
$$;

revoke all on function public.mine_ore() from public, anon;
grant execute on function public.mine_ore() to authenticated;

comment on function public.mine_ore() is
  '인증 사용자가 장착한 곡괭이 등급에 따라 하위 광물 가중치를 감쇠해 한 번 채굴하는 함수';

commit;
