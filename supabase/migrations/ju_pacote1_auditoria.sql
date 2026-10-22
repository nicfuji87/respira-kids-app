-- =====================================================================
-- Ju: pacote 1 da auditoria (21/10/2026)
-- =====================================================================
-- AI dev note:
-- 1. Tipo EXTERNO: contato que não é família de paciente (currículo, vaga,
--    fornecedor, vendedor, parceria, assunto pessoal de alguém da equipe).
--    Vai para o grupo como baixa prioridade, etiqueta 22, sem lembretes.
-- 2. "urgente" só vale para CLINICO (alerta e episódio grave recente); a IA não
--    consegue marcar outro tipo como urgente.
-- 3. Turno passa a dizer, de forma objetiva, quem conduz a conversa:
--    lolo_conduzindo = a Lolô escreveu nas últimas 3 h e depois da última fala
--    da Ju; ultimo_autor = quem falou por último do lado da clínica (JU, LOLO,
--    AUTOMACAO); alerta_recente = último alerta clínico urgente nas 24 h (para
--    não repetir o alerta do mesmo episódio).
-- =====================================================================

ALTER TABLE public.ju_solicitacoes DROP CONSTRAINT ju_solicitacoes_tipo_check;
ALTER TABLE public.ju_solicitacoes ADD CONSTRAINT ju_solicitacoes_tipo_check CHECK (tipo = ANY (ARRAY[
  'AGENDAMENTO','REMARCACAO','CANCELAMENTO','FINANCEIRO','CONTRATO','NOTA_FISCAL',
  'CLINICO','RECLAMACAO','HUMANO','OUTRO','EXTERNO']));

DO $do$
DECLARE d text; n text;
BEGIN
  -- fn_ju_chamar_secretaria: EXTERNO + urgente só em CLINICO
  d := pg_get_functiondef('public.fn_ju_chamar_secretaria'::regproc);
  n := replace(d, $a$'NOTA_FISCAL','CLINICO','RECLAMACAO','HUMANO','OUTRO')$a$,
                  $b$'NOTA_FISCAL','CLINICO','RECLAMACAO','HUMANO','OUTRO','EXTERNO')$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_chamar_secretaria: lista de tipos não encontrada'; END IF;
  d := n;
  n := replace(d, $a$WHEN 'HUMANO' THEN 'Pediu atendente' ELSE 'Outro' END$a$,
                  $b$WHEN 'HUMANO' THEN 'Pediu atendente' WHEN 'EXTERNO' THEN 'Contato externo (baixa prioridade)' ELSE 'Outro' END$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_chamar_secretaria: assunto não encontrado'; END IF;
  d := n;
  n := replace(d, $a$  v_etiqueta := CASE WHEN p_urgente THEN '27'$a$,
                  $b$  IF v_tipo <> 'CLINICO' THEN p_urgente := false; END IF;
  v_etiqueta := CASE WHEN p_urgente THEN '27'$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_chamar_secretaria: etiqueta não encontrada'; END IF;
  EXECUTE n;

  -- fn_ju_tarefas: EXTERNO não gera lembrete
  d := pg_get_functiondef('public.fn_ju_tarefas'::regproc);
  n := replace(d, $a$WHERE s.status = 'ABERTA' AND s.lembretes < 2$a$,
                  $b$WHERE s.status = 'ABERTA' AND s.lembretes < 2 AND s.tipo <> 'EXTERNO'$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_tarefas: filtro dos lembretes não encontrado'; END IF;
  EXECUTE n;

  -- fn_ju_turno: quem conduz a conversa
  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  n := replace(d, $a$'pode', true,$a$, $b$'pode', true,
    'lolo_conduzindo', EXISTS (
       SELECT 1 FROM public.ju_mensagens h
        WHERE h.conversa_id = c.id AND h.origem = 'HUMANO'
          AND h.created_at > now() - interval '3 hours'
          AND h.created_at > coalesce((SELECT max(j.created_at) FROM public.ju_mensagens j
                                        WHERE j.conversa_id = c.id AND j.origem = 'JU'), '-infinity'::timestamptz)),
    'ultimo_autor', (SELECT CASE u.origem WHEN 'HUMANO' THEN 'LOLO' ELSE u.origem END
                       FROM public.ju_mensagens u
                      WHERE u.conversa_id = c.id AND u.origem <> 'CLIENTE'
                      ORDER BY u.created_at DESC LIMIT 1),
    'alerta_recente', (SELECT to_char(max(s.created_at) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
                         FROM public.ju_solicitacoes s
                        WHERE s.conversa_id = c.id AND s.tipo = 'CLINICO' AND s.urgente
                          AND s.created_at > now() - interval '24 hours'),$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: retorno não encontrado'; END IF;
  EXECUTE n;
END
$do$;
