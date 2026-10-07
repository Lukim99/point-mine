-- 일일 정비 RPC의 빈 search_path에서도 회사 잔액 기록이 실패하지 않도록 합니다.
-- 호출 권한, 잔액 동기화, 로그 내용과 정산 금액은 그대로 유지합니다.
create or replace function public.log_company_balance_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_company_name text;
  v_headers text := nullif(current_setting('request.headers', true), '');
  v_path text := nullif(current_setting('request.path', true), '');
  v_reason text;
  v_memo text;
  v_source text;
begin
  select name into v_company_name from public.companies where id = new.company_id;

  -- 요청의 사유를 읽지 못해도 잔액 기록 자체는 계속 처리합니다.
  begin
    if v_headers is not null then
      v_reason := nullif(left(v_headers::json ->> 'x-point-reason', 60), '');
      v_memo := nullif(left(v_headers::json ->> 'x-point-memo', 1000), '');
    end if;

    if v_path is not null then
      v_source := coalesce(
        'rpc:' || substring(v_path from '/rpc/([A-Za-z0-9_]+)'),
        'table:' || substring(v_path from '/([A-Za-z0-9_]+)/?$'),
        'path:' || left(v_path, 80)
      );
    else
      v_source := 'sql:' || coalesce(
        lower(substring(current_query() from '(?i)select\s+(?:[a-z_]+\.)?"?([a-z0-9_]+)"?\s*\(')),
        'unknown'
      );
    end if;
  exception when others then
    v_reason := null;
    v_memo := null;
    v_source := null;
  end;

  insert into public.company_balance_change_log (
    company_id, company_name, account_type, account_name,
    old_balance, new_balance, delta, source, reason, memo, txid
  ) values (
    new.company_id, v_company_name, new.account_type, new.name,
    old.balance, new.balance, coalesce(new.balance, 0) - coalesce(old.balance, 0),
    left(v_source, 100), v_reason, v_memo, txid_current()
  );
  return new;
end;
$$;
