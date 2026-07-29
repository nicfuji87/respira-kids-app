-- AI dev note: Manual de Boas Práticas + POPs versionados.
-- A cadeia que a vigilância cobra: documento vigente -> equipe treinada NAQUELA
-- versão -> registro de execução. Esta migration entrega a 1ª peça (documentos)
-- e a 2ª (treinamento por versão). Cronograma/registros ficam para depois.
--
-- APLICADA EM PRODUÇÃO em 29/07/2026 via MCP. Este arquivo espelha o executado.

CREATE TABLE IF NOT EXISTS public.qualidade_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  -- codigo é estável entre versões (POP-001 v1, v2, v3...)
  codigo text NOT NULL,
  versao smallint NOT NULL DEFAULT 1,
  titulo text NOT NULL,
  tipo text NOT NULL DEFAULT 'pop'
    CHECK (tipo IN ('manual', 'pop', 'cronograma', 'anexo')),

  conteudo_md text NOT NULL DEFAULT '',
  resumo text,

  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'vigente', 'substituido')),
  vigente_desde date,
  proxima_revisao date,

  -- AI dev note: aprovado_por é a FK (rastreio), mas nome/registro são SNAPSHOT.
  -- Documento aprovado não pode mudar retroativamente: se a RT sair da clínica,
  -- o POP que ela assinou continua mostrando a assinatura dela.
  aprovado_por uuid REFERENCES public.pessoas(id),
  aprovado_por_nome text,
  aprovado_por_registro text,
  aprovado_em timestamptz,

  contexto_ancora text[] NOT NULL DEFAULT '{}',
  roles_alvo text[] NOT NULL DEFAULT '{admin,profissional,secretaria}',

  ordem smallint NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,

  UNIQUE (codigo, versao)
);

-- No máximo 1 versão vigente por código
CREATE UNIQUE INDEX IF NOT EXISTS uq_qualidade_documentos_vigente
  ON public.qualidade_documentos(codigo)
  WHERE status = 'vigente' AND ativo = true;

CREATE INDEX IF NOT EXISTS idx_qualidade_documentos_status
  ON public.qualidade_documentos(status, ordem);
CREATE INDEX IF NOT EXISTS idx_qualidade_documentos_ancora
  ON public.qualidade_documentos USING gin(contexto_ancora);

CREATE OR REPLACE FUNCTION public.fn_touch_qualidade_documento()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_qualidade_documento ON public.qualidade_documentos;
CREATE TRIGGER trg_touch_qualidade_documento
  BEFORE UPDATE ON public.qualidade_documentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_qualidade_documento();

-- ============================================================
-- Treinamento por versão: revisou o POP -> aceite anterior deixa de valer
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qualidade_treinamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  documento_id uuid NOT NULL REFERENCES public.qualidade_documentos(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,

  tipo text NOT NULL CHECK (tipo IN ('leitura', 'aceite')),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  versao_snapshot smallint NOT NULL,

  UNIQUE (documento_id, pessoa_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_qualidade_treinamentos_pessoa
  ON public.qualidade_treinamentos(pessoa_id, tipo);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.qualidade_documentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualidade_treinamentos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fn_pessoa_atual_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.pessoas
  WHERE auth_user_id = auth.uid() AND ativo = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_pessoa_atual_id() TO authenticated;

-- Documento vigente: todo mundo autenticado lê (é para ser lido).
-- Rascunho/substituído: só admin.
DROP POLICY IF EXISTS qualidade_documentos_read ON public.qualidade_documentos;
CREATE POLICY qualidade_documentos_read ON public.qualidade_documentos
  FOR SELECT TO authenticated
  USING (
    (status = 'vigente' AND ativo = true AND public.fn_pessoa_atual_id() IS NOT NULL)
    OR public.fn_is_admin()
  );

DROP POLICY IF EXISTS qualidade_documentos_admin_write ON public.qualidade_documentos;
CREATE POLICY qualidade_documentos_admin_write ON public.qualidade_documentos
  FOR ALL TO authenticated
  USING (public.fn_is_admin()) WITH CHECK (public.fn_is_admin());

DROP POLICY IF EXISTS qualidade_documentos_service_role ON public.qualidade_documentos;
CREATE POLICY qualidade_documentos_service_role ON public.qualidade_documentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Treinamento: a pessoa registra o próprio aceite; admin lê tudo
DROP POLICY IF EXISTS qualidade_treinamentos_self_insert ON public.qualidade_treinamentos;
CREATE POLICY qualidade_treinamentos_self_insert ON public.qualidade_treinamentos
  FOR INSERT TO authenticated
  WITH CHECK (pessoa_id = public.fn_pessoa_atual_id());

DROP POLICY IF EXISTS qualidade_treinamentos_read ON public.qualidade_treinamentos;
CREATE POLICY qualidade_treinamentos_read ON public.qualidade_treinamentos
  FOR SELECT TO authenticated
  USING (pessoa_id = public.fn_pessoa_atual_id() OR public.fn_is_admin());

DROP POLICY IF EXISTS qualidade_treinamentos_service_role ON public.qualidade_treinamentos;
CREATE POLICY qualidade_treinamentos_service_role ON public.qualidade_treinamentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Schema public concede tudo ao anon por default privilege — ver [[anon-crud-banco-aberto]]
REVOKE ALL ON public.qualidade_documentos FROM anon;
REVOKE ALL ON public.qualidade_treinamentos FROM anon;

-- ============================================================
-- View: quem ainda não aceitou a versão VIGENTE de cada documento do seu role
-- ============================================================
CREATE OR REPLACE VIEW public.vw_qualidade_treinamento_pendente AS
SELECT
  p.id            AS pessoa_id,
  p.nome          AS pessoa_nome,
  p.role          AS pessoa_role,
  d.id            AS documento_id,
  d.codigo,
  d.versao,
  d.titulo
FROM public.pessoas p
CROSS JOIN public.qualidade_documentos d
LEFT JOIN public.qualidade_treinamentos t
  ON t.documento_id = d.id AND t.pessoa_id = p.id AND t.tipo = 'aceite'
WHERE p.ativo = true
  AND p.role = ANY(d.roles_alvo)
  AND d.status = 'vigente'
  AND d.ativo = true
  AND t.id IS NULL;
