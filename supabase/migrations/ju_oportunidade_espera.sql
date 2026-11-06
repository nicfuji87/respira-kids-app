-- AI dev note: 06/11/2026 (aprovado pelo dono, "Entrega 1 - proteção das oportunidades"):
-- 1. fn_ju_minutos_operacionais(de, ate): minutos dentro da cobertura humana (seg a sex, 8h às 18h, sem feriados de
--    followup_feriados). Ex.: pedido às 16h55 conta 5 min até 17h... e retoma às 8h do próximo dia útil.
-- 2. fn_ju_oportunidade_espera (dentro de fn_lista_espera_tick): pedido de AGENDAMENTO ABERTO de contato novo, sem
--    mensagem da equipe depois dele, com 15 min operacionais de espera → um aviso só no 🔔, citando o card do pedido.
--    O card continua no grupo (status persistente) e o resumo de pendências mostra o caso em "Prioridade".
--    O aviso é apagado quando a equipe responde, o pedido é concluído ou vira consulta.
-- Também registra a espera em ju_solicitacoes.dados (espera_*): base das métricas do painel.

CREATE OR REPLACE FUNCTION public.fn_ju_minutos_operacionais(p_de timestamptz, p_ate timestamptz)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT coalesce(round(sum(extract(epoch FROM
           least(p_ate AT TIME ZONE 'America/Sao_Paulo', g.d::date + time '18:00')
         - greatest(p_de AT TIME ZONE 'America/Sao_Paulo', g.d::date + time '08:00')) / 60)::numeric, 1), 0)
    FROM generate_series((p_de AT TIME ZONE 'America/Sao_Paulo')::date, (p_ate AT TIME ZONE 'America/Sao_Paulo')::date, interval '1 day') g(d)
   WHERE p_ate > p_de
     AND extract(isodow FROM g.d) BETWEEN 1 AND 5
     AND NOT EXISTS (SELECT 1 FROM followup_feriados f WHERE f.dia = g.d::date)
     AND least(p_ate AT TIME ZONE 'America/Sao_Paulo', g.d::date + time '18:00') > greatest(p_de AT TIME ZONE 'America/Sao_Paulo', g.d::date + time '08:00');
$$;

CREATE OR REPLACE FUNCTION public.fn_ju_oportunidade_espera()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  GRUPO constant text := '120363433073436578@g.us';
  x record; v_tok text; v_txt text; v_n int := 0; v_fim int := 0; v_min numeric;
BEGIN
  v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';

  -- avisos já dados: some quando a equipe respondeu, o pedido fechou ou a criança ganhou consulta
  FOR x IN
    SELECT s.* FROM ju_solicitacoes s
     WHERE s.dados ? 'alerta_espera_em' AND NOT s.dados ? 'alerta_espera_fim'
  LOOP
    IF x.status <> 'ABERTA'
       OR EXISTS (SELECT 1 FROM ju_mensagens h WHERE h.conversa_id = x.conversa_id AND h.origem = 'HUMANO'
                    AND h.created_at > x.created_at AND coalesce(h.conteudo, '') !~* '^\s*@ju')
       OR EXISTS (SELECT 1 FROM agendamentos a WHERE a.ativo AND a.created_at > x.created_at
                    AND a.paciente_id = ANY (fn_le_pacientes_da_conversa(x.conversa_id))) THEN
      UPDATE ju_solicitacoes SET dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object('alerta_espera_fim', now())
       WHERE id = x.id;
      PERFORM fn_le_apagar(NULL, (x.dados ->> 'alerta_espera_req')::bigint);
      v_fim := v_fim + 1;
    END IF;
  END LOOP;

  IF v_tok IS NULL THEN RETURN jsonb_build_object('avisos', 0, 'resolvidos', v_fim); END IF;

  FOR x IN
    SELECT s.*, c.telefone, c.nome_whatsapp
      FROM ju_solicitacoes s JOIN ju_conversas c ON c.id = s.conversa_id
     WHERE s.tipo = 'AGENDAMENTO' AND s.status = 'ABERTA' AND NOT coalesce(s.dados ? 'alerta_espera_em', false)
       AND s.created_at > now() - interval '3 days' AND NOT c.sem_ia
       AND s.conversa_id NOT IN (SELECT unnest(fn_conversas_ids_teste()))
       AND public.fn_ju_contato_novo(s.conversa_id)
       AND NOT EXISTS (SELECT 1 FROM ju_mensagens h WHERE h.conversa_id = s.conversa_id AND h.origem = 'HUMANO'
                         AND h.created_at > s.created_at AND coalesce(h.conteudo, '') !~* '^\s*@ju')
     ORDER BY s.created_at LIMIT 5
  LOOP
    v_min := fn_ju_minutos_operacionais(x.created_at, now());
    CONTINUE WHEN v_min < 15;
    v_txt := '⏳ *Contato novo esperando há ' || floor(v_min)::int || ' min*' || E'\n'
          || coalesce(nullif(btrim(x.nome_whatsapp), ''), 'Contato novo')
          || coalesce(' · ' || fn_lista_espera_tel_fmt(fn_lista_espera_tel(x.telefone)), '') || E'\n'
          || 'Quer agendar e ainda não teve resposta da equipe.'
          || E'\n_Este aviso some quando alguém responder na conversa._';
    UPDATE ju_solicitacoes
       SET dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object(
             'alerta_espera_em', now(), 'alerta_espera_min', v_min,
             'alerta_espera_req', net.http_post(url := 'https://infuse.uazapi.com/send/text',
               body := jsonb_build_object('number', GRUPO, 'text', v_txt)
                       || CASE WHEN x.notificacao_msg_id IS NOT NULL THEN jsonb_build_object('replyid', x.notificacao_msg_id) ELSE '{}'::jsonb END,
               headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
               timeout_milliseconds := 20000))
     WHERE id = x.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('avisos', v_n, 'resolvidos', v_fim);
END $$;

DO $do$
DECLARE d text := pg_get_functiondef('public.fn_lista_espera_tick'::regproc);
BEGIN
  IF position($a$'comando_sem_resposta', public.fn_ju_comando_sem_resposta());$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_lista_espera_tick: trecho não encontrado';
  END IF;
  EXECUTE replace(d, $a$'comando_sem_resposta', public.fn_ju_comando_sem_resposta());$a$,
    $a$'comando_sem_resposta', public.fn_ju_comando_sem_resposta(),
                            'oportunidade_espera', public.fn_ju_oportunidade_espera());$a$);
END $do$;
