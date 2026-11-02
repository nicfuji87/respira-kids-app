-- 02/11/2026 (pedido do dono): a Ju movimenta o sistema dos pacientes da agenda pública / fixos.
-- AGENDAR_LINK: a família escolhe o horário por mensagem e a Ju marca no horário livre do link
--               (mesma função da página pública: limite semanal, conflito, valor).
-- ADIAR_FIXO:   "essa semana não dá" / viagem: adia o fixo (mesmo efeito do botão Adiar) e tira da fila.
-- Quem quer parar o tratamento vai para a secretaria (prompt); o lembrete automático pula quem tem
-- pedido de CANCELAMENTO aberto.

ALTER TABLE public.ju_acoes DROP CONSTRAINT ju_acoes_tipo_check;
ALTER TABLE public.ju_acoes ADD CONSTRAINT ju_acoes_tipo_check CHECK (tipo = ANY (ARRAY[
  'REENVIO_CONTRATO', 'NF_EMITIR', 'RENOVAR_LINK', 'ATESTADO', 'CORRIGIR_CONTATO_CONTRATO',
  'CANCELAR_CONSULTA', 'SUSPENDER_COBRANCA', 'AGENDAR_LINK', 'ADIAR_FIXO']));

CREATE OR REPLACE FUNCTION public.fn_ju_quando(p timestamp)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $f$
  SELECT regexp_replace((ARRAY['dom','seg','ter','qua','qui','sex','sáb'])[extract(dow FROM p)::int + 1]
         || ' ' || to_char(p, 'DD/MM "às" FMHH24"h"MI'), 'h00$', 'h');
$f$;

