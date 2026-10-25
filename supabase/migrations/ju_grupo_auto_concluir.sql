-- Grupo 🔔 Notificações sem mensagem velha (decisão do dono, 25/10/2026):
-- 1) o pedido fecha sozinho quando o assunto é resolvido no app e o card some do grupo:
--    agendamento/remarcação -> consulta lançada ou alterada; cancelamento -> consulta cancelada;
--    financeiro -> link de pagamento ou fatura gerada. O botão Concluído continua para o resto.
--    O aviso "📅 lançar consulta" também some quando a consulta é lançada (ou a sugestão descartada).
-- 2) o detector de "consulta combinada e não lançada" ignora conversas da equipe e do dono.
-- 3) o resumo "Esperando resposta" novo apaga o anterior.
-- A remoção no WhatsApp é feita pelo n8n "RK Ju - Tarefas" (lista "apagar" do fn_ju_tarefas).

ALTER TABLE public.ju_avisos_grupo
  ADD COLUMN IF NOT EXISTS msg_id text,
  ADD COLUMN IF NOT EXISTS apagado_em timestamptz;

ALTER TABLE public.ju_config ADD COLUMN IF NOT EXISTS resumo_msg_id text;

CREATE TABLE IF NOT EXISTS public.ju_grupo_apagar (
  id          bigserial PRIMARY KEY,
  msg_id      text NOT NULL,
  wa_chatid   text,          -- conversa da família (para tirar a etiqueta)
  etiqueta    text,
  origem      text,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  enviado_em  timestamptz
);
ALTER TABLE public.ju_grupo_apagar ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_grupo_apagar FROM anon, authenticated;

