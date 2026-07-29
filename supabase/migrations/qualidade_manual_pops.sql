-- AI dev note: Módulo de Qualidade / Conformidade sanitária (Manual de Boas Práticas + POPs).
-- NÃO é uma base de conhecimento: é a cadeia que a vigilância cobra —
--   documento vigente -> equipe treinada NAQUELA versão -> registro de que foi executado.
--
-- 4 entidades:
--   1. qualidade_documentos   -> Manual/POP versionado, com RT aprovador e data de revisão
--   2. qualidade_treinamentos -> quem leu/aceitou qual VERSÃO (vence quando o POP é revisado)
--   3. qualidade_tarefas      -> cronograma de limpeza (por sessão / diária / semanal / mensal)
--   4. qualidade_registros    -> execução assinada (é o que o fiscal pede primeiro)
--
-- STATUS: PROPOSTA — ainda não aplicada. Revisar antes de rodar.

-- ============================================================
-- 1. Documentos (Manual e POPs) — versionados
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qualidade_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Identificação. codigo é estável entre versões (POP-004 v1, v2, v3...).
  codigo text NOT NULL,                    -- 'MANUAL', 'POP-001', 'POP-002'...
  versao smallint NOT NULL DEFAULT 1,
  titulo text NOT NULL,
  tipo text NOT NULL DEFAULT 'pop'
    CHECK (tipo IN ('manual', 'pop', 'cronograma', 'anexo')),

  -- Corpo em Markdown. O editor visual (E3) grava aqui também.
  conteudo_md text NOT NULL DEFAULT '',
  resumo text,                             -- 1 linha, aparece na listagem e no drawer contextual

  -- Ciclo de vida. Só UMA versão vigente por codigo (índice único parcial abaixo).
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'vigente', 'substituido')),
  vigente_desde date,
  proxima_revisao date,                    -- vigilância olha se está revisado

  -- Responsável técnico que aprovou (CREFITO fica em pessoas)
  aprovado_por uuid REFERENCES public.pessoas(id),
  aprovado_em timestamptz,

  -- Âncoras contextuais: onde no app esse documento deve aparecer no "?"
  -- ex.: {'evolucao.desobstrucao','agenda.encaixe'}
  contexto_ancora text[] NOT NULL DEFAULT '{}',

  -- Quem precisa conhecer este documento (gera pendência de treinamento)
  roles_alvo text[] NOT NULL DEFAULT '{admin,profissional,secretaria}',

  ordem smallint NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,

  UNIQUE (codigo, versao)
);

-- Garante no máximo 1 versão vigente por código
CREATE UNIQUE INDEX IF NOT EXISTS uq_qualidade_documentos_vigente
  ON public.qualidade_documentos(codigo)
  WHERE status = 'vigente' AND ativo = true;

CREATE INDEX IF NOT EXISTS idx_qualidade_documentos_status
  ON public.qualidade_documentos(status, ordem);
CREATE INDEX IF NOT EXISTS idx_qualidade_documentos_ancora
  ON public.qualidade_documentos USING gin(contexto_ancora);

