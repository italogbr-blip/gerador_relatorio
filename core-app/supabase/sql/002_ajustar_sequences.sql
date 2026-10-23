-- =====================================================================
-- 002_ajustar_sequences.sql
-- Sincroniza as SEQUENCES (auto-increment) das tabelas migradas do MySQL
-- para evitar erros de chave duplicada (duplicate key / relatorios_pkey).
--
-- COMO APLICAR: Supabase Dashboard > SQL Editor > colar este arquivo > Run.
-- =====================================================================

-- 1. Sincroniza a sequence da tabela relatorios com o maior ID existente
SELECT setval(
  pg_get_serial_sequence('public.relatorios', 'id'),
  COALESCE((SELECT MAX(id) FROM public.relatorios), 1) + 1,
  false
);

-- 2. Sincroniza a sequence da tabela usuarios com o maior ID existente
SELECT setval(
  pg_get_serial_sequence('public.usuarios', 'id'),
  COALESCE((SELECT MAX(id) FROM public.usuarios), 1) + 1,
  false
);

-- 3. Sincroniza a sequence da tabela configuracoes_popups com o maior ID existente
SELECT setval(
  pg_get_serial_sequence('public.configuracoes_popups', 'id'),
  COALESCE((SELECT MAX(id) FROM public.configuracoes_popups), 1) + 1,
  false
);
