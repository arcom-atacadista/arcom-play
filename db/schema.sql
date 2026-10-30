-- Arcom Play · estrutura do banco (PostgreSQL 13 ou mais novo)
-- O servidor roda este arquivo sozinho ao iniciar. Pode ser rodado várias vezes sem problema.
-- Não existe nenhuma função para apagar dados: tudo fica guardado sem prazo.

create extension if not exists pgcrypto;

create table if not exists ap_items(code text primary key, kind text not null, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists ap_attempts(id text primary key, code text not null, data jsonb not null, created_at timestamptz not null default now());
create index if not exists ap_attempts_code_idx on ap_attempts(code);
create index if not exists ap_attempts_created_idx on ap_attempts(created_at);
create table if not exists ap_secret(id int primary key, hash text not null);
create table if not exists ap_backup(id int primary key, data jsonb not null, updated_at timestamptz not null default now());

create or replace function ap_is_admin(p_key text) returns boolean language sql stable as $$
  select exists(select 1 from ap_secret where id=1 and hash=encode(digest(coalesce(p_key,''),'sha256'),'hex'))
$$;
create or replace function ap_check(p_key text) returns boolean language sql stable as $$
  select ap_is_admin(p_key)
$$;
create or replace function ap_publish(p_key text,p_code text,p_kind text,p_data jsonb) returns boolean language plpgsql as $$
begin
  if not ap_is_admin(p_key) then raise exception 'sem permissao'; end if;
  if p_code !~ '^[a-z0-9]{4,12}$' then raise exception 'codigo invalido'; end if;
  if p_kind not in ('teste','formulario','treino') then raise exception 'tipo invalido'; end if;
  if pg_column_size(p_data) > 400000 then raise exception 'grande demais'; end if;
  insert into ap_items(code,kind,data,updated_at) values(p_code,p_kind,p_data,now())
  on conflict(code) do update set kind=excluded.kind,data=excluded.data,updated_at=now();
  return true;
end $$;
create or replace function ap_get(p_code text) returns jsonb language sql stable as $$
  select jsonb_build_object('kind',kind,'data',data) from ap_items where code=p_code
$$;
create or replace function ap_submit(p_code text,p_id text,p_data jsonb) returns boolean language plpgsql as $$
begin
  if not exists(select 1 from ap_items where code=p_code) then return false; end if;
  if pg_column_size(p_data) > 100000 then return false; end if;
  if p_id !~ '^[A-Za-z0-9_-]{4,40}$' then return false; end if;
  insert into ap_attempts(id,code,data) values(p_id,p_code,p_data) on conflict(id) do nothing;
  return true;
end $$;
create or replace function ap_pull(p_key text,p_since timestamptz default null) returns jsonb language plpgsql stable as $$
begin
  if not ap_is_admin(p_key) then raise exception 'sem permissao'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('code',code,'data',data,'at',created_at) order by created_at) from ap_attempts where p_since is null or created_at>p_since),'[]'::jsonb);
end $$;
create or replace function ap_backup_put(p_key text,p_data jsonb) returns timestamptz language plpgsql as $$
declare t timestamptz := now();
begin
  if not ap_is_admin(p_key) then raise exception 'sem permissao'; end if;
  if pg_column_size(p_data) > 20000000 then raise exception 'grande demais'; end if;
  insert into ap_backup(id,data,updated_at) values(1,p_data,t) on conflict(id) do update set data=excluded.data,updated_at=t;
  return t;
end $$;
create or replace function ap_backup_get(p_key text) returns jsonb language plpgsql stable as $$
begin
  if not ap_is_admin(p_key) then raise exception 'sem permissao'; end if;
  return (select jsonb_build_object('data',data,'at',updated_at) from ap_backup where id=1);
end $$;
