-- 09/11/2026 — Rotina da recepção (pedido do dono): a secretária vê no app o que fazer hoje, por bloco do dia,
-- mais a tarefa da semana e as do mês que estão vencendo, e as metas dela com a cota de hoje e o horário de fazer.
-- Nada vai para o WhatsApp (decisão do dono: já há mensagens demais para acompanhar).
--
-- rotina_tarefas: o cadastro (admin edita pela tela). rotina_execucoes: quem marcou e quando (uma linha por ocorrência).
-- Ocorrência: diária = cada dia útil; semanal = o dia da semana (se for feriado, o próximo útil da mesma semana);
-- mensal = dia_mes (próximo útil) até dia_mes_prazo (útil anterior, nunca antes do início); dia_mes 0 = último dia útil.
-- Semanal e mensal não feitas continuam aparecendo (em vermelho) até serem feitas ou até a próxima ocorrência começar.
-- Diária não feita não vai para o dia seguinte: conta como perdida no acompanhamento do admin.
-- Tarefas "auto" o sistema marca sozinho (cron rotina-auto) quando o número fica certo; a secretária não marca à mão.
-- Dias úteis: seg–sex fora de followup_feriados.

CREATE TABLE IF NOT EXISTS public.rotina_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  detalhe text,
  bloco text NOT NULL CHECK (bloco IN ('abertura', 'manha', 'almoco', 'tarde', 'fechamento')),
  frequencia text NOT NULL CHECK (frequencia IN ('diaria', 'semanal', 'mensal')),
  dia_semana smallint CHECK (dia_semana BETWEEN 1 AND 5),
  dia_mes smallint CHECK (dia_mes BETWEEN 0 AND 28),
  dia_mes_prazo smallint CHECK (dia_mes_prazo BETWEEN 1 AND 28),
  horario time,
  indicador text CHECK (indicador IN ('sessoes_sem_status_ontem', 'sessoes_sem_status_hoje', 'resumo_whatsapp',
                                      'conferencia_agenda', 'meta_contatos', 'meta_convites')),
  auto boolean NOT NULL DEFAULT false,
  link text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES public.pessoas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rotina_tarefas_freq_ck CHECK (
    (frequencia = 'diaria') OR
    (frequencia = 'semanal' AND dia_semana IS NOT NULL) OR
    (frequencia = 'mensal' AND dia_mes IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.rotina_execucoes (
  id bigserial PRIMARY KEY,
  tarefa_id uuid NOT NULL REFERENCES public.rotina_tarefas(id) ON DELETE CASCADE,
  data_ref date NOT NULL,
  feito_em timestamptz NOT NULL DEFAULT now(),
  feito_por uuid REFERENCES public.pessoas(id),
  automatico boolean NOT NULL DEFAULT false,
  observacao text,
  UNIQUE (tarefa_id, data_ref)
);

ALTER TABLE public.rotina_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rotina_execucoes ENABLE ROW LEVEL SECURITY;
-- Sem policies de propósito: tudo passa pelas funções abaixo (SECURITY DEFINER, com checagem de papel).
REVOKE ALL ON public.rotina_tarefas, public.rotina_execucoes FROM anon, authenticated;

-- ---------- dias úteis ----------
CREATE OR REPLACE FUNCTION public.fn_rotina_dia_util(d date)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT extract(isodow FROM d) < 6 AND NOT EXISTS (SELECT 1 FROM public.followup_feriados f WHERE f.dia = d);
$$;

CREATE OR REPLACE FUNCTION public.fn_rotina_util_proximo(d date)
RETURNS date LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE x date := d;
BEGIN
  WHILE NOT public.fn_rotina_dia_util(x) LOOP x := x + 1; END LOOP;
  RETURN x;
END $$;

CREATE OR REPLACE FUNCTION public.fn_rotina_util_anterior(d date)
RETURNS date LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE x date := d;
BEGIN
  WHILE NOT public.fn_rotina_dia_util(x) LOOP x := x - 1; END LOOP;
  RETURN x;
END $$;

CREATE OR REPLACE FUNCTION public.fn_rotina_uteis_entre(p_ini date, p_fim date)
RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT count(*)::int FROM generate_series(p_ini, p_fim, interval '1 day') g(d) WHERE public.fn_rotina_dia_util(g.d::date);
$$;

-- ---------- ocorrência da tarefa em vigor no dia p_dia (a mais recente que já começou) ----------
CREATE OR REPLACE FUNCTION public.fn_rotina_ocorrencia(t public.rotina_tarefas, p_dia date, OUT inicio date, OUT prazo date)
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_seg date; v_c date; v_mes date; v_ult date; i int;
BEGIN
  IF t.frequencia = 'diaria' THEN
    IF public.fn_rotina_dia_util(p_dia) THEN inicio := p_dia; prazo := p_dia; END IF;
    RETURN;
  END IF;

  IF t.frequencia = 'semanal' THEN
    v_seg := p_dia - (extract(isodow FROM p_dia)::int - 1);
    FOR i IN 0..1 LOOP                       -- esta semana; se ainda não começou, a anterior
      -- feriado: o próximo útil da mesma semana; se não houver, o útil anterior da mesma semana
      v_c := v_seg - 7 * i + (t.dia_semana - 1);
      WHILE NOT public.fn_rotina_dia_util(v_c) AND extract(isodow FROM v_c) < 5 LOOP v_c := v_c + 1; END LOOP;
      WHILE NOT public.fn_rotina_dia_util(v_c) AND v_c > v_seg - 7 * i LOOP v_c := v_c - 1; END LOOP;
      IF public.fn_rotina_dia_util(v_c) AND v_c <= p_dia THEN inicio := v_c; prazo := v_c; RETURN; END IF;
    END LOOP;
    RETURN;
  END IF;

  -- mensal
  FOR i IN 0..1 LOOP
    v_mes := (date_trunc('month', p_dia) - make_interval(months => i))::date;
    v_ult := (v_mes + interval '1 month' - interval '1 day')::date;
    IF t.dia_mes = 0 THEN
      v_c := public.fn_rotina_util_anterior(v_ult);
      IF v_c <= p_dia THEN inicio := v_c; prazo := v_c; RETURN; END IF;
    ELSE
      v_c := public.fn_rotina_util_proximo(v_mes + (t.dia_mes - 1));
      IF v_c <= p_dia THEN
        inicio := v_c;
        prazo := greatest(v_c, public.fn_rotina_util_anterior(v_mes + (coalesce(t.dia_mes_prazo, t.dia_mes) - 1)));
        RETURN;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ---------- quem está chamando ----------
CREATE OR REPLACE FUNCTION public.fn_rotina_quem(OUT pessoa_id uuid, OUT papel text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id, role FROM public.pessoas WHERE auth_user_id = auth.uid() AND ativo AND role IN ('admin', 'secretaria') LIMIT 1;
$$;

-- Secretária das metas: quem chama, se for secretária; senão a secretária com metas no mês.
CREATE OR REPLACE FUNCTION public.fn_rotina_secretaria(p_dia date)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    (SELECT q.pessoa_id FROM public.fn_rotina_quem() q WHERE q.papel = 'secretaria'),
    (SELECT m.pessoa_id FROM public.metas m JOIN public.pessoas p ON p.id = m.pessoa_id
      WHERE p.role = 'secretaria' AND p.ativo AND p_dia BETWEEN m.periodo_inicio AND m.periodo_fim
      GROUP BY m.pessoa_id ORDER BY count(*) DESC LIMIT 1));
$$;

-- ---------- metas da secretária, com a cota de hoje ----------
CREATE OR REPLACE FUNCTION public.fn_rotina_metas(p_pessoa uuid, p_dia date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_out jsonb := '[]'; v_ontem numeric; v_hoje numeric; v_rest int; v_total int; v_passados int;
        v_cota int; v_esperado numeric; v_quando text; v_ind text;
BEGIN
  IF p_pessoa IS NULL THEN RETURN v_out; END IF;
  FOR r IN
    SELECT v.*, m.status AS m_status FROM public.vw_metas_dashboard v JOIN public.metas m ON m.id = v.id
     WHERE v.pessoa_id = p_pessoa AND p_dia BETWEEN v.periodo_inicio AND v.periodo_fim AND m.status = 'ativa'
       AND v.tipo_meta_codigo IN ('contatos_inatividade', 'pacientes_reativados', 'pesquisa_convites', 'pesquisa_respostas')
     ORDER BY CASE v.tipo_meta_codigo WHEN 'contatos_inatividade' THEN 1 WHEN 'pacientes_reativados' THEN 2
                                      WHEN 'pesquisa_convites' THEN 3 ELSE 4 END
  LOOP
    v_total := public.fn_rotina_uteis_entre(r.periodo_inicio, r.periodo_fim);
    v_rest := public.fn_rotina_uteis_entre(p_dia, r.periodo_fim);
    v_passados := public.fn_rotina_uteis_entre(r.periodo_inicio, p_dia - 1);
    v_ontem := NULL; v_hoje := NULL; v_cota := NULL; v_quando := NULL;

    IF r.tipo_meta_codigo IN ('contatos_inatividade', 'pesquisa_convites') THEN
      IF r.tipo_meta_codigo = 'contatos_inatividade' THEN
        v_ontem := public.fn_calcular_contatos_inatividade(p_pessoa, r.periodo_inicio, p_dia - 1);
        v_hoje := public.fn_calcular_contatos_inatividade(p_pessoa, p_dia, p_dia);
        v_ind := 'meta_contatos';
      ELSE
        v_ontem := public.fn_calcular_pesquisa_convites(p_pessoa, r.periodo_inicio, p_dia - 1);
        v_hoje := public.fn_calcular_pesquisa_convites(p_pessoa, p_dia, p_dia);
        v_ind := 'meta_convites';
      END IF;
      v_cota := CASE WHEN v_rest > 0 THEN ceil(greatest(0, r.valor_meta - v_ontem) / v_rest)::int ELSE 0 END;
      SELECT 'Todo dia útil, ' || to_char(t.horario, 'HH24"h"MI') || ' (' || t.titulo || ')' INTO v_quando
        FROM public.rotina_tarefas t WHERE t.ativo AND t.indicador = v_ind ORDER BY t.ordem LIMIT 1;
    ELSIF r.tipo_meta_codigo = 'pacientes_reativados' THEN
      v_quando := 'É o resultado dos contatos: conta quando a família contatada faz uma sessão (que fatura) em até 30 dias.';
    ELSE
      v_quando := 'Depende das famílias. Quanto mais convites no mês, mais respostas.';
    END IF;

    v_esperado := CASE WHEN v_total > 0 THEN r.valor_meta * v_passados / v_total ELSE 0 END;
    v_out := v_out || jsonb_build_object(
      'id', r.id, 'codigo', r.tipo_meta_codigo, 'titulo', r.titulo, 'unidade', r.unidade_medida,
      'valor_meta', r.valor_meta,
      'valor_atual', coalesce(v_ontem + v_hoje, r.valor_atual),
      'hoje', v_hoje, 'cota_hoje', v_cota,
      'dias_uteis_restantes', v_rest,
      'esperado_ate_hoje', round(v_esperado),
      'no_ritmo', coalesce(v_ontem, r.valor_atual) >= floor(v_esperado * 0.9),
      'niveis', r.niveis, 'nivel_atingido', r.nivel_atingido, 'bonus_nivel', r.bonus_nivel,
      'requisito_titulo', r.requisito_titulo, 'requisito_ok', r.requisito_ok,
      'periodo_fim', r.periodo_fim, 'quando', v_quando);
  END LOOP;
  RETURN v_out;
END $$;

-- ---------- indicador ao vivo de uma tarefa ----------
CREATE OR REPLACE FUNCTION public.fn_rotina_indicador(p_codigo text, p_dia date, p_pessoa uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo'; n int; v_m jsonb; v_cod text;
BEGIN
  IF p_codigo = 'sessoes_sem_status_ontem' THEN
    SELECT count(*) INTO n FROM public.agendamentos a JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
     WHERE a.ativo AND cs.codigo IN ('agendado', 'confirmado')
       AND (a.data_hora AT TIME ZONE 'UTC')::date BETWEEN p_dia - 14 AND p_dia - 1;
    RETURN jsonb_build_object('valor', n, 'ok', n = 0,
      'texto', CASE WHEN n = 0 THEN 'Tudo certo nos últimos 14 dias.'
                    ELSE n || CASE WHEN n = 1 THEN ' sessão passada ainda está' ELSE ' sessões passadas ainda estão' END
                         || ' como agendada ou confirmada.' END);
  END IF;

  IF p_codigo = 'sessoes_sem_status_hoje' THEN
    SELECT count(*) INTO n FROM public.agendamentos a JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
     WHERE a.ativo AND cs.codigo IN ('agendado', 'confirmado')
       AND (a.data_hora AT TIME ZONE 'UTC')::date = p_dia
       AND (a.data_hora AT TIME ZONE 'UTC') + make_interval(mins => coalesce(a.duracao_minutos, 60)) <= v_agora;
    RETURN jsonb_build_object('valor', n,
      'ok', n = 0 AND (p_dia < v_agora::date OR v_agora::time >= time '17:30'),
      'texto', CASE WHEN n = 0 THEN 'Nenhuma sessão de hoje que já terminou está sem status.'
                    ELSE n || CASE WHEN n = 1 THEN ' sessão de hoje já terminou e está' ELSE ' sessões de hoje já terminaram e estão' END
                         || ' sem status.' END);
  END IF;

  IF p_codigo = 'resumo_whatsapp' THEN
    WITH ult AS (SELECT max(ultima_vez) m FROM public.ju_resumo_itens)
    SELECT count(*) INTO n FROM public.ju_resumo_itens r, ult
     WHERE ult.m > now() - interval '3 hours' AND r.ultima_vez >= ult.m - interval '15 minutes'
       AND NOT EXISTS (SELECT 1 FROM public.ju_mensagens jm WHERE jm.conversa_id = r.conversa_id
                        AND jm.origem = 'HUMANO' AND jm.created_at > r.ultima_vez)
       AND NOT EXISTS (SELECT 1 FROM public.ju_conversas c WHERE c.id = r.conversa_id AND c.resumo_dispensado_em > r.ultima_vez);
    RETURN jsonb_build_object('valor', n, 'ok', NULL,
      'texto', CASE WHEN n = 0 THEN 'Ninguém do último resumo está sem resposta.'
                    ELSE n || CASE WHEN n = 1 THEN ' família do último resumo ainda está' ELSE ' famílias do último resumo ainda estão' END
                         || ' sem resposta.' END);
  END IF;

  IF p_codigo = 'conferencia_agenda' THEN
    SELECT count(*) INTO n FROM public.conferencia_agenda_itens WHERE status = 'aberto' AND data < p_dia;
    RETURN jsonb_build_object('valor', n, 'ok', NULL,
      'texto', CASE WHEN n = 0 THEN 'Nada aberto na Conferência.'
                    ELSE n || CASE WHEN n = 1 THEN ' item aberto' ELSE ' itens abertos' END || ' na Conferência.' END);
  END IF;

  IF p_codigo IN ('meta_contatos', 'meta_convites') THEN
    v_cod := CASE p_codigo WHEN 'meta_contatos' THEN 'contatos_inatividade' ELSE 'pesquisa_convites' END;
    SELECT e INTO v_m FROM jsonb_array_elements(public.fn_rotina_metas(p_pessoa, p_dia)) e WHERE e ->> 'codigo' = v_cod LIMIT 1;
    IF v_m IS NULL THEN
      RETURN jsonb_build_object('valor', NULL, 'ok', NULL, 'texto', 'Sem meta cadastrada neste mês.');
    END IF;
    RETURN jsonb_build_object('valor', (v_m ->> 'hoje')::numeric, 'cota', (v_m ->> 'cota_hoje')::int,
      'ok', (v_m ->> 'hoje')::numeric >= (v_m ->> 'cota_hoje')::int,
      'texto', CASE WHEN (v_m ->> 'cota_hoje')::int = 0 THEN 'Meta do mês já batida.'
                    ELSE 'Hoje: ' || (v_m ->> 'hoje') || ' de ' || (v_m ->> 'cota_hoje') || '.' END);
  END IF;

  RETURN NULL;
END $$;

-- ---------- a tela do dia ----------
CREATE OR REPLACE FUNCTION public.fn_rotina_dia(p_dia date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  q record; v_dia date := coalesce(p_dia, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_sec uuid; t public.rotina_tarefas; oc record; e record; v_ind jsonb; v_lista jsonb := '[]'; v_feito boolean;
BEGIN
  SELECT * INTO q FROM public.fn_rotina_quem();
  IF q.pessoa_id IS NULL AND session_user NOT IN ('postgres', 'supabase_admin') THEN RAISE EXCEPTION 'sem permissão'; END IF;
  v_sec := public.fn_rotina_secretaria(v_dia);

  FOR t IN SELECT * FROM public.rotina_tarefas WHERE ativo ORDER BY ordem, titulo LOOP
    SELECT * INTO oc FROM public.fn_rotina_ocorrencia(t, v_dia);
    CONTINUE WHEN oc.inicio IS NULL;
    CONTINUE WHEN oc.prazo < (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date;
    SELECT x.feito_em, x.automatico, x.observacao, p.nome AS por INTO e
      FROM public.rotina_execucoes x LEFT JOIN public.pessoas p ON p.id = x.feito_por
     WHERE x.tarefa_id = t.id AND x.data_ref = oc.inicio;
    v_feito := e.feito_em IS NOT NULL;
    CONTINUE WHEN v_feito AND NOT (v_dia BETWEEN oc.inicio AND oc.prazo);
    v_ind := CASE WHEN t.indicador IS NOT NULL AND NOT v_feito THEN public.fn_rotina_indicador(t.indicador, v_dia, v_sec) END;
    v_lista := v_lista || jsonb_build_object(
      'id', t.id, 'titulo', t.titulo, 'detalhe', t.detalhe, 'bloco', t.bloco, 'frequencia', t.frequencia,
      'horario', to_char(t.horario, 'HH24:MI'), 'link', t.link, 'indicador', t.indicador, 'auto', t.auto,
      'data_ref', oc.inicio, 'prazo', oc.prazo, 'atrasada', NOT v_feito AND v_dia > oc.prazo,
      'feito', v_feito, 'feito_em', e.feito_em, 'feito_por', CASE WHEN e.automatico THEN 'Sistema' ELSE split_part(e.por, ' ', 1) END,
      'observacao', e.observacao, 'indicador_valor', v_ind);
  END LOOP;

  RETURN jsonb_build_object(
    'dia', v_dia, 'dia_util', public.fn_rotina_dia_util(v_dia),
    'agora', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'eh_admin', q.papel = 'admin',
    'secretaria', (SELECT jsonb_build_object('id', id, 'nome', nome) FROM public.pessoas WHERE id = v_sec),
    'tarefas', v_lista,
    'metas', public.fn_rotina_metas(v_sec, v_dia));
END $$;

-- ---------- marcar / desmarcar ----------
CREATE OR REPLACE FUNCTION public.fn_rotina_marcar(p_tarefa uuid, p_data_ref date, p_feito boolean, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q record; t public.rotina_tarefas; x public.rotina_execucoes; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO q FROM public.fn_rotina_quem();
  IF q.pessoa_id IS NULL THEN RAISE EXCEPTION 'sem permissão'; END IF;
  SELECT * INTO t FROM public.rotina_tarefas WHERE id = p_tarefa;
  IF NOT FOUND THEN RAISE EXCEPTION 'tarefa não encontrada'; END IF;
  IF t.auto THEN RAISE EXCEPTION 'Essa tarefa o sistema marca sozinho quando o número fica certo.'; END IF;
  IF p_data_ref > v_hoje THEN RAISE EXCEPTION 'ocorrência futura'; END IF;

  IF p_feito THEN
    INSERT INTO public.rotina_execucoes (tarefa_id, data_ref, feito_por, observacao)
    VALUES (p_tarefa, p_data_ref, q.pessoa_id, nullif(btrim(p_observacao), ''))
    ON CONFLICT (tarefa_id, data_ref) DO UPDATE SET observacao = coalesce(EXCLUDED.observacao, rotina_execucoes.observacao);
  ELSE
    SELECT * INTO x FROM public.rotina_execucoes WHERE tarefa_id = p_tarefa AND data_ref = p_data_ref;
    IF FOUND THEN
      IF q.papel <> 'admin' AND ((x.feito_em AT TIME ZONE 'America/Sao_Paulo')::date <> v_hoje OR x.feito_por IS DISTINCT FROM q.pessoa_id) THEN
        RAISE EXCEPTION 'Só dá para desmarcar no mesmo dia o que você marcou.';
      END IF;
      DELETE FROM public.rotina_execucoes WHERE id = x.id;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ---------- cron: marca sozinho as tarefas automáticas ----------
CREATE OR REPLACE FUNCTION public.fn_rotina_auto_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_dia date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; v_sec uuid; t public.rotina_tarefas; oc record; n int := 0; v_ind jsonb;
BEGIN
  IF NOT public.fn_rotina_dia_util(v_dia) THEN RETURN 0; END IF;
  v_sec := public.fn_rotina_secretaria(v_dia);
  FOR t IN SELECT * FROM public.rotina_tarefas WHERE ativo AND auto AND indicador IS NOT NULL LOOP
    SELECT * INTO oc FROM public.fn_rotina_ocorrencia(t, v_dia);
    CONTINUE WHEN oc.inicio IS NULL;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.rotina_execucoes WHERE tarefa_id = t.id AND data_ref = oc.inicio);
    v_ind := public.fn_rotina_indicador(t.indicador, v_dia, v_sec);
    IF (v_ind ->> 'ok')::boolean IS TRUE THEN
      INSERT INTO public.rotina_execucoes (tarefa_id, data_ref, automatico, observacao)
      VALUES (t.id, oc.inicio, true, v_ind ->> 'texto') ON CONFLICT DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

-- ---------- acompanhamento do admin ----------
CREATE OR REPLACE FUNCTION public.fn_rotina_historico(p_inicio date, p_fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q record; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO q FROM public.fn_rotina_quem();
  IF coalesce(q.papel, '') <> 'admin' AND session_user NOT IN ('postgres', 'supabase_admin') THEN RAISE EXCEPTION 'sem permissão'; END IF;

  RETURN (
    WITH dias AS (
      SELECT g.d::date AS dia FROM generate_series(p_inicio, least(p_fim, v_hoje), interval '1 day') g(d)
    ), occ AS (
      -- cada ocorrência conta no dia do prazo
      SELECT t.id, t.titulo, t.bloco, t.frequencia, d.dia, o.inicio, o.prazo
        FROM public.rotina_tarefas t CROSS JOIN dias d
        CROSS JOIN LATERAL public.fn_rotina_ocorrencia(t, d.dia) o
       WHERE t.ativo AND o.prazo = d.dia AND o.prazo >= (t.created_at AT TIME ZONE 'America/Sao_Paulo')::date
    ), st AS (
      SELECT occ.*, x.feito_em, x.automatico,
             CASE WHEN x.feito_em IS NULL THEN CASE WHEN occ.dia = v_hoje THEN 'pendente' ELSE 'nao_feita' END
                  WHEN (x.feito_em AT TIME ZONE 'America/Sao_Paulo')::date <= occ.prazo THEN 'no_prazo'
                  ELSE 'atrasada' END AS situacao
        FROM occ LEFT JOIN public.rotina_execucoes x ON x.tarefa_id = occ.id AND x.data_ref = occ.inicio
    )
    SELECT jsonb_build_object(
      'inicio', p_inicio, 'fim', p_fim,
      'dias', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', dia, 'total', total, 'no_prazo', no_prazo,
                          'atrasadas', atrasadas, 'nao_feitas', nao_feitas, 'pendentes', pendentes) ORDER BY dia DESC)
                        FROM (SELECT dia, count(*) total,
                                     count(*) FILTER (WHERE situacao = 'no_prazo') no_prazo,
                                     count(*) FILTER (WHERE situacao = 'atrasada') atrasadas,
                                     count(*) FILTER (WHERE situacao = 'nao_feita') nao_feitas,
                                     count(*) FILTER (WHERE situacao = 'pendente') pendentes
                                FROM st GROUP BY dia) z), '[]'),
      'tarefas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'titulo', titulo, 'bloco', bloco, 'frequencia', frequencia,
                          'total', total, 'nao_feitas', nao_feitas, 'atrasadas', atrasadas) ORDER BY nao_feitas DESC, atrasadas DESC, titulo)
                        FROM (SELECT id, titulo, bloco, frequencia, count(*) FILTER (WHERE situacao <> 'pendente') total,
                                     count(*) FILTER (WHERE situacao = 'nao_feita') nao_feitas,
                                     count(*) FILTER (WHERE situacao = 'atrasada') atrasadas
                                FROM st GROUP BY id, titulo, bloco, frequencia) z WHERE total > 0), '[]'))
  );
