-- 쿠폰 시스템: 코드를 SHA-256 해시로 저장하고 보상을 지급
-- pointmine_hunting_update.sql, pointmine_chest_profit_update.sql,
-- pointmine_kakao_notify_update.sql 적용 후 실행합니다.
--
-- 코드는 평문으로 저장하지 않고 정규화(대문자·공백제거) 후 SHA-256 해시로 저장합니다.
-- 사용 시 입력 코드를 동일하게 해시해 대조하므로 원본 코드는 복원되지 않습니다.
-- 보상 종류: 마나 / 광물 / 몬스터 아이템 / 곡괭이 / 상자 뽑기권(일반·고급, 1회·5회)

begin;

create extension if not exists pgcrypto;

-- 쿠폰 코드 정규화 후 SHA-256 해시(16진수 문자열)를 반환합니다. 저장·조회에 동일하게 사용합니다.
create or replace function public.pointmine_hash_coupon(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');
$$;

-- 쿠폰 정의
create table if not exists public.pointmine_coupons (
  id bigint generated always as identity primary key,
  code_hash text not null unique,
  -- reward_type: mana | mineral | monster_item | pickaxe | chest
  reward_type text not null check (reward_type in ('mana', 'mineral', 'monster_item', 'pickaxe', 'chest')),
  -- reward_id: 광물/몬스터아이템/곡괭이의 id, 상자는 'normal'|'premium', 마나는 null
  reward_id text,
  -- reward_amount: 마나량 / 아이템 수량 / 곡괭이 개수 / 상자 뽑기 횟수
  reward_amount integer not null check (reward_amount > 0),
  -- null이면 사용 인원 제한 없음(단, 사용자당 1회)
  max_redemptions integer,
  -- null이면 누구나 사용 가능하며, 값이 있으면 해당 닉네임에 귀속됩니다.
  nickname text,
  created_at timestamptz not null default now(),
  check (reward_type = 'mana' or reward_id is not null),
  check (reward_type <> 'chest' or reward_id in ('normal', 'premium')),
  constraint pointmine_coupons_nickname_valid
    check (nickname is null or nickname = btrim(nickname) and nickname <> '')
);

-- 기존 쿠폰 테이블에도 닉네임 귀속 필드를 추가합니다.
alter table public.pointmine_coupons
  add column if not exists nickname text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pointmine_coupons'::regclass
      and conname = 'pointmine_coupons_nickname_valid'
  ) then
    alter table public.pointmine_coupons
      add constraint pointmine_coupons_nickname_valid
      check (nickname is null or nickname = btrim(nickname) and nickname <> '');
  end if;
end;
$$;

-- 사용 기록 (사용자당 쿠폰 1회)
create table if not exists public.pointmine_coupon_redemptions (
  id bigint generated always as identity primary key,
  coupon_id bigint not null references public.pointmine_coupons(id) on delete cascade,
  auth_user_id uuid not null,
  redeemed_at timestamptz not null default now(),
  unique (coupon_id, auth_user_id)
);

alter table public.pointmine_coupons enable row level security;
alter table public.pointmine_coupon_redemptions enable row level security;
revoke all on public.pointmine_coupons from anon, authenticated;
revoke all on public.pointmine_coupon_redemptions from anon, authenticated;
revoke all on function public.pointmine_hash_coupon(text) from public, anon, authenticated;

-- 유료 구매와 쿠폰 개봉을 로그에서 구분합니다. 기존 로그는 유료 구매로 처리됩니다.
alter table public.pointmine_chest_openings
  add column if not exists opening_source text not null default 'purchase';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pointmine_chest_openings'::regclass
      and conname = 'pointmine_chest_openings_source_valid'
  ) then
    alter table public.pointmine_chest_openings
      add constraint pointmine_chest_openings_source_valid
      check (opening_source in ('purchase', 'coupon'));
  end if;
end;
$$;

-- 유료 구매는 양수 가격, 쿠폰 개봉은 0원만 허용합니다.
alter table public.pointmine_chest_openings
  drop constraint if exists pointmine_chest_openings_price_check;

alter table public.pointmine_chest_openings
  add constraint pointmine_chest_openings_price_check
  check (
    (opening_source = 'purchase' and price > 0)
    or (opening_source = 'coupon' and price = 0)
  );