-- id da mensagem do aviso (o n8n grava depois de postar)
CREATE OR REPLACE FUNCTION public.fn_ju_aviso_enviado(p_aviso_id bigint, p_msg_id text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
  UPDATE public.ju_avisos_grupo SET msg_id = nullif(btrim(p_msg_id), '')
   WHERE id = p_aviso_id AND p_aviso_id IS NOT NULL;
$function$;

-- conversas do WhatsApp da família de um paciente (mesma regra de telefone do fn_ju_contexto_cliente)
CREATE OR REPLACE FUNCTION public.fn_ju_conversas_do_paciente(p_paciente_id uuid)
 RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  WITH resp AS (
    SELECT r.telefone::text AS t
      FROM public.pessoa_responsaveis pr JOIN public.pessoas r ON r.id = pr.id_responsavel
     WHERE pr.id_pessoa = p_paciente_id AND pr.ativo AND (pr.data_fim IS NULL OR pr.data_fim >= current_date)
       AND r.telefone IS NOT NULL
    UNION
    SELECT r.telefone::text FROM public.pessoas pac JOIN public.pessoas r ON r.id = pac.responsavel_cobranca_id
     WHERE pac.id = p_paciente_id AND r.telefone IS NOT NULL
  )
  SELECT DISTINCT c.id FROM public.ju_conversas c JOIN resp ON
         c.telefone = '+' || resp.t
      OR (length(resp.t) = 12 AND c.telefone = '+' || substr(resp.t, 1, 4) || '9' || substr(resp.t, 5));
$function$;

-- fecha os pedidos abertos da família e põe o card na fila para sumir do grupo
CREATE OR REPLACE FUNCTION public.fn_ju_auto_concluir(p_paciente_id uuid, p_tipos text[], p_por text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  s record;
  r jsonb;
  n integer := 0;
BEGIN
  FOR s IN
    SELECT so.id FROM public.ju_solicitacoes so
     WHERE so.status = 'ABERTA' AND so.tipo = ANY (p_tipos)
       AND (so.paciente_id IS NULL OR so.paciente_id = p_paciente_id)
       AND so.conversa_id IN (SELECT public.fn_ju_conversas_do_paciente(p_paciente_id))
  LOOP
    r := public.fn_ju_concluir(s.id, NULL, NULL, p_por);
    IF (r ->> 'ok')::boolean AND NOT coalesce((r ->> 'ja_concluido')::boolean, false) THEN
      n := n + 1;
      IF nullif(r ->> 'aviso_msg_id', '') IS NOT NULL THEN
        INSERT INTO public.ju_grupo_apagar (msg_id, wa_chatid, etiqueta, origem)
        VALUES (r ->> 'aviso_msg_id', r ->> 'wa_chatid',
                CASE WHEN (r ->> 'tirar_etiqueta')::boolean THEN r ->> 'etiqueta' END, 'pedido:' || s.id);
      END IF;
    END IF;
  END LOOP;
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_ju_auto_concluir_agendamento()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_novo text;
  v_velho text;
BEGIN
  BEGIN  -- nunca atrapalhar a gravação da consulta
    SELECT codigo INTO v_novo FROM public.consulta_status WHERE id = NEW.status_consulta_id;
    IF TG_OP = 'INSERT' THEN
      IF v_novo IN ('agendado', 'confirmado') THEN
        PERFORM public.fn_ju_auto_concluir(NEW.paciente_id, ARRAY['AGENDAMENTO', 'REMARCACAO'], 'automático: consulta lançada');
      END IF;
      RETURN NEW;
    END IF;

    SELECT codigo INTO v_velho FROM public.consulta_status WHERE id = OLD.status_consulta_id;
    IF v_novo = 'cancelado' AND v_velho IS DISTINCT FROM 'cancelado' THEN
      PERFORM public.fn_ju_auto_concluir(NEW.paciente_id, ARRAY['CANCELAMENTO'], 'automático: consulta cancelada');
    ELSIF v_novo IN ('agendado', 'confirmado')
          AND (NEW.data_hora IS DISTINCT FROM OLD.data_hora OR NEW.profissional_id IS DISTINCT FROM OLD.profissional_id) THEN
      PERFORM public.fn_ju_auto_concluir(NEW.paciente_id, ARRAY['REMARCACAO', 'AGENDAMENTO'], 'automático: consulta remarcada');
    END IF;
    IF (OLD.pagamento_link_id IS NULL AND NEW.pagamento_link_id IS NOT NULL)
       OR (OLD.fatura_id IS NULL AND NEW.fatura_id IS NOT NULL) THEN
      PERFORM public.fn_ju_auto_concluir(NEW.paciente_id, ARRAY['FINANCEIRO'], 'automático: cobrança gerada');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_ju_auto_concluir_agendamento: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ju_auto_concluir ON public.agendamentos;
CREATE TRIGGER trg_ju_auto_concluir
  AFTER INSERT OR UPDATE OF status_consulta_id, data_hora, profissional_id, pagamento_link_id, fatura_id
  ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.trg_ju_auto_concluir_agendamento();

-- aviso "lançar consulta": some quando a sugestão sai de pendente (lançada ou descartada)
CREATE OR REPLACE FUNCTION public.trg_ju_aviso_sugestao_apagar()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pendente' THEN
      WITH a AS (
        UPDATE public.ju_avisos_grupo g SET apagado_em = now()
         WHERE g.origem = 'AGENDA_NAO_LANCADA' AND g.msg_id IS NOT NULL AND g.apagado_em IS NULL
           AND g.botao LIKE '%/agenda/lancar/' || NEW.id::text
        RETURNING g.msg_id)
      INSERT INTO public.ju_grupo_apagar (msg_id, origem) SELECT msg_id, 'sugestao:' || NEW.id FROM a;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_ju_aviso_sugestao_apagar: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ju_aviso_sugestao_apagar ON public.agenda_sugestoes;
CREATE TRIGGER trg_ju_aviso_sugestao_apagar
  AFTER UPDATE OF status ON public.agenda_sugestoes
  FOR EACH ROW EXECUTE FUNCTION public.trg_ju_aviso_sugestao_apagar();

-- fila para o n8n apagar (marca como enviada ao entregar)
CREATE OR REPLACE FUNCTION public.fn_ju_grupo_apagar_pendentes()
 RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$
  WITH a AS (
    UPDATE public.ju_grupo_apagar g SET enviado_em = now()
     WHERE g.id IN (SELECT id FROM public.ju_grupo_apagar WHERE enviado_em IS NULL ORDER BY id LIMIT 20)
    RETURNING g.msg_id, g.wa_chatid, g.etiqueta)
  SELECT coalesce(jsonb_agg(jsonb_build_object('msg_id', msg_id, 'wa_chatid', wa_chatid, 'etiqueta', etiqueta)), '[]'::jsonb) FROM a;
$function$;

-- resumo novo apaga o anterior: guarda o id novo e devolve o antigo
CREATE OR REPLACE FUNCTION public.fn_ju_resumo_postado(p_msg_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_ant text;
BEGIN
  SELECT resumo_msg_id INTO v_ant FROM public.ju_config WHERE id = 1;
  UPDATE public.ju_config SET resumo_msg_id = nullif(btrim(p_msg_id), '') WHERE id = 1;
  RETURN jsonb_build_object('anterior', v_ant);
END;
$function$;

-- fn_ju_tarefas devolve também a lista "apagar"; o disparo considera essa lista
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_tarefas()'::regprocedure); n text;
BEGIN
  IF d NOT LIKE '%''apagar''%' THEN
    n := regexp_replace(d, $re$RETURN jsonb_build_object\('retomar', v_retomar, 'lembretes', v_lembretes, $re$,
                           $rp$RETURN jsonb_build_object('retomar', v_retomar, 'lembretes', v_lembretes, 'apagar', public.fn_ju_grupo_apagar_pendentes(), $rp$);
    IF n = d THEN RAISE EXCEPTION 'fn_ju_tarefas: RETURN não encontrado'; END IF;
    EXECUTE n;
  END IF;

  d := pg_get_functiondef('public.fn_ju_tarefas_disparar()'::regprocedure);
  IF d NOT LIKE '%''apagar''%' THEN
    n := replace(d, $a$AND jsonb_array_length(t -> 'notas') = 0 THEN$a$,
                    $a$AND jsonb_array_length(t -> 'notas') = 0
     AND jsonb_array_length(coalesce(t -> 'apagar', '[]'::jsonb)) = 0 THEN$a$);
    IF n = d THEN RAISE EXCEPTION 'fn_ju_tarefas_disparar: condição não encontrada'; END IF;
    EXECUTE n;
  END IF;

  -- detector: sem conversas da equipe e do dono
  d := pg_get_functiondef('public.fn_agenda_confirmacoes_verificar()'::regprocedure);
  IF d NOT LIKE '%fn_ju_eh_equipe%' THEN
    n := replace(d, $a$AND NOT EXISTS (SELECT 1 FROM public.ju_conversas t WHERE t.id = m.conversa_id AND t.telefone ~ '^\+?5561999000'))$a$,
                    $a$AND NOT EXISTS (SELECT 1 FROM public.ju_conversas t WHERE t.id = m.conversa_id AND t.telefone ~ '^\+?5561999000')
        AND NOT EXISTS (SELECT 1 FROM public.ju_conversas t WHERE t.id = m.conversa_id
                         AND (public.fn_ju_eh_equipe(t.telefone) OR t.telefone = '+5561981446666')))$a$);
    IF n = d THEN RAISE EXCEPTION 'fn_agenda_confirmacoes_verificar: filtro não encontrado'; END IF;
    EXECUTE n;
  END IF;
END
$mig$;

REVOKE ALL ON FUNCTION public.fn_ju_aviso_enviado(bigint, text), public.fn_ju_conversas_do_paciente(uuid),
  public.fn_ju_auto_concluir(uuid, text[], text), public.fn_ju_grupo_apagar_pendentes(), public.fn_ju_resumo_postado(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_aviso_enviado(bigint, text), public.fn_ju_resumo_postado(text) TO service_role;
