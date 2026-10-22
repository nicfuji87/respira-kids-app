-- =====================================================================
-- Ju: modo de teste (só atende os números da lista)
-- =====================================================================
-- AI dev note: uma chave só, no banco, vale para todos os caminhos:
--   * fn_ju_receber devolve 'liberado' -> a Entrada só chama o Atendimento e só
--     manda a transcrição do áudio para conversa liberada;
--   * fn_ju_turno recusa (motivo MODO_TESTE) -> cobre a retomada das Tarefas e
--     qualquer chamada direta do Atendimento.
-- Ir para produção: UPDATE public.ju_config SET modo_teste = false;
-- (antes, zerar o atraso: UPDATE ju_conversas SET ultima_versao_respondida =
--  message_version, retomada_versao = message_version).
-- As funções abaixo são remendadas a partir da definição atual (replace) para
-- não duplicar o corpo inteiro; cada troca confere que achou o trecho.
-- =====================================================================
CREATE TABLE public.ju_config (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  modo_teste    boolean NOT NULL DEFAULT true,
  numeros_teste text[]  NOT NULL DEFAULT '{}',   -- canônicos (+55DD9XXXXXXXX)
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ju_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_config FROM anon, authenticated;
INSERT INTO public.ju_config (modo_teste, numeros_teste) VALUES (true, ARRAY['+5561981446666']);


CREATE FUNCTION public.fn_ju_liberado(p_telefone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((SELECT NOT k.modo_teste OR public.fn_ju_telefone(p_telefone) = ANY (k.numeros_teste)
                   FROM public.ju_config k WHERE k.id = 1), false);
$$;
REVOKE ALL ON FUNCTION public.fn_ju_liberado(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_liberado(text) TO service_role;


DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  n := replace(d, $a$WHEN c.message_version <> p_versao THEN 'MENSAGEM_NOVA'$a$,
                  $b$WHEN NOT public.fn_ju_liberado(c.telefone) THEN 'MODO_TESTE'
    WHEN c.message_version <> p_versao THEN 'MENSAGEM_NOVA'$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: trecho não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.fn_ju_receber'::regproc);
  n := replace(d, $a$'midia', v_tipo IN ('AUDIO','IMAGE','DOCUMENT'));$a$,
                  $b$'midia', v_tipo IN ('AUDIO','IMAGE','DOCUMENT'),
    'liberado', public.fn_ju_liberado(c.telefone));$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_receber: trecho não encontrado'; END IF;
  EXECUTE n;
END
$do$;


-- Histórico do turno: cada mensagem entra com no máximo 2.000 caracteres
-- (um resumo colado de 106 mil caracteres estouraria o contexto da IA).
DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  n := replace(d, $a$coalesce(m.conteudo, '[' || lower(m.tipo) || ' sem texto]')$a$,
                  $b$coalesce(left(m.conteudo, 2000), '[' || lower(m.tipo) || ' sem texto]')$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: trecho do histórico não encontrado'; END IF;
  EXECUTE n;
END
$do$;


-- Etiqueta: sem a carência de 2 min. Com a etiqueta "vista" (ju_revisao_golive)
-- um evento antigo sem a etiqueta não fecha o pedido; a carência só fazia a
-- Lolô perder a conclusão quando tirava a etiqueta logo (teste de 17/10/2026).
DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.fn_ju_etiquetas_atuais'::regproc);
  n := replace(d, $a$      AND s.created_at < now() - interval '2 minutes'
$a$, '');
  IF n = d THEN RAISE EXCEPTION 'fn_ju_etiquetas_atuais: trecho não encontrado'; END IF;
  EXECUTE n;
END
$do$;
