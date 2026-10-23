-- =====================================================================
-- 001_login_seguro.sql
-- Script completo de limpeza de tabelas desnecessárias, restauração da
-- coluna `senha` e dos hashes bcrypt dos usuários migrados do MySQL,
-- políticas RLS e funções de login para o Supabase.
-- =====================================================================

-- 1. REMOVER TABELAS DESNECESSÁRIAS (não utilizadas pelo app)
DROP TABLE IF EXISTS public.interacoes_popup CASCADE;
DROP TABLE IF EXISTS public.mms_mensagens_lidas CASCADE;
DROP TABLE IF EXISTS public.mms_mensagens_agendadas CASCADE;
DROP TABLE IF EXISTS public.mms_acessos_gerador CASCADE;
DROP TABLE IF EXISTS public.visitantes_online CASCADE;

-- 2. ADICIONAR A COLUNA `senha` QUE FALTAVA EM `public.usuarios`
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS senha character varying(255);

-- 3. REMOVER REGISTRO DUPLICADO (id = 10 duplicava o e-mail do coordenador id = 1 com nível 1)
DELETE FROM public.usuarios WHERE id = 10 AND username = 'italogabriel1503';

-- 4. RESTAURAR OS HASHES BCRYPT ORIGINAIS DO MYSQL (u596152436_relatorios.sql)
UPDATE public.usuarios SET senha = '$2y$10$NquzSoDbJl1am5leC2DTV.RnGP7YO0hFVRK6PR/3k1slzP/vtVUHy', nivel_autoridade = 2 WHERE id = 1;
UPDATE public.usuarios SET senha = '$2y$10$KTGljA3AaxH70.qjTfhiCug8bA8vk.bAvoSehB2vvFfzkbiff4vka' WHERE id = 2;
UPDATE public.usuarios SET senha = '$2y$10$ILM/UJGEmhu22hHmVQyNJeSX..4siUq.dTV1OkUKRqRClpyiJP1GW' WHERE id = 3;
UPDATE public.usuarios SET senha = '$2y$10$79HTRUpqQPeCYVxz.5qOZunVGN6rB0oQA7/nRwsQC6X4WAAlUZcjO' WHERE id = 4;
UPDATE public.usuarios SET senha = '$2y$10$VNXxdZ9rsDaLdu1tYTiY3uxKToFsy61jzwKSX/GEdgNs455TaRgp.' WHERE id = 5;
UPDATE public.usuarios SET senha = '$2y$10$WjeJiEZH.j66ytzGc/wKVOEusqVJS/aK7KEjAx/tWUXmhfQqZqt7S' WHERE id = 6;
UPDATE public.usuarios SET senha = '$2y$10$f8hBRNQQ/UXz0h3kbWbbwuz9IIdFzQ7U6Kl2QCcupxdM.eEvs5FcO' WHERE id = 7;
UPDATE public.usuarios SET senha = '$2y$10$1ASCMntN5h8hwL.cvDoQ1.e2W6dqSXenL31CniFg7bqDY5j0tWT6a' WHERE id = 8;
UPDATE public.usuarios SET senha = '$2y$10$UMs7MMUGI8LSGm1YnHd8FOqlQ3.NiT3Lh32NNjSsVqK7u2vFYsA3C' WHERE id = 9;
UPDATE public.usuarios SET senha = '$2y$10$l8wDtg.o/K7KtWx1tqmcFeLMIW2iaKRfIgYLmjxJEQMC6M0hZSW3u' WHERE id = 11;

-- 5. LIBERAR POLÍTICAS RLS E PERMISSÕES NAS TABELAS UTILIZADAS PELO SISTEMA
DROP POLICY IF EXISTS "Permitir acesso total usuarios" ON public.usuarios;
CREATE POLICY "Permitir acesso total usuarios" ON public.usuarios FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total relatorios" ON public.relatorios;
CREATE POLICY "Permitir acesso total relatorios" ON public.relatorios FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total notificacoes" ON public.notificacoes;
CREATE POLICY "Permitir acesso total notificacoes" ON public.notificacoes FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total mms_mensagens" ON public.mms_mensagens;
CREATE POLICY "Permitir acesso total mms_mensagens" ON public.mms_mensagens FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total coord_senha" ON public.coord_senha;
CREATE POLICY "Permitir acesso total coord_senha" ON public.coord_senha FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total registro_logins" ON public.registro_logins;
CREATE POLICY "Permitir acesso total registro_logins" ON public.registro_logins FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total coord_acessos_falhos" ON public.coord_acessos_falhos;
CREATE POLICY "Permitir acesso total coord_acessos_falhos" ON public.coord_acessos_falhos FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total mms_versao_app" ON public.mms_versao_app;
CREATE POLICY "Permitir acesso total mms_versao_app" ON public.mms_versao_app FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acesso total configuracoes" ON public.configuracoes;
CREATE POLICY "Permitir acesso total configuracoes" ON public.configuracoes FOR ALL TO public USING (true) WITH CHECK (true);

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 6. FUNÇÕES RPC DE LOGIN EM LANGUAGE SQL PURO (SEM VARIÁVEIS PL/PGSQL)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public._mms_senha_confere(p_senha text, p_hash text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN coalesce(p_senha, '') = '' OR coalesce(p_hash, '') = '' THEN false
    WHEN trim(p_senha) = trim(p_hash) THEN true
    WHEN trim(p_hash) ~ '^\$2[aby]\$\d{2}\$' THEN
      extensions.crypt(p_senha, regexp_replace(trim(p_hash), '^\$2[yb]\$', '$2a$')) = regexp_replace(trim(p_hash), '^\$2[yb]\$', '$2a$')
      OR extensions.crypt(trim(p_senha), regexp_replace(trim(p_hash), '^\$2[yb]\$', '$2a$')) = regexp_replace(trim(p_hash), '^\$2[yb]\$', '$2a$')
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.login_usuario(p_login text, p_senha text)
RETURNS TABLE (
  id bigint,
  nome text,
  username text,
  email text,
  nivel_autoridade int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT u.id::bigint,
         u.nome::text,
         u.username::text,
         u.email::text,
         coalesce(u.nivel_autoridade, 1)::int
    FROM public.usuarios u
   WHERE coalesce(trim(p_login), '') <> ''
     AND coalesce(p_senha, '') <> ''
     AND (
          lower(trim(u.username)) = lower(trim(p_login))
       OR lower(trim(u.email))    = lower(trim(p_login))
       OR lower(trim(u.nome))     = lower(trim(p_login))
     )
     AND public._mms_senha_confere(p_senha, u.senha)
   ORDER BY u.nivel_autoridade DESC, u.id ASC
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.login_usuario(text, text) TO anon, authenticated;

-- 7. SINCRONIZAR AUTO-INCREMENTO (SEQUENCES)
SELECT setval(pg_get_serial_sequence('public.usuarios', 'id'), COALESCE((SELECT MAX(id) FROM public.usuarios), 1) + 1, false);
SELECT setval(pg_get_serial_sequence('public.relatorios', 'id'), COALESCE((SELECT MAX(id) FROM public.relatorios), 1) + 1, false);

NOTIFY pgrst, 'reload schema';