CREATE OR REPLACE FUNCTION public.fn_ju_acao_fixo(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE
  c ju_conversas; v_acao text := p ->> 'acao'; v_versao bigint := nullif(p ->> 'versao', '')::bigint;
  v_pac uuid; v_nome text; v_ok boolean; f pacientes_fixos;
  v_profs uuid[]; v_alvo timestamp; v_slot record; v_sel record; v_res record;
  v_tipo uuid; v_local uuid; v_emp uuid; v_resp uuid; v_whats bigint;
  v_livres text; v_link text; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_volta date; v_quando text; v_prof text;
BEGIN
  SELECT * INTO c FROM ju_conversas WHERE id = (p ->> 'conversa_id')::bigint;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'resposta', 'Conversa não encontrada; nada foi feito. Responda exatamente [NADA].'); END IF;
  IF c.sem_ia OR (v_versao IS NOT NULL AND c.message_version > v_versao) THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'A conversa mudou (mensagem nova ou marcada SEM IA); nada foi feito. Responda exatamente [NADA].');
  END IF;

  BEGIN v_pac := (p ->> 'paciente_id')::uuid; EXCEPTION WHEN OTHERS THEN v_pac := NULL; END;
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(fn_ju_contexto_cliente(c.id) -> 'pacientes') x
                  WHERE (x ->> 'paciente_id')::uuid = v_pac AND (x ->> 'acesso_agenda')::boolean) INTO v_ok;
  IF v_pac IS NULL OR NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Nada foi feito: use o paciente_id copiado de cliente.pacientes (de um paciente que esta conversa pode agendar). Se não der, chame a secretaria.');
  END IF;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_nome FROM pessoas WHERE id = v_pac;
  SELECT * INTO f FROM pacientes_fixos WHERE paciente_id = v_pac AND ativo;

  -- ------------------------------------------------------------------ ADIAR
  IF v_acao = 'ADIAR_FIXO' THEN
    IF f.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'resposta', v_nome || ' não é paciente fixo; nada foi adiado. Responda à família normalmente.');
    END IF;
    BEGIN v_volta := nullif(p ->> 'data', '')::date; EXCEPTION WHEN OTHERS THEN v_volta := NULL; END;
    v_volta := date_trunc('week', coalesce(v_volta, v_hoje + 7))::date;
    IF v_volta <= date_trunc('week', v_hoje)::date THEN v_volta := date_trunc('week', v_hoje)::date + 7; END IF;
    IF v_volta > v_hoje + 84 THEN
      RETURN jsonb_build_object('ok', false, 'resposta', 'Pausa de mais de 12 semanas é com a Lolô. Use chamar_secretaria com tipo OUTRO (resumo: ' || v_nome || ' vai pausar a fisio até quando e por quê) e diga só que a Lolô fala com ela por aqui.');
    END IF;
    UPDATE pacientes_fixos
       SET adiado_ate = v_volta,
           adiado_motivo = left('[Ju] ' || coalesce(nullif(btrim(p ->> 'resumo'), ''), 'família avisou pelo WhatsApp'), 200),
           ultima_origem = 'lista', ultima_evolucao_id = NULL, atualizado_por = NULL
     WHERE id = f.id;
    UPDATE pacientes_fixos_envios SET status = 'cancelado', erro = 'Adiado pela família (Ju)'
     WHERE paciente_id = v_pac AND status = 'fila' AND semana < v_volta;
    INSERT INTO ju_acoes (conversa_id, versao, tipo, alvo_id, status, detalhe)
    VALUES (c.id, coalesce(v_versao, c.message_version), 'ADIAR_FIXO', v_pac, 'OK',
            v_nome || ' · volta na semana de ' || to_char(v_volta, 'DD/MM') || ' · ' || coalesce(p ->> 'resumo', ''))
    ON CONFLICT DO NOTHING;
    INSERT INTO ju_avisos_grupo (texto, origem, conversa_id)
    VALUES ('⏸️ *Fixo adiado pela Ju*' || E'\n' || v_nome || ' volta na semana de ' || to_char(v_volta, 'DD/MM')
            || coalesce(E'\nMotivo: ' || nullif(btrim(p ->> 'resumo'), ''), ''), 'FIXO_ADIADO', c.id);
    RETURN jsonb_build_object('ok', true, 'resposta',
      'Feito: a agenda de ' || v_nome || ' volta na semana de ' || to_char(v_volta, 'DD/MM') || '. Diga à família, em uma frase leve, que está tudo bem e que vocês falam com ela nessa semana. Não pergunte o motivo e não fale de cobrança.');
  END IF;

  IF v_acao <> 'AGENDAR_LINK' THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Ação desconhecida; nada foi feito.');
  END IF;

  -- ------------------------------------------------------------------ AGENDAR PELO LINK
  IF f.id IS NULL AND NOT EXISTS (SELECT 1 FROM agenda_selecoes s WHERE s.paciente_id = v_pac) THEN
    RETURN jsonb_build_object('ok', false, 'resposta', v_nome || ' não marca pela agenda pública. Siga o caminho normal: chame a secretaria (AGENDAMENTO) com o horário que a família pediu.');
  END IF;

  SELECT array_agg(DISTINCT x) INTO v_profs FROM unnest(
    coalesce(f.profissionais, '{}') || ARRAY[f.profissional_id]
    || ARRAY(SELECT ag.profissional_id FROM agenda_selecoes s JOIN agendas_compartilhadas ag ON ag.id = s.agenda_id
              WHERE s.paciente_id = v_pac AND s.created_at > now() - interval '180 days')
    || ARRAY(SELECT a.profissional_id FROM agendamentos a WHERE a.paciente_id = v_pac AND a.ativo
              AND a.data_hora > now() - interval '120 days')) x WHERE x IS NOT NULL;

  BEGIN v_alvo := (p ->> 'data')::date + (p ->> 'hora')::time; EXCEPTION WHEN OTHERS THEN v_alvo := NULL; END;
  IF v_alvo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'resposta', 'Faltou o dia (AAAA-MM-DD) ou a hora (HH:MM). Pergunte à família o dia e o horário.');
  END IF;

  SELECT s.id, s.data_hora, ag.profissional_id INTO v_slot
    FROM agenda_slots s JOIN agendas_compartilhadas ag ON ag.id = s.agenda_id
   WHERE ag.ativo AND ag.profissional_id = ANY (v_profs) AND s.disponivel AND s.deleted_at IS NULL
     AND (s.data_hora AT TIME ZONE 'UTC') = v_alvo
     AND v_alvo > (now() AT TIME ZONE 'America/Sao_Paulo') + interval '2 hours'
   ORDER BY (ag.profissional_id = f.profissional_id) DESC NULLS LAST, ag.created_at DESC
   LIMIT 1;

  IF v_slot.id IS NULL THEN
    SELECT string_agg(fn_ju_quando(z.dh) || ' (' || z.prof || ')', '; ' ORDER BY z.dh) INTO v_livres
      FROM (SELECT DISTINCT s.data_hora AT TIME ZONE 'UTC' AS dh, split_part(btrim(pr.nome), ' ', 1) AS prof
              FROM agenda_slots s JOIN agendas_compartilhadas ag ON ag.id = s.agenda_id
              JOIN pessoas pr ON pr.id = ag.profissional_id
             WHERE ag.ativo AND ag.profissional_id = ANY (v_profs) AND s.disponivel AND s.deleted_at IS NULL
               AND (s.data_hora AT TIME ZONE 'UTC') >= date_trunc('week', v_alvo)
               AND (s.data_hora AT TIME ZONE 'UTC') < date_trunc('week', v_alvo) + interval '7 days'
               AND (s.data_hora AT TIME ZONE 'UTC') > (now() AT TIME ZONE 'America/Sao_Paulo') + interval '2 hours'
             ORDER BY 1 LIMIT 15) z;
    IF v_livres IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'resposta',
        'Não marquei: não há horário livre na agenda pública nessa semana. Use chamar_secretaria com tipo AGENDAMENTO (resumo: ' || v_nome || ', fixo, pediu ' || fn_ju_quando(v_alvo) || ') e diga só que a Lolô vê um horário e responde por aqui.');
    END IF;
    RETURN jsonb_build_object('ok', false, 'resposta',
      'Não marquei: ' || fn_ju_quando(v_alvo) || ' não está livre. Livres nessa semana: ' || v_livres
      || '. Ofereça à família no máximo 3 opções perto do que ela pediu, sem dizer que viu a agenda inteira.');
  END IF;

  -- dados da marcação: última escolha pelo link; senão, a última consulta
  SELECT s.responsavel_id, s.responsavel_whatsapp, s.tipo_servico_id, s.local_id, s.empresa_id INTO v_sel
    FROM agenda_selecoes s WHERE s.paciente_id = v_pac ORDER BY s.created_at DESC LIMIT 1;
  v_tipo := v_sel.tipo_servico_id; v_local := v_sel.local_id; v_emp := v_sel.empresa_id; v_resp := v_sel.responsavel_id;
  IF v_tipo IS NULL THEN
    SELECT a.tipo_servico_id, a.local_id, a.empresa_fatura INTO v_tipo, v_local, v_emp
      FROM agendamentos a JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
     WHERE a.paciente_id = v_pac AND a.ativo AND ts.nome ILIKE '%motor%'
     ORDER BY a.data_hora DESC LIMIT 1;
  END IF;
  IF v_resp IS NULL THEN
    SELECT pr.id_responsavel INTO v_resp FROM pessoa_responsaveis pr
     WHERE pr.id_pessoa = v_pac AND pr.ativo IS NOT FALSE AND pr.tipo_responsabilidade IN ('legal', 'ambos')
     ORDER BY CASE pr.tipo_responsabilidade WHEN 'legal' THEN 0 ELSE 1 END LIMIT 1;
  END IF;
  IF v_tipo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'resposta',
      'Não marquei: não sei qual serviço usar. Use chamar_secretaria com tipo AGENDAMENTO (resumo: ' || v_nome || ', quer ' || fn_ju_quando(v_alvo) || ') e diga só que a Lolô confirma por aqui.');
  END IF;
  v_whats := nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '')::bigint;

  SELECT * INTO v_res FROM fn_criar_agendamento_agenda_compartilhada(
    v_slot.id, v_pac, v_resp, v_tipo, v_local, v_emp, coalesce(v_sel.responsavel_whatsapp, v_whats),
    (SELECT id FROM consulta_status WHERE codigo = 'agendado'),
    (SELECT id FROM pagamento_status WHERE codigo = 'pendente'));

  v_quando := fn_ju_quando(v_slot.data_hora AT TIME ZONE 'UTC');
  SELECT split_part(btrim(nome), ' ', 1) INTO v_prof FROM pessoas WHERE id = v_slot.profissional_id;
  IF NOT coalesce(v_res.sucesso, false) THEN
    RETURN jsonb_build_object('ok', false, 'resposta',
      'Não marquei ' || v_quando || ': ' || coalesce(v_res.mensagem, 'erro') || ' Explique à família em uma frase, com suas palavras. Se não houver outra saída, chame a secretaria (AGENDAMENTO).');
  END IF;

  INSERT INTO ju_acoes (conversa_id, versao, tipo, alvo_id, status, detalhe)
  VALUES (c.id, coalesce(v_versao, c.message_version), 'AGENDAR_LINK', v_res.agendamento_id, 'OK',
          v_nome || ' · ' || v_quando || ' · ' || v_prof)
  ON CONFLICT DO NOTHING;
  INSERT INTO ju_avisos_grupo (texto, origem, conversa_id)
  VALUES ('📅 *Sessão marcada pela Ju*' || E'\n' || v_nome || ' · ' || v_quando || ' · ' || v_prof
          || E'\n' || 'A família escolheu pelo WhatsApp um horário livre da agenda pública.', 'AGENDOU_PELO_LINK', c.id);
  RETURN jsonb_build_object('ok', true, 'agendamento_id', v_res.agendamento_id, 'resposta',
    'Sessão marcada no sistema: ' || v_nome || ', ' || v_quando || ', com a ' || v_prof
    || '. Confirme à família em uma frase curta (dia, horário e fisio), sem falar de valor nem de link.');
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_acao_fixo(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_acao_fixo(jsonb) TO service_role;

-- lembrete automático pula quem pediu para parar (pedido de CANCELAMENTO aberto)
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_fixos_lembrete_automatico(text,boolean)'::regprocedure);
        f text := $$'motivo', 'conversa SEM IA'); CONTINUE;
    END IF;$$;
BEGIN
  IF position(f IN d) = 0 THEN RAISE EXCEPTION 'fn_fixos_lembrete_automatico: trecho não encontrado'; END IF;
  EXECUTE replace(d, f, f || $$
    IF EXISTS (SELECT 1 FROM ju_solicitacoes so JOIN ju_conversas jc ON jc.id = so.conversa_id
                WHERE so.status = 'ABERTA' AND so.tipo = 'CANCELAMENTO'
                  AND regexp_replace(coalesce(jc.telefone, ''), '\D', '', 'g') IN (v_tel, '55' || v_tel)) THEN
      v_pulos := v_pulos || jsonb_build_object('paciente', p ->> 'paciente_nome', 'motivo', 'pedido de cancelamento aberto'); CONTINUE;
    END IF;$$);
END $m$;