-- 쿠폰 사용: 코드 해시로 쿠폰을 찾아 보상을 지급합니다.
create or replace function public.redeem_coupon(p_code text)
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
  v_nickname text;
  v_coupon record;
  v_chest_name text;
  v_net_profit numeric(20, 4);
  v_redeemed integer;
  v_count integer;
  v_i integer;
  v_has_equipped boolean;
  v_is_duplicate boolean;
  v_pickaxe_id text;
  v_pickaxe_name text;
  v_pickaxe_durability integer;
  v_pickaxe_ev numeric(14, 4);
  v_reward_names text[] := '{}'::text[];
  v_results jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select id, reward_type, reward_id, reward_amount, max_redemptions, nickname
  into v_coupon
  from public.pointmine_coupons
  where code_hash = public.pointmine_hash_coupon(p_code)
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select nickname, inventory, mana
  into v_nickname, v_inventory, v_mana
  from public.users
  where auth_user_id = v_uid
  for update;

  if not found then
    raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
  end if;

  -- 닉네임이 지정된 쿠폰은 해당 닉네임으로 연동된 사용자만 사용할 수 있습니다.
  if v_coupon.nickname is not null and v_coupon.nickname <> v_nickname then
    return jsonb_build_object('status', 'nickname_mismatch');
  end if;

  -- 사용자당 1회
  if exists (
    select 1 from public.pointmine_coupon_redemptions
    where coupon_id = v_coupon.id and auth_user_id = v_uid
  ) then
    return jsonb_build_object('status', 'already_redeemed');
  end if;

  -- 전체 사용 인원 제한
  if v_coupon.max_redemptions is not null then
    select count(*) into v_redeemed
    from public.pointmine_coupon_redemptions
    where coupon_id = v_coupon.id;
    if v_redeemed >= v_coupon.max_redemptions then
      return jsonb_build_object('status', 'exhausted');
    end if;
  end if;

  if jsonb_typeof(v_inventory) <> 'array' then
    v_inventory := '[]'::jsonb;
  end if;
  v_new_inventory := v_inventory;

  if v_coupon.reward_type = 'mana' then
    update public.users
    set mana = coalesce(mana, 0) + v_coupon.reward_amount
    where auth_user_id = v_uid
    returning mana into v_mana;

  elsif v_coupon.reward_type in ('mineral', 'monster_item') then
    if exists (
      select 1 from jsonb_array_elements(v_new_inventory) as item
      where item->>'type' = v_coupon.reward_type and item->>'id' = v_coupon.reward_id
    ) then
      select coalesce(jsonb_agg(
        case when item->>'type' = v_coupon.reward_type and item->>'id' = v_coupon.reward_id
          then item || jsonb_build_object('quantity', coalesce((item->>'quantity')::integer, 0) + v_coupon.reward_amount)
          else item end
        order by ordinal
      ), '[]'::jsonb)
      into v_new_inventory
      from jsonb_array_elements(v_new_inventory) with ordinality as items(item, ordinal);
    else
      v_new_inventory := v_new_inventory || jsonb_build_array(jsonb_build_object(
        'type', v_coupon.reward_type, 'id', v_coupon.reward_id, 'quantity', v_coupon.reward_amount
      ));
    end if;

    update public.users set inventory = v_new_inventory where auth_user_id = v_uid;

  elsif v_coupon.reward_type = 'pickaxe' then
    select max_durability into v_pickaxe_durability
    from public.pointmine_pickaxes where id = v_coupon.reward_id;
    if v_pickaxe_durability is null then
      return jsonb_build_object('status', 'invalid');
    end if;

    select exists (
      select 1 from jsonb_array_elements(v_new_inventory) as item
      where item->>'type' = 'pickaxe' and coalesce((item->>'equipped')::boolean, false)
    ) into v_has_equipped;

    -- reward_amount 개수만큼 지급(중복은 기본 내구도 합산)
    select exists (
      select 1 from jsonb_array_elements(v_new_inventory) as item
      where item->>'type' = 'pickaxe' and item->>'id' = v_coupon.reward_id
    ) into v_is_duplicate;

    if v_is_duplicate then
      select coalesce(jsonb_agg(
        case when item->>'type' = 'pickaxe' and item->>'id' = v_coupon.reward_id
          then item || jsonb_build_object(
            'durability', coalesce((item->>'durability')::integer, 0) + v_pickaxe_durability * v_coupon.reward_amount,
            'maxDurability', coalesce((item->>'maxDurability')::integer, 0) + v_pickaxe_durability * v_coupon.reward_amount
          )
          else item end
        order by ordinal
      ), '[]'::jsonb)
      into v_new_inventory
      from jsonb_array_elements(v_new_inventory) with ordinality as items(item, ordinal);
    else
      v_new_inventory := v_new_inventory || jsonb_build_array(jsonb_build_object(
        'type', 'pickaxe',
        'id', v_coupon.reward_id,
        'durability', v_pickaxe_durability * v_coupon.reward_amount,
        'maxDurability', v_pickaxe_durability * v_coupon.reward_amount,
        'equipped', not v_has_equipped
      ));
    end if;

    update public.users set inventory = v_new_inventory where auth_user_id = v_uid;

  elsif v_coupon.reward_type = 'chest' then
    -- 쿠폰은 매출 없이 곡괭이 기댓값만 순이익에서 차감합니다.
    -- 황금(등급 5) 이상은 현재 순이익이 기댓값 이상일 때만 후보에 포함합니다.
    v_count := v_coupon.reward_amount;

    select name into v_chest_name
    from public.pointmine_chests
    where id = v_coupon.reward_id;

    if not found then
      return jsonb_build_object('status', 'invalid');
    end if;

    select net_profit into v_net_profit
    from public.pointmine_chest_ledger
    where id = true
    for update;

    if not found then
      insert into public.pointmine_chest_ledger (id, net_profit)
      values (true, 0)
      on conflict (id) do nothing;

      select net_profit into v_net_profit
      from public.pointmine_chest_ledger
      where id = true
      for update;
    end if;

    v_net_profit := coalesce(v_net_profit, 0);

    select exists (
      select 1 from jsonb_array_elements(v_new_inventory) as item
      where item->>'type' = 'pickaxe' and coalesce((item->>'equipped')::boolean, false)
    ) into v_has_equipped;

    for v_i in 1..v_count loop
      select pickaxe.id, pickaxe.name, pickaxe.max_durability, pickaxe.expected_value
      into v_pickaxe_id, v_pickaxe_name, v_pickaxe_durability, v_pickaxe_ev
      from public.pointmine_chest_drops as drop_rate
      join public.pointmine_pickaxes as pickaxe on pickaxe.id = drop_rate.pickaxe_id
      where drop_rate.chest_id = v_coupon.reward_id
        and not (v_coupon.reward_id = 'premium' and pickaxe.id = 'master')
        and (pickaxe.rarity_rank < 5 or pickaxe.expected_value <= v_net_profit)
      order by -ln(greatest(random(), 0.000000000001)) / drop_rate.weight
      limit 1;

      if v_pickaxe_id is null then
        raise exception '상자 확률 정보가 없습니다.' using errcode = 'P0002';
      end if;

      select exists (
        select 1 from jsonb_array_elements(v_new_inventory) as item
        where item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
      ) into v_is_duplicate;

      if v_is_duplicate then
        select coalesce(jsonb_agg(
          case when item->>'type' = 'pickaxe' and item->>'id' = v_pickaxe_id
            then item || jsonb_build_object(
              'durability', coalesce((item->>'durability')::integer, 0) + v_pickaxe_durability,
              'maxDurability', coalesce((item->>'maxDurability')::integer, v_pickaxe_durability) + v_pickaxe_durability
            )
            else item end
          order by ordinal
        ), '[]'::jsonb)
        into v_new_inventory
        from jsonb_array_elements(v_new_inventory) with ordinality as items(item, ordinal);
      else
        v_new_inventory := v_new_inventory || jsonb_build_array(jsonb_build_object(
          'type', 'pickaxe',
          'id', v_pickaxe_id,
          'durability', v_pickaxe_durability,
          'maxDurability', v_pickaxe_durability,
          'equipped', not v_has_equipped
        ));
        v_has_equipped := true;
      end if;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'pickaxe_id', v_pickaxe_id,
        'pickaxe_name', v_pickaxe_name,
        'durability', v_pickaxe_durability,
        'is_duplicate', v_is_duplicate
      ));

      v_reward_names := array_append(v_reward_names, v_pickaxe_name);
      v_net_profit := v_net_profit - v_pickaxe_ev;

      insert into public.pointmine_chest_openings
        (auth_user_id, chest_id, pickaxe_id, price, lk_company_share, iktebot_share,
         lotto_fund_share, net_profit, opening_source)
      values
        (v_uid, v_coupon.reward_id, v_pickaxe_id, 0, 0, 0, 0, -v_pickaxe_ev, 'coupon');
    end loop;

    update public.users
    set inventory = v_new_inventory
    where auth_user_id = v_uid;

    update public.pointmine_chest_ledger
    set net_profit = v_net_profit
    where id = true;

    if v_count = 1 then
      perform public.send_kakao_notification(
        '[ 포인트 광산 알림 ]' || E'\n' ||
        '✅ ' || v_nickname || '님이 쿠폰으로 ' || v_chest_name || '를 열었습니다.' || E'\n' ||
        '⛏️ 획득 곡괭이: ' || v_reward_names[1]
      );
    else
      perform public.send_kakao_notification(
        '[ 포인트 광산 알림 ]' || E'\n' ||
        '✅ ' || v_nickname || '님이 쿠폰으로 ' || v_chest_name || ' ' || v_count || '개를 열었습니다.' || E'\n' ||
        '⛏️ 획득 곡괭이:' || E'\n- ' || array_to_string(v_reward_names, E'\n- ')
      );
    end if;
  end if;

  insert into public.pointmine_coupon_redemptions (coupon_id, auth_user_id)
  values (v_coupon.id, v_uid);

  return jsonb_build_object(
    'status', 'success',
    'reward_type', v_coupon.reward_type,
    'reward_id', v_coupon.reward_id,
    'reward_amount', v_coupon.reward_amount,
    'chest_id', case when v_coupon.reward_type = 'chest' then v_coupon.reward_id end,
    'count', case when v_coupon.reward_type = 'chest' then v_count end,
    'results', v_results,
    'mana', v_mana,
    'inventory', v_new_inventory
  );
