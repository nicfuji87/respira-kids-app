-- Resumo "Esperando resposta" carrega o que já apareceu (pedido do dono, 26/10/2026).
-- Caso Gabriela de Checchi: a família escreveu na sexta 8h23, ninguém respondeu, e na segunda 12h
-- a conversa sumiu do resumo porque a busca olhava só as últimas 72 horas. Agora tudo o que entra num
-- resumo fica guardado e volta a ser conferido nos próximos (até 15 dias desde a última vez que
-- apareceu), sem limite de 72 horas. Sai sozinho quando a Lolô responde (mensagem da equipe depois da
-- família) ou quando a IA julga que não falta mais nada.

CREATE TABLE IF NOT EXISTS public.ju_resumo_itens (
  conversa_id  bigint PRIMARY KEY REFERENCES public.ju_conversas(id) ON DELETE CASCADE,
  primeira_vez timestamptz NOT NULL DEFAULT now(),
  ultima_vez   timestamptz NOT NULL DEFAULT now(),
  vezes        integer NOT NULL DEFAULT 1,
  linha        text,
  urgente      boolean NOT NULL DEFAULT false
);
ALTER TABLE public.ju_resumo_itens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_resumo_itens FROM anon, authenticated;

-- grava o id do resumo postado e os itens que entraram nele
DROP FUNCTION IF EXISTS public.fn_ju_resumo_postado(text);
CREATE OR REPLACE FUNCTION public.fn_ju_resumo_postado(p_msg_id text, p_itens jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_ant text;
BEGIN
  SELECT resumo_msg_id INTO v_ant FROM public.ju_config WHERE id = 1;
  UPDATE public.ju_config SET resumo_msg_id = nullif(btrim(p_msg_id), '') WHERE id = 1;

  INSERT INTO public.ju_resumo_itens (conversa_id, linha, urgente)
  SELECT (i ->> 'conversa_id')::bigint, left(i ->> 'linha', 500), coalesce((i ->> 'urgente')::boolean, false)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_itens) = 'array' THEN p_itens ELSE '[]'::jsonb END) i
   WHERE (i ->> 'conversa_id') ~ '^\d+$'
     AND EXISTS (SELECT 1 FROM public.ju_conversas c WHERE c.id = (i ->> 'conversa_id')::bigint)
  ON CONFLICT (conversa_id) DO UPDATE
     SET ultima_vez = now(),
         vezes = public.ju_resumo_itens.vezes + 1,
         linha = EXCLUDED.linha,
         urgente = EXCLUDED.urgente,
         -- voltou depois de ter saído (respondida e família escreveu de novo): recomeça a contagem
         primeira_vez = CASE WHEN public.ju_resumo_itens.vezes = 0
                               OR public.ju_resumo_itens.ultima_vez < now() - interval '15 days'
                             THEN now() ELSE public.ju_resumo_itens.primeira_vez END;
  RETURN jsonb_build_object('anterior', v_ant);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_ju_resumo_postado(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_resumo_postado(text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_ju_esperando_resposta(p_horas integer DEFAULT 72)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH cand AS (
    SELECT c.id, c.wa_chatid, c.telefone, c.sem_ia, r.primeira_vez AS no_resumo_desde, r.vezes,
           (SELECT max(m.created_at) FROM ju_mensagens m
             WHERE m.conversa_id = c.id AND m.origem = 'HUMANO') AS ult_humano
    FROM ju_conversas c
    LEFT JOIN ju_resumo_itens r ON r.conversa_id = c.id AND r.ultima_vez > now() - interval '15 days'
    WHERE c.wa_chatid NOT LIKE '%@g.us'
      AND c.wa_chatid !~ '^55619990000'
      AND c.wa_chatid NOT LIKE 'cw%:%'
      AND NOT public.fn_ju_eh_equipe(c.telefone)
      AND c.telefone <> '+5561981446666'  -- dono: a conversa dele com a clínica é interna
      AND (c.ultima_mensagem_cliente > now() - make_interval(hours => p_horas)  -- novidade
           OR r.conversa_id IS NOT NULL)                                          -- já estava no resumo
  ),
  pend AS (
    SELECT k.*,
           (SELECT jsonb_agg(x.j ORDER BY x.created_at)
              FROM (SELECT m.created_at,
                           jsonb_build_object(
                             'quando', to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
                             'quem', CASE m.origem WHEN 'CLIENTE' THEN 'familia' ELSE 'ju' END,
                             'texto', left(regexp_replace(coalesce(m.conteudo, '[' || lower(m.tipo) || ']'), '\s+', ' ', 'g'), 400)) AS j
                      FROM ju_mensagens m
                     WHERE m.conversa_id = k.id AND m.origem IN ('CLIENTE', 'JU')
                       AND m.created_at > coalesce(k.ult_humano, now() - interval '15 days')
                       AND NOT (m.origem = 'CLIENTE' AND m.tipo = 'BOTAO')
                     ORDER BY m.created_at DESC LIMIT 20) x) AS desde_lolo,
           (SELECT min(m.created_at) FROM ju_mensagens m
             WHERE m.conversa_id = k.id AND m.origem = 'CLIENTE' AND m.tipo <> 'BOTAO'
               AND m.created_at > coalesce(k.ult_humano, now() - interval '15 days')) AS esperando_desde
    FROM cand k
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'conversa_id', p.id,
           'telefone', regexp_replace(p.telefone, '^\+55(\d{2})(\d{4,5})(\d{4})$', '(\1) \2-\3'),
           'esperando_desde', to_char(p.esperando_desde AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
           'horas_esperando', round(extract(epoch FROM now() - p.esperando_desde) / 3600.0, 1),
           'no_resumo_desde', CASE WHEN p.no_resumo_desde IS NOT NULL AND p.vezes > 0
                                   THEN to_char(p.no_resumo_desde AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') END,
           'vezes_no_resumo', coalesce(p.vezes, 0),
           'ultima_resposta_da_lolo', to_char(p.ult_humano AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
           'sem_ia', p.sem_ia,
           'responsavel', ctx ->> 'responsavel_identificado',
           'responsaveis', ctx -> 'responsaveis',
           'criancas', (SELECT jsonb_agg(jsonb_build_object(
                                 'nome', split_part(x ->> 'nome', ' ', 1),
                                 'ja_atendido', x -> 'ja_atendido',
                                 'proximas_consultas', x -> 'proximas_consultas'))
                          FROM jsonb_array_elements(ctx -> 'pacientes') x
                         WHERE (x ->> 'acesso_agenda')::boolean),
           'pedidos_abertos', (SELECT jsonb_agg(jsonb_build_object('tipo', s.tipo, 'resumo', s.resumo,
                                  'aberto_em', to_char(s.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')))
                                 FROM ju_solicitacoes s WHERE s.conversa_id = p.id AND s.status = 'ABERTA'),
           'mensagens_desde_a_lolo', p.desde_lolo)
         ORDER BY p.esperando_desde), '[]'::jsonb)
  FROM pend p
  CROSS JOIN LATERAL (SELECT public.fn_ju_contexto_cliente(p.id) AS ctx) z
  WHERE p.esperando_desde IS NOT NULL;
$function$;

-- carga inicial (26/10/2026): conversas em que a família escreveu por último nos últimos 15 dias entram
-- como candidatas por 2 dias; se a IA do resumo não as escolher, saem sozinhas.
INSERT INTO public.ju_resumo_itens (conversa_id, primeira_vez, ultima_vez, vezes, linha)
SELECT c.id, c.ultima_mensagem_cliente, now() - interval '13 days', 0, NULL
  FROM public.ju_conversas c
 WHERE c.ultima_mensagem_cliente > now() - interval '15 days'
   AND c.ultima_mensagem_cliente > coalesce(c.ultima_mensagem_humano, '-infinity')
   AND c.wa_chatid NOT LIKE '%@g.us' AND c.wa_chatid !~ '^55619990000' AND c.wa_chatid NOT LIKE 'cw%:%'
   AND NOT public.fn_ju_eh_equipe(c.telefone) AND c.telefone <> '+5561981446666'
ON CONFLICT (conversa_id) DO NOTHING;
