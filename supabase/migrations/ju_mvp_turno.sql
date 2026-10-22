-- =====================================================================
-- Ju (MVP): tudo o que um turno do atendimento precisa, numa chamada só.
-- =====================================================================
-- AI dev note: o "RK Ju - Atendimento" (n8n) chama isto uma vez por turno,
-- depois da espera do buffer. Não faz gate: o gate é fn_ju_pode_enviar antes
-- e de novo antes de enviar.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_ju_dados_turno(p_conversa_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'conversa', jsonb_build_object(
      'id', c.id,
      'chatwoot_conversation_id', c.chatwoot_conversation_id,
      'telefone', c.telefone,
      'status', c.status,
      'versao', c.message_version),
    -- dia da semana por extenso sem depender do lc_time do banco (que está em inglês)
    'agora', (ARRAY['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'])
               [extract(dow FROM now() AT TIME ZONE 'America/Sao_Paulo')::int + 1]
             || ', ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    'contexto', public.fn_ju_contexto_cliente(c.id),
    'agendas_publicas', public.fn_ju_agendas_publicas(c.id),
    'servicos', public.fn_ju_servicos(),
    'termos_contrato', public.fn_ju_termos_contrato(),
    'conhecimento', coalesce((SELECT jsonb_object_agg(k.id, k.texto)
                              FROM public.ju_conhecimento k WHERE k.ativo), '{}'::jsonb))
  FROM public.ju_conversas c
  WHERE c.id = p_conversa_id;
$$;

REVOKE ALL ON FUNCTION public.fn_ju_dados_turno(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_dados_turno(bigint) TO service_role;
