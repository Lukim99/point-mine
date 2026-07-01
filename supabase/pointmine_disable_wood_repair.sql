-- 나무 곡괭이 수리를 서버에서 비활성화합니다.
-- pointmine_repair_economy_update.sql 적용 후 실행합니다.

begin;

do $$
begin
  if to_regprocedure('public.repair_pickaxe_with_wood(text,integer)') is null then
    alter function public.repair_pickaxe(text, integer)
      rename to repair_pickaxe_with_wood;
  end if;
end;
$$;

revoke all on function public.repair_pickaxe_with_wood(text, integer) from public, anon, authenticated;

create or replace function public.repair_pickaxe(p_pickaxe_id text, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  if p_pickaxe_id = 'wood' then
    return jsonb_build_object('status', 'not_repairable');
  end if;

  return public.repair_pickaxe_with_wood(p_pickaxe_id, p_amount);
end;
$$;

revoke all on function public.repair_pickaxe(text, integer) from public, anon;
grant execute on function public.repair_pickaxe(text, integer) to authenticated;

comment on function public.repair_pickaxe(text, integer) is
  '나무 곡괭이 수리를 거부하고 나머지 곡괭이 수리만 내부 함수로 위임하는 함수';

commit;
