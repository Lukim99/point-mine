-- VIP 기간 쿠폰 지원과 요청 지급 쿠폰 등록
-- pointmine_coupon_update.sql, pointmine_vip_update.sql 적용 후 실행합니다.

begin;

-- 쿠폰 보상 종류에 VIP 기간(일)을 추가합니다.
alter table public.pointmine_coupons
  drop constraint if exists pointmine_coupons_reward_type_check;

alter table public.pointmine_coupons
  add constraint pointmine_coupons_reward_type_check
  check (reward_type in ('mana', 'mineral', 'monster_item', 'pickaxe', 'chest', 'vip'));

alter table public.pointmine_coupons
  drop constraint if exists pointmine_coupons_vip_reward_valid;

alter table public.pointmine_coupons
  add constraint pointmine_coupons_vip_reward_valid
  check (reward_type <> 'vip' or reward_id = 'days');

-- 기존 쿠폰 사용 함수가 사용 기록을 남길 때 VIP 기간을 원자적으로 연장합니다.
create or replace function public.pointmine_apply_vip_coupon_redemption()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reward_type text;
  v_reward_amount integer;
begin
  select reward_type, reward_amount
  into v_reward_type, v_reward_amount
  from public.pointmine_coupons
  where id = new.coupon_id;

  if v_reward_type = 'vip' then
    update public.users
    set vip_expires_at = greatest(now(), coalesce(vip_expires_at, now()))
      + make_interval(days => v_reward_amount)
    where auth_user_id = new.auth_user_id;

    if not found then
      raise exception '연동된 사용자가 없습니다.' using errcode = 'P0002';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.pointmine_apply_vip_coupon_redemption() from public, anon, authenticated;

drop trigger if exists pointmine_apply_vip_coupon_redemption
  on public.pointmine_coupon_redemptions;

create trigger pointmine_apply_vip_coupon_redemption
after insert on public.pointmine_coupon_redemptions
for each row
execute function public.pointmine_apply_vip_coupon_redemption();

-- 각 코드는 전체 1회만 사용할 수 있습니다.
insert into public.pointmine_coupons
  (code_hash, reward_type, reward_id, reward_amount, max_redemptions, nickname)
values
  (public.pointmine_hash_coupon('VESPA3S723'), 'vip', 'days', 7, 1, null),
  (public.pointmine_hash_coupon('HXJT49WF89'), 'vip', 'days', 7, 1, null),
  (public.pointmine_hash_coupon('VGREGKCUK3'), 'vip', 'days', 7, 1, null),
  (public.pointmine_hash_coupon('LGDTTQ5QDS'), 'chest', 'premium', 2, 1, null),
  (public.pointmine_hash_coupon('WJ5UDZ3JN3'), 'chest', 'premium', 2, 1, null),
  (public.pointmine_hash_coupon('T2424Y4HBS'), 'chest', 'premium', 2, 1, null)
on conflict (code_hash) do update
set reward_type = excluded.reward_type,
    reward_id = excluded.reward_id,
    reward_amount = excluded.reward_amount,
    max_redemptions = excluded.max_redemptions,
    nickname = excluded.nickname;

comment on function public.pointmine_apply_vip_coupon_redemption() is
  'VIP 쿠폰 사용 기록이 생성되면 현재 만료 시각 또는 현재 시각 중 늦은 시점부터 보상 일수만큼 연장';

commit;
