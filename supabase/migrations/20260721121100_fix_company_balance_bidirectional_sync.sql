-- companies의 일반 잔액과 company_accounts의 일반 계좌 잔액을 양방향으로 동기화합니다.
-- 두 함수는 실제 값이 다를 때만 반대편을 갱신하여 재귀 호출을 종료합니다.

lock table public.companies, public.company_accounts
in share row exclusive mode;

create or replace function public.sync_company_balance_to_accounts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.company_accounts as ca (
    company_id,
    name,
    balance,
    account_type
  )
  values (
    new.id,
    '일반',
    coalesce(new.balance, 0),
    1
  )
  on conflict (company_id, account_type)
  do update
  set balance = excluded.balance
  where ca.balance is distinct from excluded.balance;

  return new;
end;
$$;

create or replace function public.sync_general_account_to_company_balance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.companies as c
  set balance = coalesce(new.balance, 0)
  where c.id = new.company_id
    and c.balance is distinct from coalesce(new.balance, 0);

  return new;
end;
$$;

drop trigger if exists trg_sync_company_balance on public.companies;

create trigger trg_sync_company_balance
after insert or update of balance on public.companies
for each row
execute function public.sync_company_balance_to_accounts();

drop trigger if exists trg_sync_general_account_to_balance
on public.company_accounts;

create trigger trg_sync_general_account_to_balance
after insert or update of balance on public.company_accounts
for each row
when (new.account_type = 1)
execute function public.sync_general_account_to_company_balance();

-- 기존 일반 계좌도 companies의 현재 잔액을 기준으로 한 번 정렬합니다.
insert into public.company_accounts as ca (
  company_id,
  name,
  balance,
  account_type
)
select
  c.id,
  '일반',
  coalesce(c.balance, 0),
  1
from public.companies as c
on conflict (company_id, account_type)
do update
set balance = excluded.balance
where ca.balance is distinct from excluded.balance;

comment on function public.sync_company_balance_to_accounts() is
  'companies.balance를 company_accounts의 일반 계좌에 동기화한다';

comment on function public.sync_general_account_to_company_balance() is
  'company_accounts의 일반 계좌 balance를 companies.balance에 동기화한다';
