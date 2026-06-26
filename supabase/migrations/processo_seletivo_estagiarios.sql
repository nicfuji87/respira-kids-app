-- AI dev note: Processo seletivo de estagiários (teste público + avaliação interna).
-- Espelha o padrão da Pesquisa de Experiência, com 3 diferenças:
--   1. NÃO é anônimo: coleta dados do candidato (nome, email, etc.).
--   2. A inserção é feita SÓ via RPC SECURITY DEFINER submit_candidatura_estagio,
--      que corrige o situacional NO SERVIDOR. Assim o gabarito nunca vai pro
--      navegador do candidato (não dá pra "ver as respostas" inspecionando a página).
--   3. Tem campos de avaliação humana (status/nota/observações) que admin e
--      secretaria editam pelo painel.

-- ============================================================
-- 1. Tabela
-- ============================================================
CREATE TABLE IF NOT EXISTS public.candidaturas_estagio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Dados do candidato
  nome text NOT NULL,
  email text NOT NULL,
  telefone text,
  curso text,
  instituicao text,
  periodo text,
  previsao_formatura text,
  cidade text,
  disponibilidade text[] NOT NULL DEFAULT '{}',
  como_soube text,
  linkedin_url text,

  -- Situacional (corrigido no servidor)
  situacional_respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  situacional_correcao jsonb NOT NULL DEFAULT '[]'::jsonb,
  pontuacao_situacional smallint NOT NULL DEFAULT 0,
  pontuacao_maxima smallint NOT NULL DEFAULT 0,
  tem_resposta_perigosa boolean NOT NULL DEFAULT false,

  -- Escrita (avaliação humana)
  texto_motivacao text,
  texto_mae_ansiosa text,

  -- Estilo de trabalho (NÃO pontua; só orienta a entrevista)
  estilo_respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  estilo_perfil text,

  -- Avaliação humana (admin/secretaria)
  status text NOT NULL DEFAULT 'a_avaliar'
    CHECK (status IN ('a_avaliar', 'entrevista', 'descartado', 'aprovado')),
  avaliacao_nota smallint CHECK (avaliacao_nota BETWEEN 1 AND 5),
  avaliacao_observacoes text,
  avaliado_por uuid REFERENCES public.pessoas(id),
  avaliado_em timestamptz,

  ativo boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_candidaturas_estagio_status ON public.candidaturas_estagio(status);
CREATE INDEX IF NOT EXISTS idx_candidaturas_estagio_created ON public.candidaturas_estagio(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidaturas_estagio_email ON public.candidaturas_estagio(email);

-- ============================================================
-- 2. RLS — admin + secretaria leem e avaliam; anon NÃO insere direto
--    (insere só via RPC SECURITY DEFINER). service_role bypass.
-- ============================================================
ALTER TABLE public.candidaturas_estagio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS candidaturas_estagio_staff_select ON public.candidaturas_estagio;
CREATE POLICY candidaturas_estagio_staff_select ON public.candidaturas_estagio
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pessoas
      WHERE pessoas.auth_user_id = auth.uid()
        AND pessoas.role IN ('admin', 'secretaria')
        AND pessoas.ativo = true
    )
  );

DROP POLICY IF EXISTS candidaturas_estagio_staff_update ON public.candidaturas_estagio;
CREATE POLICY candidaturas_estagio_staff_update ON public.candidaturas_estagio
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pessoas
      WHERE pessoas.auth_user_id = auth.uid()
        AND pessoas.role IN ('admin', 'secretaria')
        AND pessoas.ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pessoas
      WHERE pessoas.auth_user_id = auth.uid()
        AND pessoas.role IN ('admin', 'secretaria')
        AND pessoas.ativo = true
    )
  );

