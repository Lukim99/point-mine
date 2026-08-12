-- 빈 search_path를 사용하는 RPC에서도 잔액 변경 이력 테이블을 정확히 찾도록 수정합니다.
create or replace function public.log_point_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.point_change_log (
    nickname,
    old_balance,
    new_balance,
    delta
  )
  values (
    new.nickname,
    old.balance,
    new.balance,
    new.balance - coalesce(old.balance, 0)
  );

  return new;
end;
$$;

-- 법인 일반 계좌 변경 이력도 같은 규칙으로 스키마를 명시합니다.
create or replace function public.log_company_balance_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company_name text;
begin
  select name
  into v_company_name
  from public.companies
  where id = new.company_id;

  insert into public.company_balance_change_log (
    company_id,
    company_name,
    account_type,
    account_name,
    old_balance,
    new_balance,
    delta
  )
  values (
    new.company_id,
    v_company_name,
    new.account_type,
    new.name,
    old.balance,
    new.balance,
    coalesce(new.balance, 0) - coalesce(old.balance, 0)
  );

  return new;
end;
$$;
