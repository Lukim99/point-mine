-- 포인트 광산 데이터 구조와 서버 전용 게임 로직
-- Supabase SQL Editor에서 전체 스크립트를 한 번 실행합니다.

begin;

alter table public.users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists balance bigint not null default 0,
  add column if not exists inventory jsonb not null default '[]'::jsonb;

update public.users
set inventory = '[]'::jsonb
where inventory is null or jsonb_typeof(inventory) <> 'array';

alter table public.users
  alter column inventory set default '[]'::jsonb,
  alter column inventory set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_inventory_is_array'
  ) then
    alter table public.users
      add constraint users_inventory_is_array
      check (jsonb_typeof(inventory) = 'array');
  end if;
end;
$$;

-- 닉네임과 카카오 계정은 각각 하나의 사용자만 소유합니다.
create unique index if not exists users_nickname_unique_idx
  on public.users (nickname);

create unique index if not exists users_auth_user_id_unique_idx
  on public.users (auth_user_id)
  where auth_user_id is not null;

create table if not exists public.pointmine_pickaxes (
  id text primary key,
  name text not null unique,
  rarity_rank smallint not null unique check (rarity_rank between 0 and 15),
  sprite_index smallint not null unique check (sprite_index between 0 and 15),
  max_durability integer not null check (max_durability > 0)
);

insert into public.pointmine_pickaxes (id, name, rarity_rank, sprite_index, max_durability)
values
  ('wood', '나무 곡괭이', 0, 0, 5),
  ('stone', '돌 곡괭이', 1, 1, 8),
  ('rusty_iron', '녹슨 철 곡괭이', 2, 2, 12),
  ('bronze', '청동 곡괭이', 3, 4, 18),
  ('steel', '강철 곡괭이', 4, 3, 26),
  ('gold', '황금 곡괭이', 5, 5, 38),
  ('titanium', '티타늄 곡괭이', 6, 6, 55),
  ('platinum', '백금 곡괭이', 7, 7, 80),
  ('obsidian', '흑요석 곡괭이', 8, 8, 115),
  ('alloy', '강화 합금 곡괭이', 9, 9, 165),
  ('ruby', '루비 곡괭이', 10, 10, 235),
  ('sapphire', '사파이어 곡괭이', 11, 11, 330),
  ('orichalcum', '오리하르콘 곡괭이', 12, 12, 460),
  ('adamantium', '아다만티움 곡괭이', 13, 13, 640),
  ('astral', '아스트랄 곡괭이', 14, 14, 880),
  ('master', '마스터 곡괭이', 15, 15, 1200)
on conflict (id) do update set
  name = excluded.name,
  rarity_rank = excluded.rarity_rank,
  sprite_index = excluded.sprite_index,
  max_durability = excluded.max_durability;

create table if not exists public.pointmine_ores (
  id text primary key,
  name text not null unique,
  sell_price bigint not null check (sell_price > 0),
  min_pickaxe_rank smallint,
  exact_pickaxe_id text references public.pointmine_pickaxes(id),
  blocked_pickaxe_id text references public.pointmine_pickaxes(id),
  rarity_weight double precision not null check (rarity_weight > 0),
  check (min_pickaxe_rank is not null or exact_pickaxe_id is not null)
);

-- 희귀도 가중치는 단계마다 0.55배가 되어 상위 광물 확률이 기하급수적으로 감소합니다.
insert into public.pointmine_ores
  (id, name, sell_price, min_pickaxe_rank, exact_pickaxe_id, blocked_pickaxe_id, rarity_weight)
values
  ('stone', '돌', 1, 0, null, null, power(0.55, 0)),
  ('coal', '석탄', 2, 0, null, null, power(0.55, 1)),
  ('copper', '구리 광석', 3, 1, null, null, power(0.55, 2)),
  ('iron', '철 광석', 5, 1, null, null, power(0.55, 3)),
  ('silver', '은 광석', 10, 2, null, null, power(0.55, 4)),
  ('gold', '금 광석', 15, 3, null, null, power(0.55, 5)),
  ('jade', '비취석', 25, 4, null, 'gold', power(0.55, 6)),
  ('obsidian', '흑요석', 40, 6, null, null, power(0.55, 7)),
  ('topaz', '토파즈', 60, 7, null, null, power(0.55, 8)),
  ('amethyst', '자수정', 80, 8, null, null, power(0.55, 9)),
  ('aquamarine', '아쿠아마린', 100, 9, null, null, power(0.55, 10)),
  ('ruby', '루비', 250, null, 'ruby', null, power(0.55, 11)),
  ('sapphire', '사파이어', 300, null, 'sapphire', null, power(0.55, 12)),
  ('emerald', '에메랄드', 150, 12, null, null, power(0.55, 13)),
  ('diamond', '다이아몬드', 400, 14, null, null, power(0.55, 14)),
  ('mithril', '미스릴', 1000, 15, null, null, power(0.55, 15))