-- ============================================================
-- 2. Treinamento — leitura e aceite POR VERSÃO
--    Revisou o POP -> sobe a versão -> o aceite antigo não vale mais.
--    É isso que sustenta "a equipe foi treinada" numa inspeção.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qualidade_treinamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  documento_id uuid NOT NULL REFERENCES public.qualidade_documentos(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,

  -- 'leitura' = abriu o documento | 'aceite' = confirmou "li e entendi"
  tipo text NOT NULL CHECK (tipo IN ('leitura', 'aceite')),
  registrado_em timestamptz NOT NULL DEFAULT now(),

  -- Snapshot: se o documento for editado depois, o registro continua honesto
  versao_snapshot smallint NOT NULL,

  UNIQUE (documento_id, pessoa_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_qualidade_treinamentos_pessoa
  ON public.qualidade_treinamentos(pessoa_id, tipo);

-- ============================================================
-- 3. Cronograma — as tarefas recorrentes de limpeza
--    itens = o checklist que a pessoa marca de verdade
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qualidade_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  titulo text NOT NULL,
  documento_id uuid REFERENCES public.qualidade_documentos(id),  -- o POP que descreve o como

  periodicidade text NOT NULL
    CHECK (periodicidade IN ('por_sessao', 'diaria', 'semanal', 'mensal')),
  dias_semana smallint[] NOT NULL DEFAULT '{}',   -- 0=dom..6=sáb, só p/ semanal
  dia_mes smallint,                                -- só p/ mensal

  -- Onde se aplica: 'sala_1', 'sala_2', 'sala_3', 'recepcao_a', 'recepcao_b', 'deposito'
  locais text[] NOT NULL DEFAULT '{}',

  -- [{ "id": "trocador", "label": "Trocador higienizado", "obrigatorio": true }, ...]
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,

  exige_foto boolean NOT NULL DEFAULT false,
  roles_alvo text[] NOT NULL DEFAULT '{admin,profissional,secretaria}',

  ordem smallint NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_qualidade_tarefas_periodicidade
  ON public.qualidade_tarefas(periodicidade, ativo);

-- ============================================================
-- 4. Registros de execução — a prova
--    referencia_data = a QUAL dia o registro se refere (não é o momento do clique),
--    pra dar pra perguntar "a limpeza terminal do dia 12 foi feita?".
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qualidade_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  tarefa_id uuid NOT NULL REFERENCES public.qualidade_tarefas(id),
  executado_por uuid NOT NULL REFERENCES public.pessoas(id),
  executado_em timestamptz NOT NULL DEFAULT now(),
  referencia_data date NOT NULL,

  local text,
  -- Vincula a biossegurança pós-sessão à sessão específica (periodicidade 'por_sessao')
  agendamento_id uuid REFERENCES public.agendamentos(id),

  -- { "trocador": true, "tapete": true, "brinquedos": false }
  itens_marcados jsonb NOT NULL DEFAULT '{}'::jsonb,
  completo boolean NOT NULL DEFAULT false,
  observacoes text,
  foto_url text
);

CREATE INDEX IF NOT EXISTS idx_qualidade_registros_tarefa_data
  ON public.qualidade_registros(tarefa_id, referencia_data DESC);
CREATE INDEX IF NOT EXISTS idx_qualidade_registros_pessoa
  ON public.qualidade_registros(executado_por, executado_em DESC);
CREATE INDEX IF NOT EXISTS idx_qualidade_registros_agendamento
  ON public.qualidade_registros(agendamento_id)
  WHERE agendamento_id IS NOT NULL;

-- ============================================================
-- 5. RLS
--    Documentos vigentes: todo mundo autenticado LÊ (é pra ser lido).
--    Escrita de documento/tarefa: admin.
--    Treinamento e registro: a própria pessoa insere; admin lê tudo.
-- ============================================================
ALTER TABLE public.qualidade_documentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualidade_treinamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualidade_tarefas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualidade_registros    ENABLE ROW LEVEL SECURITY;

-- helper: pessoa ativa do auth.uid() atual
CREATE OR REPLACE FUNCTION public.fn_pessoa_atual_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.pessoas
  WHERE auth_user_id = auth.uid() AND ativo = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pessoas
    WHERE auth_user_id = auth.uid() AND role = 'admin' AND ativo = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.fn_pessoa_atual_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_admin() TO authenticated;

-- Documentos
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

-- Tarefas
DROP POLICY IF EXISTS qualidade_tarefas_read ON public.qualidade_tarefas;
CREATE POLICY qualidade_tarefas_read ON public.qualidade_tarefas
  FOR SELECT TO authenticated
  USING (ativo = true AND public.fn_pessoa_atual_id() IS NOT NULL);

DROP POLICY IF EXISTS qualidade_tarefas_admin_write ON public.qualidade_tarefas;
CREATE POLICY qualidade_tarefas_admin_write ON public.qualidade_tarefas
  FOR ALL TO authenticated
  USING (public.fn_is_admin()) WITH CHECK (public.fn_is_admin());

-- Treinamentos: insere só pra si mesmo; lê o seu (admin lê tudo)
DROP POLICY IF EXISTS qualidade_treinamentos_self_insert ON public.qualidade_treinamentos;
CREATE POLICY qualidade_treinamentos_self_insert ON public.qualidade_treinamentos
  FOR INSERT TO authenticated
  WITH CHECK (pessoa_id = public.fn_pessoa_atual_id());

DROP POLICY IF EXISTS qualidade_treinamentos_read ON public.qualidade_treinamentos;
CREATE POLICY qualidade_treinamentos_read ON public.qualidade_treinamentos
  FOR SELECT TO authenticated
  USING (pessoa_id = public.fn_pessoa_atual_id() OR public.fn_is_admin());

-- Registros: insere só como si mesmo. Leitura ampla — a equipe precisa ver
-- se a tarefa do dia já foi feita antes de refazer.
DROP POLICY IF EXISTS qualidade_registros_self_insert ON public.qualidade_registros;
CREATE POLICY qualidade_registros_self_insert ON public.qualidade_registros
  FOR INSERT TO authenticated
  WITH CHECK (executado_por = public.fn_pessoa_atual_id());

DROP POLICY IF EXISTS qualidade_registros_read ON public.qualidade_registros;
CREATE POLICY qualidade_registros_read ON public.qualidade_registros
  FOR SELECT TO authenticated
  USING (public.fn_pessoa_atual_id() IS NOT NULL);

-- AI dev note: registro NÃO pode ser editado nem apagado por ninguém além do
-- service_role. Prova de execução que dá pra reescrever não é prova.
DROP POLICY IF EXISTS qualidade_registros_service_role ON public.qualidade_registros;
CREATE POLICY qualidade_registros_service_role ON public.qualidade_registros
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 6. View: pendências de treinamento
--    Quem ainda não aceitou a versão VIGENTE de cada documento do seu role.
-- ============================================================
CREATE OR REPLACE VIEW public.vw_qualidade_treinamento_pendente AS
SELECT
  p.id                AS pessoa_id,
  p.nome              AS pessoa_nome,
  p.role              AS pessoa_role,
  d.id                AS documento_id,
  d.codigo,
  d.versao,
  d.titulo,
  t.registrado_em     AS aceito_em
FROM public.pessoas p
CROSS JOIN public.qualidade_documentos d
LEFT JOIN public.qualidade_treinamentos t
  ON t.documento_id = d.id AND t.pessoa_id = p.id AND t.tipo = 'aceite'
WHERE p.ativo = true
  AND p.role = ANY(d.roles_alvo)
  AND d.status = 'vigente'
  AND d.ativo = true
  AND t.id IS NULL;
