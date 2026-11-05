-- URLを開いた人がログインせずに共有案件を閲覧・編集するためのスキーマ。
-- 旧社員リストは互換性のため保持しますが、ログインや社員登録は使用しません。
begin;
create table if not exists public.order_desk_employees (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.order_desk_workspace (
  id integer primary key check (id = 1),
  revision bigint not null default 0,
  payload jsonb not null default '{"orders":[],"drafts":[],"development":{},"salesSerial":0,"brkSerial":799}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.order_desk_workspace(id) values(1) on conflict do nothing;
alter table public.order_desk_employees enable row level security;
alter table public.order_desk_workspace enable row level security;
-- No table policies/grants for app users. Only the guarded RPCs below expose data.
revoke all on public.order_desk_employees, public.order_desk_workspace from public, anon, authenticated;

create or replace function public.order_desk_read()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object('revision',revision,'payload',payload,'updated_at',updated_at,'updated_by',updated_by)
  into result from public.order_desk_workspace where id=1;
  return result;
end $$;

create or replace function public.order_desk_save(expected_revision bigint, next_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_state public.order_desk_workspace%rowtype; item jsonb; ids text[]='{}'; numbers text[]='{}'; brks text[]='{}';
  max_sales bigint=0; max_brk bigint=799; n bigint; field_name text;
begin
  select * into current_state from public.order_desk_workspace where id=1 for update;
  if expected_revision is null or current_state.revision <> expected_revision then raise exception 'VERSION_CONFLICT' using errcode='40001'; end if;
  if jsonb_typeof(next_payload) is distinct from 'object'
    or jsonb_typeof(next_payload->'orders') is distinct from 'array'
    or jsonb_typeof(next_payload->'drafts') is distinct from 'array'
    or jsonb_typeof(next_payload->'development') is distinct from 'object' then
    raise exception 'INVALID_WORKSPACE';
  end if;
  if jsonb_array_length(next_payload->'orders') > 10000 or jsonb_array_length(next_payload->'drafts') > 1000
    or octet_length(next_payload::text) > 10000000 then raise exception 'WORKSPACE_TOO_LARGE'; end if;
  for item in select value from jsonb_array_elements(next_payload->'orders') loop
    if coalesce(btrim(item->>'name'),'')='' or coalesce(item->>'status','')='' then raise exception 'INVALID_ORDER'; end if;
  end loop;
  for item in select value from jsonb_array_elements((next_payload->'orders') || (next_payload->'drafts')) loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','')='' or length(item->>'id')>200
      or jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'number') is distinct from 'string'
      or coalesce(item->>'number','') !~ '^[1-9][0-9]*$' then raise exception 'INVALID_ROW'; end if;
    foreach field_name in array array['brk','status','owner','created','contract','name','folder','permit','address','map','source','paymentDate','note'] loop
      if item ? field_name and jsonb_typeof(item->field_name) not in ('string','null') then raise exception 'INVALID_FIELD'; end if;
      if length(item->>field_name)>10000 then raise exception 'FIELD_TOO_LONG'; end if;
    end loop;
    if coalesce(item->>'status','') not in ('','面談取り付け','初回面談済','継続面談中','収支シミュ提出','契約交渉中','契約締結予定','契約済','破談','商談中','見積提出','契約予定','契約済み','初回面談済み','完了','失注') then raise exception 'INVALID_STATUS'; end if;
    foreach field_name in array array['sales','cost'] loop
      if coalesce(item->>field_name,'')<>'' then
        if (item->>field_name) !~ '^[0-9]+$' or (item->>field_name)::numeric>9007199254740991 then raise exception 'INVALID_AMOUNT'; end if;
      end if;
    end loop;
    if item ? 'paid' and jsonb_typeof(item->'paid') not in ('boolean','null') and item->>'paid'<>'' then raise exception 'INVALID_PAYMENT'; end if;
    foreach field_name in array array['created','contract','paymentDate'] loop
      if coalesce(item->>field_name,'')<>'' then
        if item->>field_name !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char((item->>field_name)::date,'YYYY-MM-DD')<>item->>field_name then raise exception 'INVALID_DATE'; end if;
      end if;
    end loop;
    foreach field_name in array array['folder','map'] loop
      if coalesce(item->>field_name,'')<>'' and item->>field_name !~ '^https?://[^[:space:]]+$' then raise exception 'INVALID_URL'; end if;
    end loop;
    if item->>'id'=any(ids) or item->>'number'=any(numbers) then raise exception 'DUPLICATE_ROW_OR_NUMBER'; end if;
    ids=array_append(ids,item->>'id'); numbers=array_append(numbers,item->>'number');
    n=(item->>'number')::bigint; if n>9007199254740991 then raise exception 'INVALID_NUMBER'; end if;
    max_sales=greatest(max_sales,n);
    if coalesce(item->>'brk','') ~ '^[0-9]+$' then
      if item->>'brk'=any(brks) then raise exception 'DUPLICATE_BRK'; end if;
      brks=array_append(brks,item->>'brk'); n=(item->>'brk')::bigint;
      if n>9007199254740991 then raise exception 'INVALID_NUMBER'; end if;
      max_brk=greatest(max_brk,n);
    end if;
  end loop;
  for item in select value from jsonb_each(next_payload->'development') loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'status','') not in ('未着手','進行中','確認待ち','完了')
      or jsonb_typeof(item->'note') is distinct from 'string' or length(item->>'note')>10000 then raise exception 'INVALID_DEVELOPMENT'; end if;
  end loop;
  if coalesce(next_payload->>'salesSerial','') !~ '^[0-9]+$' or coalesce(next_payload->>'brkSerial','') !~ '^[0-9]+$' then raise exception 'INVALID_COUNTER'; end if;
  max_sales=greatest(max_sales,(next_payload->>'salesSerial')::bigint,(current_state.payload->>'salesSerial')::bigint);
  max_brk=greatest(max_brk,(next_payload->>'brkSerial')::bigint,(current_state.payload->>'brkSerial')::bigint);
  if max_sales>9007199254740991 or max_brk>9007199254740991 then raise exception 'INVALID_COUNTER'; end if;
  next_payload=jsonb_build_object('orders',next_payload->'orders','drafts',next_payload->'drafts','development',next_payload->'development','salesSerial',max_sales,'brkSerial',max_brk);
  update public.order_desk_workspace set revision=revision+1,payload=next_payload,updated_at=now(),updated_by=auth.uid() where id=1;
  return public.order_desk_read();
end $$;
revoke all on function public.order_desk_read(),public.order_desk_save(bigint,jsonb) from public,anon;
grant execute on function public.order_desk_read(),public.order_desk_save(bigint,jsonb) to anon, authenticated;
commit;