END $$;

-- ---------- cadastro das tarefas (admin) ----------
CREATE OR REPLACE FUNCTION public.fn_rotina_tarefas_listar()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q record;
BEGIN
  SELECT * INTO q FROM public.fn_rotina_quem();
  IF q.pessoa_id IS NULL THEN RAISE EXCEPTION 'sem permissão'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'titulo', titulo, 'detalhe', detalhe, 'bloco', bloco, 'frequencia', frequencia,
      'dia_semana', dia_semana, 'dia_mes', dia_mes, 'dia_mes_prazo', dia_mes_prazo,
      'horario', to_char(horario, 'HH24:MI'), 'indicador', indicador, 'auto', auto, 'link', link,
      'ordem', ordem, 'ativo', ativo)
    ORDER BY ativo DESC, CASE frequencia WHEN 'diaria' THEN 1 WHEN 'semanal' THEN 2 ELSE 3 END, ordem, titulo)
    FROM public.rotina_tarefas), '[]');
END $$;

CREATE OR REPLACE FUNCTION public.fn_rotina_tarefa_salvar(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q record; v_id uuid := nullif(p ->> 'id', '')::uuid; v_freq text := p ->> 'frequencia';
BEGIN
  SELECT * INTO q FROM public.fn_rotina_quem();
  IF coalesce(q.papel, '') <> 'admin' THEN RAISE EXCEPTION 'Só o admin edita a rotina.'; END IF;
  IF btrim(coalesce(p ->> 'titulo', '')) = '' THEN RAISE EXCEPTION 'Escreva o título da tarefa.'; END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.rotina_tarefas (titulo, detalhe, bloco, frequencia, dia_semana, dia_mes, dia_mes_prazo, horario,
                                       link, ordem, ativo, criado_por)
    VALUES (btrim(p ->> 'titulo'), nullif(btrim(p ->> 'detalhe'), ''), p ->> 'bloco', v_freq,
            CASE WHEN v_freq = 'semanal' THEN (p ->> 'dia_semana')::smallint END,
            CASE WHEN v_freq = 'mensal' THEN (p ->> 'dia_mes')::smallint END,
            CASE WHEN v_freq = 'mensal' THEN nullif(p ->> 'dia_mes_prazo', '')::smallint END,
            nullif(p ->> 'horario', '')::time, nullif(btrim(p ->> 'link'), ''),
            coalesce((p ->> 'ordem')::int, (SELECT coalesce(max(ordem), 0) + 10 FROM public.rotina_tarefas)),
            coalesce((p ->> 'ativo')::boolean, true), q.pessoa_id)
    RETURNING id INTO v_id;
  ELSE
    -- indicador e auto não mudam pela tela (são ligados a regras do sistema)
    UPDATE public.rotina_tarefas SET
      titulo = btrim(p ->> 'titulo'), detalhe = nullif(btrim(p ->> 'detalhe'), ''), bloco = p ->> 'bloco', frequencia = v_freq,
      dia_semana = CASE WHEN v_freq = 'semanal' THEN (p ->> 'dia_semana')::smallint END,
      dia_mes = CASE WHEN v_freq = 'mensal' THEN (p ->> 'dia_mes')::smallint END,
      dia_mes_prazo = CASE WHEN v_freq = 'mensal' THEN nullif(p ->> 'dia_mes_prazo', '')::smallint END,
      horario = nullif(p ->> 'horario', '')::time, link = nullif(btrim(p ->> 'link'), ''),
      ordem = coalesce((p ->> 'ordem')::int, ordem), ativo = coalesce((p ->> 'ativo')::boolean, ativo), updated_at = now()
    WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'tarefa não encontrada'; END IF;
  END IF;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.fn_rotina_dia_util(date), public.fn_rotina_util_proximo(date), public.fn_rotina_util_anterior(date),
  public.fn_rotina_uteis_entre(date, date), public.fn_rotina_ocorrencia(public.rotina_tarefas, date), public.fn_rotina_quem(),
  public.fn_rotina_secretaria(date), public.fn_rotina_metas(uuid, date), public.fn_rotina_indicador(text, date, uuid),
  public.fn_rotina_auto_tick(), public.fn_rotina_dia(date), public.fn_rotina_marcar(uuid, date, boolean, text),
  public.fn_rotina_historico(date, date), public.fn_rotina_tarefas_listar(), public.fn_rotina_tarefa_salvar(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rotina_dia(date), public.fn_rotina_marcar(uuid, date, boolean, text),
  public.fn_rotina_historico(date, date), public.fn_rotina_tarefas_listar(), public.fn_rotina_tarefa_salvar(jsonb)
  TO authenticated;

-- ---------- tarefas iniciais (as do PDF "Rotina da Recepção") ----------
INSERT INTO public.rotina_tarefas (titulo, detalhe, bloco, frequencia, dia_semana, dia_mes, dia_mes_prazo, horario, indicador, auto, link, ordem)
SELECT * FROM (VALUES
  -- Abertura
  ('Ligar tudo e conferir o WhatsApp', 'Luzes, ar-condicionado, computador e celular da recepção. Ver se o WhatsApp está conectado (Configurações, aba Integrações).', 'abertura', 'diaria', NULL::smallint, NULL::smallint, NULL::smallint, '07:45'::time, NULL, false, '/configuracoes', 10),
  ('Recepções prontas', 'Brinquedos no lugar, propés na entrada, lixeiras vazias.', 'abertura', 'diaria', NULL, NULL, NULL, '07:50', NULL, false, NULL, 20),
  ('Cortesia pronta', 'Máquina de café ligada, cápsulas, copos, água e biscoitos.', 'abertura', 'diaria', NULL, NULL, NULL, '07:50', NULL, false, NULL, 30),
  ('Banheiros abastecidos', 'Papel higiênico, papel-toalha e sabonete.', 'abertura', 'diaria', NULL, NULL, NULL, '07:55', NULL, false, NULL, 40),
  ('Robô aspirador', 'Esvaziar o reservatório e deixar rodar antes da chegada dos pacientes.', 'abertura', 'diaria', NULL, NULL, NULL, '07:55', NULL, false, NULL, 50),
  ('Lembretes da agenda de hoje', 'Agenda das três fisios: mandar o lembrete a quem ainda não confirmou (botão na visão Agenda).', 'abertura', 'diaria', NULL, NULL, NULL, '08:00', NULL, false, '/agenda', 60),
  ('Grupo de Notificações e resumo das 8h', 'Pedidos da noite e o resumo das 8h. Responder primeiro quem espera há mais tempo.', 'abertura', 'diaria', NULL, NULL, NULL, '08:15', 'resumo_whatsapp', false, NULL, 70),
  -- Manhã
  ('Conferência agenda × WhatsApp', 'Itens do dia anterior na aba Conferência (Conversas). Lançar ou marcar cada um.', 'manha', 'diaria', NULL, NULL, NULL, '09:00', 'conferencia_agenda', false, '/conversas?aba=conferencia', 110),
  ('Sessões passadas com o status certo', 'Finalizado, faltou ou cancelado. Nenhuma sessão pode ficar "agendada" ou "confirmada" no passado. O sistema marca sozinho quando zerar.', 'manha', 'diaria', NULL, NULL, NULL, '09:30', 'sessoes_sem_status_ontem', true, '/agenda', 120),
  ('Resumo das 10h zerado', 'Toda família da lista respondida ou com prazo dado.', 'manha', 'diaria', NULL, NULL, NULL, '10:15', 'resumo_whatsapp', false, NULL, 130),
  ('Meta: contatos de reativação', 'Separe das 10h30 às 11h30, logo depois do resumo das 10h. Registre cada contato na página Reativação; o sistema marca sozinho quando bater a cota de hoje.', 'manha', 'diaria', NULL, NULL, NULL, '10:30', 'meta_contatos', true, '/reativacao', 140),
  ('Louça da recepção', 'Lavar ao longo da manhã.', 'manha', 'diaria', NULL, NULL, NULL, '11:45', NULL, false, NULL, 150),
  -- Almoço
  ('Antes de sair para o almoço', 'Nenhum pedido no grupo de Notificações parado há mais de 1 hora sem resposta à família.', 'almoco', 'diaria', NULL, NULL, NULL, '12:00', 'resumo_whatsapp', false, NULL, 210),
  -- Tarde
  ('Resumos das 12h e 14h zerados', 'Toda família da lista respondida ou com prazo dado.', 'tarde', 'diaria', NULL, NULL, NULL, '14:15', 'resumo_whatsapp', false, NULL, 310),
  ('Meta: convites da pesquisa', 'Convide quem terminou a sessão hoje. Às 15h, complete a cota pela lista da página Reativação. O sistema marca sozinho quando bater a cota de hoje.', 'tarde', 'diaria', NULL, NULL, NULL, '15:00', 'meta_convites', true, '/reativacao', 320),
  ('Resumo das 16h zerado', 'Toda família da lista respondida ou com prazo dado.', 'tarde', 'diaria', NULL, NULL, NULL, '16:15', 'resumo_whatsapp', false, NULL, 330),
  ('Pagamentos e vendas registrados', 'Pix, dinheiro e cartão recebidos na recepção, e vendas de produtos e brinquedos, lançados no app no mesmo dia.', 'tarde', 'diaria', NULL, NULL, NULL, '17:00', NULL, false, NULL, 340),
  -- Fechamento
  ('Resumo das 17h30 zerado', 'O que fica para amanhã recebe resposta à família com o prazo ("amanhã cedo te respondo").', 'fechamento', 'diaria', NULL, NULL, NULL, '17:40', 'resumo_whatsapp', false, NULL, 410),
  ('Sessões de hoje com o status certo', 'Finalizado, faltou ou cancelado. O sistema marca sozinho a partir das 17h30, quando zerar.', 'fechamento', 'diaria', NULL, NULL, NULL, '17:45', 'sessoes_sem_status_hoje', true, '/agenda', 420),
  ('Agenda de amanhã conferida', 'Confirmações enviadas e encaixes combinados lançados.', 'fechamento', 'diaria', NULL, NULL, NULL, '17:50', NULL, false, '/agenda', 430),
  ('Recepção fechada em ordem', 'Louça lavada e guardada, lixo recolhido, café desligado, recepções em ordem.', 'fechamento', 'diaria', NULL, NULL, NULL, '17:55', NULL, false, NULL, 440),
  ('Lista de estoque', 'Anotar o que acabou ou está no fim.', 'fechamento', 'diaria', NULL, NULL, NULL, '17:55', NULL, false, '/estoque', 450),
  -- Semana
  ('Planejar a semana', 'Agenda das três fisios, horários vagos, lista de espera e contratos não assinados das crianças com sessão na semana. Entrega: horários vagos oferecidos e contratos reenviados.', 'manha', 'semanal', 1, NULL, NULL, '09:00', NULL, false, '/agenda', 500),
  ('Cobrança das 14h', 'Acompanhar as pré-cobranças: responder dúvidas de pagamento e conferir links com erro. Entrega: nenhuma dúvida sem resposta até as 17h30.', 'tarde', 'semanal', 2, NULL, NULL, '14:00', NULL, false, '/cobrancas', 510),
  ('Estoque da semana', 'Materiais de atendimento, limpeza e recepção (biscoitos, cápsulas, copos, propés, papel). Entrega: lista de compras para a direção até as 17h.', 'tarde', 'semanal', 3, NULL, NULL, '15:30', NULL, false, '/estoque', 520),
  ('Limpeza dos equipamentos', 'Robô aspirador completo (escovas, filtro, sensores), aspirador de pó, armários e móveis das recepções.', 'tarde', 'semanal', 4, NULL, NULL, '15:30', NULL, false, NULL, 530),
  ('Fechar a semana', 'Cobrança das 14h, notas fiscais e atestados pedidos, recados das fisios respondidos, agenda da próxima semana conferida. Entrega: nada da semana parado no grupo de Notificações.', 'tarde', 'semanal', 5, NULL, NULL, '16:30', NULL, false, NULL, 540),
  -- Mês
  ('Agendas físicas e status do mês', 'Separar as agendas físicas das três fisios e conferir se todas as sessões do mês têm status (finalizado, faltou ou cancelado).', 'fechamento', 'mensal', NULL, 0, NULL, '16:00', NULL, false, '/agenda', 600),
  ('Conferência mensal das agendas', 'Agenda eletrônica × agenda física, sessão por sessão. Corrigir ou pedir autorização para o que estiver diferente. Prazo: dia 2 — libera o disparo das cobranças do mês.', 'manha', 'mensal', NULL, 1, 2, '09:00', NULL, false, '/conversas?aba=conferencia', 610),
  ('Acompanhar as cobranças do mês', 'Links com erro, e-mail inválido, dúvidas das famílias. Entrega: nenhum link com erro sem tratamento.', 'tarde', 'mensal', NULL, 3, 5, '14:00', NULL, false, '/cobrancas', 620),
  ('Notas fiscais do mês anterior', 'Pagamentos do mês anterior sem nota emitida. Entrega: lista do que falta enviada à direção.', 'tarde', 'mensal', NULL, 5, 5, '15:00', NULL, false, NULL, 630),
  ('Compras do mês', 'Pesquisa de preço e fornecedor, com aprovação da direção antes de comprar.', 'tarde', 'mensal', NULL, 10, 10, '15:00', NULL, false, '/estoque', 640),
  ('Filtros do ar-condicionado', 'Todas as salas. Olhar as grades e avisar se precisarem de limpeza técnica.', 'tarde', 'mensal', NULL, 15, 15, '15:00', NULL, false, NULL, 650),
  ('Inventário do estoque', 'Contagem de materiais, insumos e produtos à venda (brinquedos), conferida com o app. Diferenças avisadas à direção.', 'tarde', 'mensal', NULL, 20, 20, '15:00', NULL, false, '/estoque', 660)
) v(titulo, detalhe, bloco, frequencia, dia_semana, dia_mes, dia_mes_prazo, horario, indicador, auto, link, ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.rotina_tarefas);

-- Cron: de 15 em 15 min, 7h–19h (BRT) seg–sex.
SELECT cron.unschedule('rotina-auto') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rotina-auto');
SELECT cron.schedule('rotina-auto', '*/15 10-22 * * 1-5', $$SELECT public.fn_rotina_auto_tick();$$);
