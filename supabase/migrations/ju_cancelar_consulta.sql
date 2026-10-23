-- A Ju cancela consulta pedida pela família (decisão do dono, 23/10/2026).
-- Regras (as mesmas do botão "Cancelar" + o que a Lolô faz):
--   6 h ou mais antes  -> cancela; o fluxo de cancelamento avisa a fisio e o 🩺 grupo de atendimentos;
--   menos de 6 h       -> não cancela: a Ju passa para a Lolô (ela decide a cobrança caso a caso);
--   horário já passou  -> não cancela: Lolô;
--   consulta com cobrança/fatura/link, de criança sem acesso_agenda ou já fora de agendado/confirmado -> Lolô.
-- A IA só escolhe o agendamento_id; quem decide é o banco.

ALTER TABLE public.ju_acoes DROP CONSTRAINT IF EXISTS ju_acoes_tipo_check;
ALTER TABLE public.ju_acoes ADD CONSTRAINT ju_acoes_tipo_check CHECK (tipo = ANY (ARRAY[
  'REENVIO_CONTRATO', 'NF_EMITIR', 'RENOVAR_LINK', 'ATESTADO', 'CORRIGIR_CONTATO_CONTRATO', 'CANCELAR_CONSULTA']));

-- Contexto: próximas consultas passam a trazer o id e quantas horas faltam.
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_contexto_cliente(bigint)'::regprocedure); n text;
BEGIN
  IF d LIKE '%''faltam_horas''%' THEN RETURN; END IF;
  n := replace(d,
    $a$'proximas_consultas', CASE WHEN e.agenda THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'data_hora', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),$a$,
    $a$'proximas_consultas', CASE WHEN e.agenda THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'agendamento_id', a.id,
                   'faltam_horas', round(extract(epoch FROM (a.data_hora AT TIME ZONE 'UTC') - (now() AT TIME ZONE 'America/Sao_Paulo')) / 3600.0, 1),
                   'data_hora', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_contexto_cliente: proximas_consultas não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

CREATE OR REPLACE FUNCTION public.fn_ju_cancelar_consulta(p_conversa_id bigint, p_versao bigint, p_agendamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 -- 'public': os gatilhos de agendamentos (ex.: cancelar_pagamento_quando_consulta_cancelada) usam nomes sem schema
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c        public.ju_conversas;
  a        public.agendamentos;
  v_cs     text;
  v_ps     text;
  v_ok     boolean;
  v_horas  numeric;
  v_pac    text;
  v_prof   text;
  v_quando text;
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'CONVERSA_INEXISTENTE'); END IF;
  IF c.sem_ia THEN RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_IA'); END IF;
  IF p_versao IS NOT NULL AND c.message_version > p_versao THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'MENSAGEM_NOVA');
  END IF;

  SELECT * INTO a FROM public.agendamentos WHERE id = p_agendamento_id FOR UPDATE;
  IF NOT FOUND OR NOT a.ativo THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CONSULTA_NAO_ENCONTRADA');
  END IF;

  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(public.fn_ju_contexto_cliente(c.id) -> 'pacientes') x
                  WHERE (x ->> 'paciente_id')::uuid = a.paciente_id AND (x ->> 'acesso_agenda')::boolean)
    INTO v_ok;
  IF NOT v_ok THEN RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_ACESSO'); END IF;

  SELECT split_part(btrim(p.nome), ' ', 1) INTO v_pac FROM public.pessoas p WHERE p.id = a.paciente_id;
  SELECT split_part(btrim(p.nome), ' ', 1) INTO v_prof FROM public.pessoas p WHERE p.id = a.profissional_id;
  v_quando := (ARRAY['dom','seg','ter','qua','qui','sex','sáb'])[extract(dow FROM a.data_hora AT TIME ZONE 'UTC')::int + 1]
              || ' ' || to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM "às" HH24"h"MI');
  v_quando := regexp_replace(v_quando, 'h00$', 'h');

  SELECT codigo INTO v_cs FROM public.consulta_status WHERE id = a.status_consulta_id;
  IF v_cs = 'cancelado' THEN
    RETURN jsonb_build_object('ok', true, 'ja_cancelada', true, 'paciente', v_pac, 'quando', v_quando, 'profissional', v_prof);
  END IF;
  IF v_cs NOT IN ('agendado', 'confirmado') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'STATUS_' || upper(coalesce(v_cs, '?')));
  END IF;

  v_horas := extract(epoch FROM (a.data_hora AT TIME ZONE 'UTC') - (now() AT TIME ZONE 'America/Sao_Paulo')) / 3600.0;
  IF v_horas < 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'JA_PASSOU', 'paciente', v_pac, 'quando', v_quando, 'profissional', v_prof);
  END IF;
  IF v_horas < 6 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'MENOS_DE_6H', 'faltam_horas', round(v_horas, 1),
                              'paciente', v_pac, 'quando', v_quando, 'profissional', v_prof);
  END IF;

  SELECT codigo INTO v_ps FROM public.pagamento_status WHERE id = a.status_pagamento_id;
  IF a.fatura_id IS NOT NULL OR a.pagamento_link_id IS NOT NULL OR coalesce(v_ps, 'pendente') <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'COBRANCA_VINCULADA', 'paciente', v_pac, 'quando', v_quando, 'profissional', v_prof);
  END IF;

  -- O marcador "[Ju] cancelado" faz o fluxo de cancelamento (n8n) não mandar a mensagem automática à família:
  -- a resposta da Ju já diz qual sessão foi cancelada. A fisio e o grupo de atendimentos continuam avisados.
  UPDATE public.agendamentos
     SET status_consulta_id = (SELECT id FROM public.consulta_status WHERE codigo = 'cancelado'),
         status_pagamento_id = (SELECT id FROM public.pagamento_status WHERE codigo = 'cancelado'),
         observacao = concat_ws(' ', nullif(btrim(observacao), ''),
                                '[Ju] cancelado a pedido da família em '
                                || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') || '.'),
         updated_at = now()
   WHERE id = a.id;

  INSERT INTO public.ju_acoes (conversa_id, versao, tipo, alvo_id, status, detalhe)
  VALUES (c.id, coalesce(p_versao, c.message_version), 'CANCELAR_CONSULTA', a.id, 'OK',
          v_pac || ' · ' || v_quando || ' · ' || v_prof || ' · ' || round(v_horas, 1) || ' h antes')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'ja_cancelada', false, 'paciente', v_pac, 'quando', v_quando,
                            'profissional', v_prof, 'faltavam_horas', round(v_horas, 1));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ju_cancelar_consulta(bigint, bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_cancelar_consulta(bigint, bigint, uuid) TO service_role;
