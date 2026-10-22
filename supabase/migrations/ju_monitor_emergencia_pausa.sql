-- =====================================================================
-- Ju: monitor de emergência também nas conversas pausadas (21/10/2026)
-- =====================================================================
-- AI dev note: quando a Lolô escreve, a conversa fica PAUSADA (30 min no
-- expediente) e a Entrada não chama a Ju, nem para emergência. Agora o mesmo
-- monitor da etiqueta SEM IA (fn_ju_monitor_sem_ia, nome mantido) também vale
-- para conversa com pausa ativa, desde que a Ju esteja no ar para aquele
-- número (fn_ju_liberado: em modo de teste só os números de teste) e que não
-- seja número da equipe. Aviso só no grupo; a família não recebe nada.
-- Se ninguém responder, a retomada das Tarefas leva a mensagem à Ju quando a
-- pausa vence, e ela segue a regra normal de gravidade.
-- ju_alertas_sem_ia.motivo: SEM_IA | PAUSA. Dedupe de 30 min vale para os dois.
-- =====================================================================

ALTER TABLE public.ju_alertas_sem_ia ADD COLUMN motivo text NOT NULL DEFAULT 'SEM_IA'
  CHECK (motivo IN ('SEM_IA', 'PAUSA'));

CREATE OR REPLACE FUNCTION public.fn_ju_monitor_sem_ia(p_msg_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  m        public.ju_mensagens;
  c        public.ju_conversas;
  v_motivo text;
  v_txt    text;
  v_sinal  text;
  v_id     bigint;
  v_ctx    jsonb;
  v_contato text;
  v_pac    text;
  v_trecho text;
BEGIN
  SELECT * INTO m FROM public.ju_mensagens WHERE id = p_msg_id;
  IF NOT FOUND OR m.origem <> 'CLIENTE' THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.ju_conversas WHERE id = m.conversa_id FOR UPDATE;

  v_motivo := CASE
    WHEN c.sem_ia THEN 'SEM_IA'
    WHEN c.status = 'PAUSADA' AND c.pause_until > now()
         AND public.fn_ju_liberado(c.telefone)
         AND NOT public.fn_ju_eh_equipe(c.telefone) THEN 'PAUSA'
  END;
  IF v_motivo IS NULL THEN RETURN NULL; END IF;

  v_txt := CASE WHEN m.tipo IN ('TEXT', 'AUDIO') THEN m.conteudo
                ELSE substring(m.conteudo FROM '^Legenda: ([^\n]*)') END;
  IF nullif(btrim(v_txt), '') IS NULL THEN RETURN NULL; END IF;

  v_sinal := (regexp_match(v_txt, '(' || (SELECT k.regex_emergencia FROM public.ju_config k WHERE k.id = 1) || ')', 'i'))[1];
  IF v_sinal IS NULL THEN RETURN NULL; END IF;

  v_trecho := CASE WHEN length(v_txt) > 300 THEN left(v_txt, 300) || '…' ELSE v_txt END;

  -- mesma ocorrência: já avisou (ou está avisando) essa conversa há menos de 30 min
  IF EXISTS (SELECT 1 FROM public.ju_alertas_sem_ia a
              WHERE a.conversa_id = c.id AND a.status IN ('PENDENTE', 'ENVIADO')
                AND a.created_at > now() - interval '30 minutes') THEN
    INSERT INTO public.ju_alertas_sem_ia (conversa_id, mensagem_id, sinal, trecho, status, motivo)
    VALUES (c.id, m.id, v_sinal, v_trecho, 'AGRUPADO', v_motivo)
    ON CONFLICT (mensagem_id) DO NOTHING;
    RETURN NULL;
  END IF;

  INSERT INTO public.ju_alertas_sem_ia (conversa_id, mensagem_id, sinal, trecho, motivo)
  VALUES (c.id, m.id, v_sinal, v_trecho, v_motivo)
  ON CONFLICT (mensagem_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN NULL; END IF;

  v_ctx := public.fn_ju_contexto_cliente(c.id);
  v_contato := coalesce(v_ctx->>'responsavel_identificado',
                        (SELECT string_agg(x, ' / ') FROM jsonb_array_elements_text(v_ctx->'responsaveis') x),
                        'não identificado');
  v_pac := (SELECT string_agg(p->>'nome', ', ') FROM jsonb_array_elements(v_ctx->'pacientes') p);

  RETURN jsonb_build_object(
    'id', v_id,
    'motivo', v_motivo,
    'texto',
      CASE v_motivo
        WHEN 'SEM_IA' THEN
          '🚨 *ALERTA CLÍNICO — CONVERSA SEM IA*' || E'\n\n' ||
          'Possível emergência numa conversa bloqueada para atendimento automático.'
        ELSE
          '🚨 *ALERTA CLÍNICO — CONVERSA EM PAUSA*' || E'\n\n' ||
          'Possível emergência numa conversa em que a equipe escreveu há pouco (a Ju está pausada).'
      END || E'\n\n' ||
      '*Contato:* ' || v_contato || coalesce(' · ' || c.telefone, '') || E'\n' ||
      coalesce('*Paciente:* ' || v_pac || E'\n', '') ||
      '*Sinal detectado:* "' || v_sinal || '"' || E'\n' ||
      '*Mensagem:* "' || v_trecho || '"' || E'\n\n' ||
      'A família *NÃO* recebeu orientação automática.' || E'\n' ||
      '*Ação necessária:* verificar a conversa imediatamente.' ||
      coalesce(E'\n' || 'https://wa.me/' || nullif(ltrim(c.telefone, '+'), ''), ''));
END;
$$;