end;
$$;

revoke all on function public.redeem_coupon(text) from public, anon;
grant execute on function public.redeem_coupon(text) to authenticated;

-- 지급 쿠폰 등록 (고급 상자 5회 뽑기권)
insert into public.pointmine_coupons (code_hash, reward_type, reward_id, reward_amount)
values
  (public.pointmine_hash_coupon('DAQ2JDS5'), 'chest', 'premium', 5),
  (public.pointmine_hash_coupon('PSGB21OA'), 'chest', 'premium', 5)
on conflict (code_hash) do update
set reward_type = excluded.reward_type,
    reward_id = excluded.reward_id,
    reward_amount = excluded.reward_amount;

-- 추가 지급 쿠폰 등록 (고급 상자 1회 뽑기권)
insert into public.pointmine_coupons
  (code_hash, reward_type, reward_id, reward_amount, nickname)
values
  (public.pointmine_hash_coupon('8FKQJSAD'), 'chest', 'premium', 1, null),
  (public.pointmine_hash_coupon('DAPS092E'), 'chest', 'premium', 1, null),
  (public.pointmine_hash_coupon('FZXSWKJR'), 'chest', 'premium', 1, null),
  (public.pointmine_hash_coupon('091ZMXND'), 'chest', 'premium', 1, null),
  (public.pointmine_hash_coupon('OPAS92AS'), 'chest', 'premium', 1, null),
  (public.pointmine_hash_coupon('ZXJVCFJSD'), 'chest', 'premium', 1, null),
  (public.pointmine_hash_coupon('BNSRETIO'), 'chest', 'premium', 1, null),
  (public.pointmine_hash_coupon('7ZNDI3DK'), 'chest', 'premium', 1, null)
on conflict (code_hash) do update
set reward_type = excluded.reward_type,
    reward_id = excluded.reward_id,
    reward_amount = excluded.reward_amount,
    nickname = excluded.nickname;

comment on table public.pointmine_coupons is
  '쿠폰 정의. 코드는 pointmine_hash_coupon(SHA-256)으로 해시해 저장하며 nickname이 있으면 해당 닉네임에 귀속';
comment on column public.pointmine_coupons.nickname is
  '쿠폰 귀속 닉네임. NULL이면 모든 연동 사용자가 사용 가능';
comment on column public.pointmine_chest_openings.opening_source is
  '상자 개봉 경로. purchase는 포인트 구매, coupon은 쿠폰 보상';
comment on function public.redeem_coupon(text) is
  '코드와 귀속 닉네임을 확인해 보상을 지급하며 쿠폰 상자는 기댓값 차감·로그·카카오 알림을 적용하는 함수';

commit;
