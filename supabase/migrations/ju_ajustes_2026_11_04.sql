-- AI dev note: ajustes da análise de 04/11/2026.
-- 1. Cadastro pronto sem consulta (caso Luiz Fernando: pedido de agendamento concluído às 18h34, cadastro
--    às 20h20, ninguém marcou seg 09/11 14h). 15 min depois do cadastro, se a conversa teve pedido de
--    AGENDAMENTO nos últimos 3 dias e a criança não tem consulta nem reserva, aviso 📋 no 🔔
--    (8h às 19h59, seg a sáb). O aviso some quando a consulta é criada. Roda no fn_lista_espera_tick.
-- 2. "Lolô na conversa" (equipe_por_perto / lolo_conduzindo): a janela de 90 min vale até 19h59
--    (antes 17h59). A Lolô trabalha até ~19h20 e a Ju falava por cima dela depois das 18h (caso Lucas).
-- (3. comprovante depois do "Pagamento Recebido" é regra do prompt, no n8n.)

CREATE TABLE IF NOT EXISTS public.ju_cadastro_sem_consulta (
  paciente_id uuid PRIMARY KEY REFERENCES public.pessoas(id) ON DELETE CASCADE,
  conversa_id bigint REFERENCES public.ju_conversas(id) ON DELETE SET NULL,
  solicitacao_id bigint REFERENCES public.ju_solicitacoes(id) ON DELETE SET NULL,
  req_id bigint, msg_id text,
  avisado_em timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz
);
ALTER TABLE public.ju_cadastro_sem_consulta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_cadastro_sem_consulta FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_ju_cadastro_sem_consulta()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  GRUPO constant text := '120363433073436578@g.us';
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo'; x record; v_tok text; v_txt text; v_n int := 0; v_fim int := 0;
BEGIN
  v_tok := fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  -- consulta criada: o aviso sai do grupo
  FOR x IN SELECT * FROM ju_cadastro_sem_consulta WHERE resolvido_em IS NULL LOOP
    IF EXISTS (SELECT 1 FROM agendamentos a WHERE a.paciente_id = x.paciente_id AND a.ativo) THEN
      UPDATE ju_cadastro_sem_consulta SET msg_id = coalesce(msg_id, fn_le_msg_id(req_id)), resolvido_em = now() WHERE paciente_id = x.paciente_id;
      PERFORM fn_le_apagar(coalesce(x.msg_id, fn_le_msg_id(x.req_id)), x.req_id);
      v_fim := v_fim + 1;
    ELSIF x.msg_id IS NULL AND x.req_id IS NOT NULL THEN
      UPDATE ju_cadastro_sem_consulta SET msg_id = fn_le_msg_id(req_id) WHERE paciente_id = x.paciente_id;
    END IF;
  END LOOP;

  IF v_tok IS NULL OR extract(isodow FROM v_agora) = 7 OR v_agora::time < time '08:00' OR v_agora::time >= time '20:00' THEN
    RETURN jsonb_build_object('avisos', 0, 'resolvidos', v_fim);
  END IF;

  FOR x IN
    SELECT p.id AS paciente_id, p.nome, p.created_at, cv.id AS conversa_id, cv.telefone, s.id AS solicitacao_id, s.resumo
      FROM pessoas p
      JOIN pessoa_tipos pt ON pt.id = p.id_tipo_pessoa AND pt.codigo = 'paciente'
      CROSS JOIN LATERAL (SELECT c.* FROM ju_conversas c WHERE c.id = ANY (fn_le_conversas_do_paciente(p.id)) AND NOT c.sem_ia
                           ORDER BY c.ultima_mensagem_cliente DESC NULLS LAST LIMIT 1) cv
      CROSS JOIN LATERAL (SELECT so.* FROM ju_solicitacoes so WHERE so.conversa_id = cv.id AND so.tipo = 'AGENDAMENTO'
                             AND so.created_at > p.created_at - interval '3 days'
                           ORDER BY so.created_at DESC LIMIT 1) s
     WHERE p.created_at BETWEEN now() - interval '2 days' AND now() - interval '15 minutes'
       AND NOT EXISTS (SELECT 1 FROM ju_cadastro_sem_consulta k WHERE k.paciente_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM agendamentos a WHERE a.paciente_id = p.id AND a.ativo)
       AND NOT EXISTS (SELECT 1 FROM ju_reserva_agenda m JOIN agenda_bloqueios b ON b.id = m.bloqueio_id
                        WHERE m.conversa_id = cv.id AND b.ativo AND b.deleted_at IS NULL)
     LIMIT 5
  LOOP
    v_txt := '📋 *Cadastro pronto, falta marcar*' || E'\n'
          || split_part(btrim(x.nome), ' ', 1) || coalesce(' ' || nullif(split_part(btrim(x.nome), ' ', 2), ''), '')
          || coalesce(' · ' || fn_lista_espera_tel_fmt(fn_lista_espera_tel(x.telefone)), '') || E'\n'
          || 'Cadastro feito ' || CASE WHEN (x.created_at AT TIME ZONE 'America/Sao_Paulo')::date = v_agora::date THEN 'hoje' ELSE 'em ' || to_char(x.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM') END
          || ' às ' || to_char(x.created_at AT TIME ZONE 'America/Sao_Paulo', 'HH24"h"MI') || ' e ainda não há consulta na agenda.'
          || CASE WHEN nullif(btrim(x.resumo), '') IS NOT NULL
                  THEN E'\n' || 'Pedido: ' || CASE WHEN length(btrim(x.resumo)) > 220 THEN left(btrim(x.resumo), 217) || '...' ELSE btrim(x.resumo) END
                  ELSE '' END
          || E'\n\n' || '_Este aviso some quando a consulta for criada._';
    INSERT INTO ju_cadastro_sem_consulta (paciente_id, conversa_id, solicitacao_id, req_id)
    VALUES (x.paciente_id, x.conversa_id, x.solicitacao_id,
            net.http_post(url := 'https://infuse.uazapi.com/send/text',
              body := jsonb_build_object('number', GRUPO, 'text', v_txt),
              headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
              timeout_milliseconds := 20000));
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('avisos', v_n, 'resolvidos', v_fim);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_ju_cadastro_sem_consulta() FROM anon, authenticated, public;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fn_lista_espera_tick'::regproc);
  IF position($a$RETURN jsonb_build_object('vagas_fechadas', v_n, 'saiu_da_lista', v_fila, 'ia', v_req IS NOT NULL);$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_lista_espera_tick: trecho não encontrado';
  END IF;
  EXECUTE replace(d, $a$RETURN jsonb_build_object('vagas_fechadas', v_n, 'saiu_da_lista', v_fila, 'ia', v_req IS NOT NULL);$a$,
    $a$RETURN jsonb_build_object('vagas_fechadas', v_n, 'saiu_da_lista', v_fila, 'ia', v_req IS NOT NULL,
                            'cadastro_sem_consulta', public.fn_ju_cadastro_sem_consulta());$a$);

  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  IF (length(d) - length(replace(d, $a$AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 8 AND 17$a$, '')))
     / length($a$AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 8 AND 17$a$) <> 2 THEN
    RAISE EXCEPTION 'fn_ju_turno: esperava 2 janelas de horário';
  END IF;
  EXECUTE replace(d, $a$AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 8 AND 17$a$,
                     $a$AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 8 AND 19$a$);
END $do$;