DROP POLICY IF EXISTS candidaturas_estagio_service_role ON public.candidaturas_estagio;
CREATE POLICY candidaturas_estagio_service_role ON public.candidaturas_estagio
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 3. RPC pública: recebe respostas, corrige o situacional no servidor e insere.
--    O gabarito (qual é a certa + pontos) vive AQUI, fora do alcance do candidato.
--    Pontuação ponderada: melhor=2, aceitável=1, fraca/pegadinha=0.
--    "perigosas" = respostas que violam segurança (ex.: deixar bebê em sofrimento).
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_candidatura_estagio(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gabarito jsonb := '{
    "s1": {"correta": "c", "pontos": {"a": 1, "b": 0, "c": 2, "d": 0}, "perigosas": []},
    "s2": {"correta": "b", "pontos": {"a": 1, "b": 2, "c": 0, "d": 1}, "perigosas": []},
    "s3": {"correta": "c", "pontos": {"a": 0, "b": 1, "c": 2, "d": 0}, "perigosas": ["a", "d"]},
    "s4": {"correta": "c", "pontos": {"a": 0, "b": 1, "c": 2, "d": 0}, "perigosas": []},
    "s5": {"correta": "c", "pontos": {"a": 1, "b": 0, "c": 2, "d": 0}, "perigosas": []},
    "s6": {"correta": "b", "pontos": {"a": 0, "b": 2, "c": 1, "d": 0}, "perigosas": []}
  }'::jsonb;

  v_cand jsonb := COALESCE(payload->'candidato', '{}'::jsonb);
  v_sit jsonb := COALESCE(payload->'situacional', '{}'::jsonb);
  v_escrita jsonb := COALESCE(payload->'escrita', '{}'::jsonb);
  v_estilo jsonb := COALESCE(payload->'estilo', '{}'::jsonb);

  v_nome text := NULLIF(trim(v_cand->>'nome'), '');
  v_email text := NULLIF(trim(v_cand->>'email'), '');

  v_key text;
  v_escolha text;
  v_correta text;
  v_pontos int;
  v_perigosa boolean;
  v_total int := 0;
  v_max int := 0;
  v_correcao jsonb := '[]'::jsonb;
  v_tem_perigosa boolean := false;

  v_disp text[];
  v_estilo_perfil text;
BEGIN
  IF v_nome IS NULL OR v_email IS NULL THEN
    RAISE EXCEPTION 'Nome e e-mail são obrigatórios';
  END IF;

  -- Corrige situacional (s1..s6) no servidor
  FOR v_key IN SELECT k FROM jsonb_object_keys(v_gabarito) AS k ORDER BY k LOOP
    v_correta := v_gabarito->v_key->>'correta';
    v_escolha := NULLIF(trim(v_sit->>v_key), '');
    v_max := v_max + 2;

    IF v_escolha IS NULL THEN
      v_pontos := 0;
      v_perigosa := false;
    ELSE
      v_pontos := COALESCE((v_gabarito->v_key->'pontos'->>v_escolha)::int, 0);
      v_perigosa := COALESCE((v_gabarito->v_key->'perigosas') ? v_escolha, false);
    END IF;

    v_total := v_total + v_pontos;
    IF v_perigosa THEN
      v_tem_perigosa := true;
    END IF;

    v_correcao := v_correcao || jsonb_build_object(
      'id', v_key,
      'escolha', v_escolha,
      'correta', v_correta,
      'pontos', v_pontos,
      'acertou', COALESCE(v_escolha = v_correta, false),
      'perigosa', v_perigosa
    );
  END LOOP;

  -- Disponibilidade (array de strings) -> text[]
  SELECT COALESCE(array_agg(left(elem, 100)), '{}')
  INTO v_disp
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(v_cand->'disponibilidade') = 'array'
         THEN v_cand->'disponibilidade' ELSE '[]'::jsonb END
  ) AS elem;

  -- Estilo de trabalho: perfil dominante (moda das respostas) — não pontua
  SELECT val INTO v_estilo_perfil
  FROM (
    SELECT value AS val, count(*) AS c
    FROM jsonb_each_text(v_estilo)
    WHERE value IS NOT NULL AND value <> ''
    GROUP BY value
    ORDER BY c DESC, val ASC
    LIMIT 1
  ) t;

  INSERT INTO public.candidaturas_estagio (
    nome, email, telefone, curso, instituicao, periodo, previsao_formatura,
    cidade, disponibilidade, como_soube, linkedin_url,
    situacional_respostas, situacional_correcao, pontuacao_situacional,
    pontuacao_maxima, tem_resposta_perigosa,
    texto_motivacao, texto_mae_ansiosa,
    estilo_respostas, estilo_perfil
  ) VALUES (
    left(v_nome, 200),
    left(v_email, 200),
    left(NULLIF(trim(v_cand->>'telefone'), ''), 40),
    left(NULLIF(trim(v_cand->>'curso'), ''), 200),
    left(NULLIF(trim(v_cand->>'instituicao'), ''), 200),
    left(NULLIF(trim(v_cand->>'periodo'), ''), 100),
    left(NULLIF(trim(v_cand->>'previsao_formatura'), ''), 100),
    left(NULLIF(trim(v_cand->>'cidade'), ''), 120),
    v_disp,
    left(NULLIF(trim(v_cand->>'como_soube'), ''), 200),
    left(NULLIF(trim(v_cand->>'linkedin_url'), ''), 300),
    v_sit, v_correcao, v_total, v_max, v_tem_perigosa,
    left(NULLIF(trim(v_escrita->>'motivacao'), ''), 5000),
    left(NULLIF(trim(v_escrita->>'mae_ansiosa'), ''), 5000),
    v_estilo, v_estilo_perfil
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_candidatura_estagio(jsonb) TO anon, authenticated;
