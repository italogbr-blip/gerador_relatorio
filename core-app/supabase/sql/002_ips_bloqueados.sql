-- =====================================================================
-- 002_ips_bloqueados.sql
-- Tabela e políticas para o sistema de bloqueio de IP no Gerador de Relatórios
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ips_bloqueados (
  ip character varying(45) PRIMARY KEY,
  data_bloqueio timestamp with time zone DEFAULT NOW(),
  bloqueado_por character varying(100) DEFAULT 'Coordenação'
);

-- Ativar RLS
ALTER TABLE public.ips_bloqueados ENABLE ROW LEVEL SECURITY;

-- Política de acesso total (leitura e gravação para verificar e bloquear/desbloquear IPs)
DROP POLICY IF EXISTS "Permitir total ips_bloqueados" ON public.ips_bloqueados;
CREATE POLICY "Permitir total ips_bloqueados" ON public.ips_bloqueados 
  FOR ALL TO public 
  USING (true) 
  WITH CHECK (true);

-- Permissões para as roles pública e autenticada
GRANT ALL ON TABLE public.ips_bloqueados TO anon, authenticated;
