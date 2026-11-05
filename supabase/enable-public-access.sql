-- 社員ログイン版から、ログインなしのURL共有へ切り替えます。
-- 案件・開発進捗・採番・更新版のデータには変更を加えません。
begin;
do $migration$
declare signature regprocedure; definition text;
  employee_guard text := $guard$  if auth.uid() is null or not exists(select 1 from public.order_desk_employees where user_id=auth.uid() and enabled) then
    raise exception 'EMPLOYEE_ACCESS_REQUIRED' using errcode='42501';
  end if;
$guard$;
begin
  foreach signature in array array['public.order_desk_read()'::regprocedure,'public.order_desk_save(bigint,jsonb)'::regprocedure] loop
    definition := replace(pg_get_functiondef(signature), employee_guard, '');
    if position('EMPLOYEE_ACCESS_REQUIRED' in definition)>0 then
      raise exception 'Schema differs from the supported employee version. Run the current supabase/schema.sql instead.';
    end if;
    execute definition;
  end loop;
end $migration$;
grant execute on function public.order_desk_read(),public.order_desk_save(bigint,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
select 'URL共有に変更しました。ログインは不要です。' as result;
