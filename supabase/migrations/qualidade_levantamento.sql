-- AI dev note: Levantamento para o Manual de Boas Práticas e POPs.
-- Primeira aba da seção /manual. O questionário (~130 perguntas) vive em CÓDIGO
-- (src/lib/qualidade-levantamento-questions.ts) — aqui ficam só as RESPOSTAS.
--
-- Decisão: 1 linha por pergunta (UNIQUE em pergunta_id), gravada por upsert com
-- autosave. Assim dá pra responder em várias sessões, de vários dispositivos, sem
-- perder nada e sem botão "salvar".
--
-- As fotos de rótulo de saneante são o insumo mais crítico do levantamento —
-- por isso anexo é first-class aqui, não um extra.

-- ============================================================
-- 1. Tabela de respostas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qualidade_levantamento_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  -- 'A1', 'B3', 'FOTO-1'... casa com o id em qualidade-levantamento-questions.ts
  pergunta_id text NOT NULL UNIQUE,
  bloco text NOT NULL,

  resposta text,
  nao_sei boolean NOT NULL DEFAULT false,
  nao_aplica boolean NOT NULL DEFAULT false,

  -- [{ "path": "...", "url": "...", "nome": "rotulo-alcool.webp" }]
  anexos jsonb NOT NULL DEFAULT '[]'::jsonb,

  respondido_por uuid REFERENCES public.pessoas(id)
);

CREATE INDEX IF NOT EXISTS idx_qualidade_levantamento_bloco
  ON public.qualidade_levantamento_respostas(bloco);

-- Toca atualizado_em em todo update
CREATE OR REPLACE FUNCTION public.fn_touch_levantamento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_levantamento ON public.qualidade_levantamento_respostas;
CREATE TRIGGER trg_touch_levantamento
  BEFORE UPDATE ON public.qualidade_levantamento_respostas
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_levantamento();

-- ============================================================
-- 2. RLS — admin apenas (decisão do dono).
--    Para abrir depois a blocos específicos (ex.: estagiária responde J9,
--    RT responde Q), basta trocar o role no USING das políticas.
-- ============================================================
ALTER TABLE public.qualidade_levantamento_respostas ENABLE ROW LEVEL SECURITY;

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

GRANT EXECUTE ON FUNCTION public.fn_is_admin() TO authenticated;

DROP POLICY IF EXISTS qualidade_levantamento_admin ON public.qualidade_levantamento_respostas;
CREATE POLICY qualidade_levantamento_admin ON public.qualidade_levantamento_respostas
  FOR ALL TO authenticated
  USING (public.fn_is_admin())
  WITH CHECK (public.fn_is_admin());

DROP POLICY IF EXISTS qualidade_levantamento_service_role ON public.qualidade_levantamento_respostas;
CREATE POLICY qualidade_levantamento_service_role ON public.qualidade_levantamento_respostas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- AI dev note: o schema public concede tudo ao anon por DEFAULT PRIVILEGE — toda
-- tabela nova nasce com o furo *_anon_crud. RLS já barra (não há policy p/ anon),
-- mas grant sem uso é risco latente. Mesmo padrão do commit c669a59.
REVOKE ALL ON public.qualidade_levantamento_respostas FROM anon;

-- ============================================================
-- 3. Bucket privado para as fotos do levantamento
--    (rótulo de saneante, depósito, tapete, materiais...)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('qualidade', 'qualidade', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS qualidade_bucket_admin_all ON storage.objects;
CREATE POLICY qualidade_bucket_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'qualidade' AND public.fn_is_admin())
  WITH CHECK (bucket_id = 'qualidade' AND public.fn_is_admin());
