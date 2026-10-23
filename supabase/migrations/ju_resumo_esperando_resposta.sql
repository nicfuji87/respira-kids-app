-- Resumo "Esperando resposta" (pedido do dono, 23/10/2026): no fim do dia (17h30, seg–sex) a Ju posta
-- no 🔔 Notificações as conversas em que a família escreveu por último e ninguém da equipe respondeu.
-- O banco junta os candidatos; a IA do n8n ("RK Ju - Resumo do dia") decide o que ainda precisa de
-- resposta e escreve uma linha por conversa.
CREATE OR REPLACE FUNCTION public.fn_ju_esperando_resposta(p_horas integer DEFAULT 72)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH cand AS (
    SELECT c.id, c.wa_chatid, c.telefone, c.sem_ia,
           (SELECT max(m.created_at) FROM ju_mensagens m
             WHERE m.conversa_id = c.id AND m.origem = 'HUMANO') AS ult_humano
    FROM ju_conversas c
    WHERE c.wa_chatid NOT LIKE '%@g.us'
      AND c.wa_chatid !~ '^55619990000'
      AND NOT public.fn_ju_eh_equipe(c.telefone)
      AND c.telefone <> '+5561981446666'  -- dono: a conversa dele com a clínica é interna
      AND c.ultima_mensagem_cliente > now() - make_interval(hours => p_horas)
  ),
  pend AS (
    SELECT k.*,
           (SELECT jsonb_agg(jsonb_build_object(
                     'quando', to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
                     'quem', CASE m.origem WHEN 'CLIENTE' THEN 'familia' ELSE 'ju' END,
                     'texto', left(regexp_replace(coalesce(m.conteudo, '[' || lower(m.tipo) || ']'), '\s+', ' ', 'g'), 400))
                   ORDER BY m.created_at)
              FROM ju_mensagens m
             WHERE m.conversa_id = k.id AND m.origem IN ('CLIENTE', 'JU')
               AND m.created_at > coalesce(k.ult_humano, now() - make_interval(hours => p_horas))
               AND NOT (m.origem = 'CLIENTE' AND m.tipo = 'BOTAO')) AS desde_lolo,
           (SELECT min(m.created_at) FROM ju_mensagens m
             WHERE m.conversa_id = k.id AND m.origem = 'CLIENTE' AND m.tipo <> 'BOTAO'
               AND m.created_at > coalesce(k.ult_humano, now() - make_interval(hours => p_horas))) AS esperando_desde
    FROM cand k
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'conversa_id', p.id,
           'telefone', regexp_replace(p.telefone, '^\+55(\d{2})(\d{4,5})(\d{4})$', '(\1) \2-\3'),
           'esperando_desde', to_char(p.esperando_desde AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI'),
           'horas_esperando', round(extract(epoch FROM now() - p.esperando_desde) / 3600.0, 1),
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

REVOKE ALL ON FUNCTION public.fn_ju_esperando_resposta(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_esperando_resposta(integer) TO service_role;
