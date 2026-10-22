-- =====================================================================
-- Ju: modo sombra + contexto mais enxuto + pediatra (20/10/2026)
-- =====================================================================
-- AI dev note:
-- 1. MODO SOMBRA (ju_config.sombra): conversa fora da lista de teste roda a Ju
--    "de mentira". A Entrada chama o Atendimento, a IA decide, mas nada sai:
--    o Atendimento grava em ju_sombra o que ela responderia, e o fluxo de Ações
--    (fn_ju_modo_conversa) devolve um resultado simulado em vez de agir (sem
--    grupo, sem etiqueta, sem ju-acao). A transcrição de áudio também não sai.
--    O estado da conversa (pausa, versão) segue as regras reais, mas a Ju nunca
--    marca a versão como respondida: ela só observa.
-- 2. Contexto enxuto: fn_ju_json_enxuto tira do JSON do cliente as chaves
--    nulas, [] e {} (a maior parte dos campos de cada paciente vem vazia);
--    mensagem automática entra no histórico com no máximo 300 caracteres.
-- 3. Pediatra atual de cada paciente (acesso_agenda), só nome real
--    ("Não informado" fica de fora). Para paciente novo, a Ju pergunta.
-- =====================================================================

ALTER TABLE public.ju_config ADD COLUMN sombra boolean NOT NULL DEFAULT false;

CREATE TABLE public.ju_sombra (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversa_id  bigint NOT NULL REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  versao       bigint,
  modo         text,
  resposta     text,
  ferramentas  jsonb NOT NULL DEFAULT '[]'::jsonb,
  erro         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ju_sombra_conversa ON public.ju_sombra (conversa_id, created_at DESC);
ALTER TABLE public.ju_sombra ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_sombra FROM anon, authenticated;


-- Conversa fora da lista de teste, com o modo sombra ligado.
CREATE FUNCTION public.fn_ju_sombra(p_telefone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT k.sombra FROM public.ju_config k WHERE k.id = 1), false)
         AND NOT public.fn_ju_liberado(p_telefone);
$$;
REVOKE ALL ON FUNCTION public.fn_ju_sombra(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_sombra(text) TO service_role;

-- Para o fluxo de Ações decidir se age de verdade ou simula.
CREATE FUNCTION public.fn_ju_modo_conversa(p_conversa_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('sombra', coalesce(public.fn_ju_sombra(c.telefone), false))
  FROM public.ju_conversas c WHERE c.id = p_conversa_id;
$$;
REVOKE ALL ON FUNCTION public.fn_ju_modo_conversa(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_modo_conversa(bigint) TO service_role;


-- Remove chaves nulas, [] e {} (recursivo).
CREATE FUNCTION public.fn_ju_json_enxuto(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE r jsonb; k text; v jsonb; e jsonb;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  CASE jsonb_typeof(p)
    WHEN 'object' THEN
      r := '{}'::jsonb;
      FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
        v := public.fn_ju_json_enxuto(v);
        IF v IS NOT NULL AND v <> 'null'::jsonb AND v <> '[]'::jsonb AND v <> '{}'::jsonb THEN
          r := r || jsonb_build_object(k, v);
        END IF;
      END LOOP;
      RETURN r;
    WHEN 'array' THEN
      r := '[]'::jsonb;
      FOR e IN SELECT * FROM jsonb_array_elements(p) LOOP
        r := r || jsonb_build_array(public.fn_ju_json_enxuto(e));
      END LOOP;
      RETURN r;
    ELSE
      RETURN p;
  END CASE;
END;
$$;


DO $do$
DECLARE d text; n text;
BEGIN
  -- fn_ju_turno: sombra libera o turno; cliente enxuto; automação curta no histórico
  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  n := replace(d, $a$WHEN NOT public.fn_ju_liberado(c.telefone) THEN 'MODO_TESTE'$a$,
                  $b$WHEN NOT public.fn_ju_liberado(c.telefone) AND NOT public.fn_ju_sombra(c.telefone) THEN 'MODO_TESTE'$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: gate do modo de teste não encontrado'; END IF;
  d := n;
  n := replace(d, $a$'pode', true,$a$, $b$'pode', true,
    'sombra', public.fn_ju_sombra(c.telefone),$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: retorno não encontrado'; END IF;
  d := n;
  n := replace(d, $a$'cliente', public.fn_ju_contexto_cliente(c.id)$a$,
                  $b$'cliente', public.fn_ju_json_enxuto(public.fn_ju_contexto_cliente(c.id))$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: cliente não encontrado'; END IF;
  d := n;
  n := replace(d, $a$coalesce(left(m.conteudo, 2000),$a$,
                  $b$coalesce(left(m.conteudo, CASE WHEN m.origem = 'AUTOMACAO' THEN 300 ELSE 2000 END),$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: corte do histórico não encontrado'; END IF;
  EXECUTE n;

  -- fn_ju_receber: avisa a Entrada que a conversa roda em sombra
  d := pg_get_functiondef('public.fn_ju_receber'::regproc);
  n := replace(d, $a$'liberado', public.fn_ju_liberado(c.telefone));$a$,
                  $b$'liberado', public.fn_ju_liberado(c.telefone),
    'sombra', public.fn_ju_sombra(c.telefone));$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_receber: retorno não encontrado'; END IF;
  EXECUTE n;

  -- fn_ju_contexto_cliente: pediatra atual (nome real)
  d := pg_get_functiondef('public.fn_ju_contexto_cliente'::regproc);
  n := replace(d, $a$'proximas_consultas', CASE WHEN e.agenda THEN$a$,
                  $b$'pediatra', CASE WHEN e.agenda THEN (
          SELECT btrim(pe.nome)
          FROM public.paciente_pediatra pp
          JOIN public.pessoa_pediatra ped ON ped.id = pp.pediatra_id
          JOIN public.pessoas pe ON pe.id = ped.pessoa_id
          WHERE pp.paciente_id = pac.id AND pp.ativo
            AND (pp.data_fim IS NULL OR pp.data_fim >= current_date)
            AND pe.nome !~* 'n[aã]o +informad'
          ORDER BY pp.data_inicio DESC NULLS LAST, pp.created_at DESC
          LIMIT 1) END,
        'proximas_consultas', CASE WHEN e.agenda THEN$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_contexto_cliente: próximas consultas não encontrado'; END IF;
  EXECUTE n;
END
$do$;
