-- =====================================================================
-- 001_login_seguro.sql
-- Login seguro para usuários migrados do sistema PHP (senhas bcrypt).
--
-- COMO APLICAR: Supabase Dashboard > SQL Editor > colar este arquivo > Run.
-- É idempotente (pode ser executado mais de uma vez).
--
-- O que faz:
--   1. Cria a função public.login_usuario(login, senha): confere a senha
--      NO SERVIDOR e devolve apenas dados públicos do usuário (sem hash).
--   2. Cria a função public.desbloquear_painel_coord(login, senha): igual,
--      mas só devolve o usuário se ele for Nível 2 (aceita também a senha
--      compartilhada da tabela coord_senha).
--   3. Impede que o navegador (roles anon/authenticated) leia as colunas
--      sensíveis "senha" e "remember_token" e a tabela coord_senha.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Helper interno: confere senha contra hash bcrypt do PHP ($2y$ -> $2a$)
-- ---------------------------------------------------------------------
create or replace function public._mms_senha_confere(p_senha text, p_hash text)
returns boolean
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if p_senha is null or p_senha = '' or p_hash is null or p_hash = '' then
    return false;
  end if;
  -- Apenas hashes bcrypt são aceitos (nada de comparação em texto puro)
  if p_hash !~ '^\$2[aby]\$\d{2}\$' then
    return false;
  end if;
  v_hash := regexp_replace(p_hash, '^\$2[yb]\$', '$2a$');
  return extensions.crypt(p_senha, v_hash) = v_hash;
end;
$$;

revoke all on function public._mms_senha_confere(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Login de usuário (usuário OU e-mail + senha)
-- ---------------------------------------------------------------------
create or replace function public.login_usuario(p_login text, p_senha text)
returns table (
  id bigint,
  nome text,
  username text,
  email text,
  nivel_autoridade int
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_user record;
begin
  if coalesce(trim(p_login), '') = '' or coalesce(p_senha, '') = '' then
    return;
  end if;

  select u.id, u.nome, u.username, u.email, u.nivel_autoridade, u.senha
    into v_user
    from public.usuarios u
   where lower(trim(u.username)) = lower(trim(p_login))
      or lower(trim(u.email))    = lower(trim(p_login))
   order by u.id
   limit 1;

  if not found or not public._mms_senha_confere(p_senha, v_user.senha) then
    perform pg_sleep(0.4); -- dificulta força bruta
    return;
  end if;

  return query
    select v_user.id::bigint,
           v_user.nome::text,
           v_user.username::text,
           v_user.email::text,
           coalesce(v_user.nivel_autoridade, 1)::int;
end;
$$;

revoke all on function public.login_usuario(text, text) from public;
grant execute on function public.login_usuario(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Desbloqueio do Painel de Coordenação (somente Nível 2)
-- ---------------------------------------------------------------------
create or replace function public.desbloquear_painel_coord(p_login text, p_senha text)
returns table (
  id bigint,
  nome text,
  username text,
  email text,
  nivel_autoridade int
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_user record;
  v_coord_hash text;
  v_ok boolean := false;
begin
  if coalesce(trim(p_login), '') = '' or coalesce(p_senha, '') = '' then
    return;
  end if;

  select u.id, u.nome, u.username, u.email, u.nivel_autoridade, u.senha
    into v_user
    from public.usuarios u
   where lower(trim(u.username)) = lower(trim(p_login))
      or lower(trim(u.email))    = lower(trim(p_login))
   order by u.id
   limit 1;

  if not found or coalesce(v_user.nivel_autoridade, 1)::int <> 2 then
    perform pg_sleep(0.4);
    return;
  end if;

  -- Senha do próprio usuário
  v_ok := public._mms_senha_confere(p_senha, v_user.senha);

  -- Ou senha compartilhada do painel (tabela coord_senha, se existir)
  if not v_ok and to_regclass('public.coord_senha') is not null then
    execute 'select senha_hash from public.coord_senha order by id limit 1' into v_coord_hash;
    v_ok := public._mms_senha_confere(p_senha, v_coord_hash);
  end if;

  if not v_ok then
    perform pg_sleep(0.4);
    return;
  end if;

  return query
    select v_user.id::bigint,
           v_user.nome::text,
           v_user.username::text,
           v_user.email::text,
           2;
end;
$$;

revoke all on function public.desbloquear_painel_coord(text, text) from public;
grant execute on function public.desbloquear_painel_coord(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Esconde colunas sensíveis do navegador
-- ---------------------------------------------------------------------
revoke select on public.usuarios from anon, authenticated;
grant select (id, nome, username, email, nivel_autoridade, data_cadastro, last_activity)
  on public.usuarios to anon, authenticated;

do $$
begin
  if to_regclass('public.coord_senha') is not null then
    execute 'revoke all on public.coord_senha from anon, authenticated';
  end if;
end $$;

-- Pede ao PostgREST para recarregar o schema (funções novas visíveis na hora)
notify pgrst, 'reload schema';
