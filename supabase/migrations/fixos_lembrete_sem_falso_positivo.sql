-- 13/11/2026 (aprovado pelo dono). O lembrete de sexta/segunda dos Pacientes Fixos mandou link para quem não precisava:
-- 1) quem vem de 15 em 15 dias e já tinha a próxima marcada (Bernardo 24/11, Sofia 26/11, Maria Eduarda 23/11...);
-- 2) quem já tinha sessão na semana em outro serviço (Clarice, respiratória no dia 17: a conta só via motora);
-- 3) quem só fez a avaliação e ainda não é fixo de fato (Manuela).
-- Agora pula: qualquer sessão marcada (qualquer serviço) da semana do lembrete até 3 semanas depois; e quem tem
-- menos de 2 sessões de motora no passado. Criança que fez respiratória no meio da motora continua recebendo (dono).
-- Mesmo dia, fora do banco: no n8n "RK Ju - Atendimento" (GVt40fBa2M0BmTnj) a trava de SAMU dos nós "Liberar envio"
-- e "Dividir mensagens" virou /\bSAMU\b|.../i — "Samuel" casava com /SAMU/i e trocava a resposta da Ju pela frase de
-- emergência (caso da mãe do Samuel, 13/11).
DO $mig$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.fn_fixos_lembrete_automatico(text,boolean)'::regprocedure);
  v_new := replace(v_def,
$s$      v_pulos := v_pulos || jsonb_build_object('paciente', p ->> 'paciente_nome', 'motivo', 'pedido de cancelamento aberto'); CONTINUE;
    END IF;
$s$,
$s$      v_pulos := v_pulos || jsonb_build_object('paciente', p ->> 'paciente_nome', 'motivo', 'pedido de cancelamento aberto'); CONTINUE;
    END IF;
    -- 13/11/2026: já tem sessão marcada (qualquer serviço) da semana do lembrete até 3 semanas depois
    IF EXISTS (SELECT 1 FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
                WHERE a.paciente_id = (p ->> 'paciente_id')::uuid AND a.ativo
                  AND cs.codigo NOT IN ('cancelado', 'erro', 'reagendado')
                  AND (a.data_hora AT TIME ZONE 'UTC')::date BETWEEN v_sem AND v_sem + 20) THEN
      v_pulos := v_pulos || jsonb_build_object('paciente', p ->> 'paciente_nome', 'motivo', 'já tem sessão marcada nas próximas semanas'); CONTINUE;
    END IF;
    -- 13/11/2026: só fez a avaliação (menos de 2 sessões de motora no passado): ainda não é fixo de fato
    IF (SELECT count(*) FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
          JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
         WHERE a.paciente_id = (p ->> 'paciente_id')::uuid AND a.ativo
           AND cs.codigo NOT IN ('cancelado', 'erro', 'reagendado') AND ts.nome ~* 'motor'
           AND (a.data_hora AT TIME ZONE 'UTC') < (now() AT TIME ZONE 'America/Sao_Paulo')) < 2 THEN
      v_pulos := v_pulos || jsonb_build_object('paciente', p ->> 'paciente_nome', 'motivo', 'só fez a avaliação'); CONTINUE;
    END IF;
$s$);
  IF v_new = v_def THEN RAISE EXCEPTION 'fn_fixos_lembrete_automatico: trecho não encontrado'; END IF;
  EXECUTE v_new;
END $mig$;