on conflict (id) do update set
  name = excluded.name,
  sell_price = excluded.sell_price,
  min_pickaxe_rank = excluded.min_pickaxe_rank,
  exact_pickaxe_id = excluded.exact_pickaxe_id,
  blocked_pickaxe_id = excluded.blocked_pickaxe_id,
  rarity_weight = excluded.rarity_weight;

alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.pointmine_pickaxes enable row level security;
alter table public.pointmine_ores enable row level security;

drop policy if exists pointmine_select_own_user on public.users;
create policy pointmine_select_own_user
  on public.users
  for select
  to authenticated
  using ((select auth.uid()) = auth_user_id);

drop policy if exists pointmine_read_pickaxes on public.pointmine_pickaxes;
create policy pointmine_read_pickaxes
  on public.pointmine_pickaxes
  for select
  to authenticated
  using (true);

drop policy if exists pointmine_read_ores on public.pointmine_ores;
create policy pointmine_read_ores
  on public.pointmine_ores
  for select
  to authenticated
  using (true);

-- 새 프로젝트의 Data API 비공개 기본값에도 대응합니다.
grant select on public.users to authenticated;
grant select on public.pointmine_pickaxes to authenticated;
grant select on public.pointmine_ores to authenticated;
revoke all on public.companies from anon, authenticated;
revoke insert, update, delete on public.users from anon, authenticated;
revoke insert, update, delete on public.pointmine_pickaxes from anon, authenticated;
revoke insert, update, delete on public.pointmine_ores from anon, authenticated;

create or replace function public.link_pointmine_account(p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_auth_user_id uuid;
  v_inventory jsonb;
  v_wood_durability integer;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  if exists (select 1 from public.users where auth_user_id = v_uid) then
    return jsonb_build_object('status', 'already_linked');
  end if;

  select auth_user_id, inventory
  into v_auth_user_id, v_inventory
  from public.users
  where nickname = btrim(p_nickname)
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_auth_user_id is not null and v_auth_user_id <> v_uid then
    return jsonb_build_object('status', 'already_taken');
  end if;

  if jsonb_typeof(v_inventory) <> 'array' then
    v_inventory := '[]'::jsonb;
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'pickaxe' and item->>'id' = 'wood'
  ) then
    select max_durability into v_wood_durability
    from public.pointmine_pickaxes
    where id = 'wood';

    v_inventory := v_inventory || jsonb_build_array(jsonb_build_object(
      'type', 'pickaxe',
      'id', 'wood',
      'durability', v_wood_durability,
      'maxDurability', v_wood_durability,
      'equipped', true
    ));
  end if;

  update public.users
  set auth_user_id = v_uid,
      inventory = v_inventory
  where nickname = btrim(p_nickname);

  return jsonb_build_object('status', 'success');
end;
$$;

create or replace function public.equip_pickaxe(p_pickaxe_id text)
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
    select 1
    from jsonb_array_elements(v_inventory) as item
    where item->>'type' = 'pickaxe'
      and item->>'id' = p_pickaxe_id
      and coalesce((item->>'durability')::integer, 0) > 0
  ) then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select coalesce(jsonb_agg(
    case
      when item->>'type' = 'pickaxe'
        then item || jsonb_build_object('equipped', item->>'id' = p_pickaxe_id)
      else item
    end
    order by ordinal
  ), '[]'::jsonb)
  into v_new_inventory
  from jsonb_array_elements(v_inventory) with ordinality as items(item, ordinal);

  update public.users
  set inventory = v_new_inventory
  where auth_user_id = v_uid;

  return jsonb_build_object('status', 'success', 'inventory', v_new_inventory);
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
  order by -ln(greatest(random(), 0.000000000001)) / ore.rarity_weight
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

create or replace function public.sell_all_minerals()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inventory jsonb;
  v_new_inventory jsonb;
  v_total bigint;
  v_company_balance numeric;
  v_new_balance numeric;
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

  select coalesce(sum(
    ore.sell_price * case
      when item->>'quantity' ~ '^[0-9]+$' then (item->>'quantity')::integer
      else 0
    end
  ), 0)::bigint
  into v_total
  from jsonb_array_elements(v_inventory) as item
  join public.pointmine_ores as ore on ore.id = item->>'id'
  where item->>'type' = 'mineral';

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
    and exists (select 1 from public.pointmine_ores where id = item->>'id')
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

revoke all on function public.link_pointmine_account(text) from public, anon;
revoke all on function public.equip_pickaxe(text) from public, anon;
revoke all on function public.mine_ore() from public, anon;
revoke all on function public.sell_all_minerals() from public, anon;

grant execute on function public.link_pointmine_account(text) to authenticated;
grant execute on function public.equip_pickaxe(text) to authenticated;
grant execute on function public.mine_ore() to authenticated;
grant execute on function public.sell_all_minerals() to authenticated;

comment on column public.users.inventory is
  '포인트 광산 인벤토리. [{"type":"pickaxe",...}, {"type":"mineral",...}] 형식의 JSON 배열';

commit;
