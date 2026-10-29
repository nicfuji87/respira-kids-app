-- =============================================================================
-- Agenda Expressa
-- =============================================================================
-- Marcar a próxima sessão em poucos toques a partir da consulta de hoje, de
-- dentro da evolução (ou do card da consulta). Substitui as agendas de papel da
-- porta: a decisão acontece quando a família está saindo.
--
-- Regras:
--   * Repete a consulta de origem: criança, serviço, local e empresa. O valor
--     vem de fn_valor_servico (paciente -> profissional -> padrão).
--   * Profissional só marca na própria agenda, e só por aqui (não há policy de
--     INSERT para profissional em agendamentos; tudo passa por estas funções).
--   * Secretaria marca para as profissionais autorizadas em
--     permissoes_agendamento; admin marca para qualquer uma.
--   * data_hora é hora de parede gravada como UTC (ver fn_ju_horarios_livres):
--     slot "AAAA-MM-DD HH:MI" -> (slot AT TIME ZONE 'UTC').
--   * A consulta criada guarda agenda_expressa_origem_id; não nulo = criada
--     pela Agenda Expressa (aparece como selo, igual Agenda Compartilhada).
-- =============================================================================

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS agenda_expressa_origem_id uuid
    REFERENCES public.agendamentos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.agendamentos.agenda_expressa_origem_id IS
  'Consulta de onde a Agenda Expressa marcou esta. Não nulo = criada pela Agenda Expressa.';

CREATE INDEX IF NOT EXISTS idx_agendamentos_agenda_expressa_origem
  ON public.agendamentos (agenda_expressa_origem_id)
  WHERE agenda_expressa_origem_id IS NOT NULL;

-- View: mesma definição + a coluna nova no fim (CREATE OR REPLACE só aceita
-- colunas novas no final).
CREATE OR REPLACE VIEW public.vw_agendamentos_completos AS
 SELECT a.id,
    a.data_hora,
    a.paciente_id,
    a.profissional_id,
    a.tipo_servico_id,
    a.local_id,
    a.status_consulta_id,
    a.status_pagamento_id,
    a.valor_servico,
    a.id_pagamento_externo,
    a.observacao,
    a.ativo,
    a.fatura_id,
    a.cobranca_gerada_em,
    a.google_event_id,
    a.empresa_fatura AS empresa_fatura_id,
    a.agendado_por AS agendado_por_id,
    a.created_at,
    a.updated_at,
    a.link_nfe,
    a.agenda_compartilhada_id,
    a.criado_por,
    p_criado.nome AS criado_por_nome,
    a.atualizado_por,
    p_atualizado.nome AS atualizado_por_nome,
    pac.nome AS paciente_nome,
    pac.cpf_cnpj AS paciente_cpf,
    pac.telefone AS paciente_telefone,
    pac.email AS paciente_email,
    pac.data_nascimento AS paciente_data_nascimento,
    pac.role AS paciente_role,
    pac.foto_perfil AS paciente_foto_perfil,
    pac.is_approved AS paciente_is_approved,
    pac.profile_complete AS paciente_profile_complete,
    pac.ativo AS paciente_ativo,
    prof.nome AS profissional_nome,
    prof.email AS profissional_email,
    prof.telefone AS profissional_telefone,
    prof.role AS profissional_role,
    prof.registro_profissional AS profissional_registro_profissional,
    prof.especialidade AS profissional_especialidade,
    prof.bio_profissional AS profissional_bio_profissional,
    prof.foto_perfil AS profissional_foto_perfil,
    prof.is_approved AS profissional_is_approved,
    prof.profile_complete AS profissional_profile_complete,
    prof.ativo AS profissional_ativo,
    s.nome AS servico_nome,
    s.duracao_minutos AS servico_duracao,
    s.cor AS servico_cor,
    s.descricao AS tipo_servico_descricao,
    s.duracao_minutos AS tipo_servico_duracao_minutos,
    s.valor AS tipo_servico_valor,
    s.cor AS tipo_servico_cor,
    s.ativo AS tipo_servico_ativo,
    l.nome AS local_nome,
    l.id AS local_atendimento_id,
    l.tipo_local AS local_atendimento_tipo_local,
    l.ativo AS local_atendimento_ativo,
    sc.codigo AS status_consulta_codigo,
    sc.descricao AS status_consulta_nome,
    sc.cor AS status_consulta_cor,
    sp.codigo AS status_pagamento_codigo,
    sp.descricao AS status_pagamento_nome,
    sp.cor AS status_pagamento_cor,
    emp.razao_social AS empresa_fatura_razao_social,
    emp.nome_fantasia AS empresa_fatura_nome_fantasia,
    emp.cnpj AS empresa_fatura_cnpj,
    emp.ativo AS empresa_fatura_ativo,
    resp_legal.id_responsavel AS responsavel_legal_id,
    p_legal.nome AS responsavel_legal_nome,
    resp_fin.id_responsavel AS responsavel_financeiro_id,
    p_fin.nome AS responsavel_financeiro_nome,
    pac.responsavel_cobranca_id,
    p_cobranca.nome AS responsavel_cobranca_nome,
    p_cobranca.cpf_cnpj AS responsavel_cobranca_cpf,
    p_cobranca.email AS responsavel_cobranca_email,
    p_cobranca.telefone AS responsavel_cobranca_telefone,
    p_cobranca.numero_endereco AS responsavel_cobranca_numero,
    end_cobranca.cep AS responsavel_cobranca_cep,
    p_agendado.nome AS agendado_por_nome,
    com.tipo_recebimento AS comissao_tipo_recebimento,
    com.valor_fixo AS comissao_valor_fixo,
    com.valor_percentual AS comissao_valor_percentual,
        CASE
            WHEN com.tipo_recebimento = 'fixo'::text THEN com.valor_fixo
            WHEN com.tipo_recebimento = 'percentual'::text THEN a.valor_servico * com.valor_percentual / 100::numeric
            ELSE 0::numeric
        END AS comissao_valor_calculado,
    s.nome AS tipo_servico_nome,
    l.nome AS local_atendimento_nome,
    sc.descricao AS status_consulta_descricao,
    sp.descricao AS status_pagamento_descricao,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM relatorio_evolucao e
              WHERE e.id_agendamento = a.id
             LIMIT 1)) THEN 'sim'::text
            ELSE 'não'::text
        END AS possui_evolucao,
    a.agenda_expressa_origem_id
   FROM agendamentos a
     LEFT JOIN pessoas pac ON pac.id = a.paciente_id
     LEFT JOIN pessoas prof ON prof.id = a.profissional_id
     LEFT JOIN tipo_servicos s ON s.id = a.tipo_servico_id
     LEFT JOIN locais_atendimento l ON l.id = a.local_id
     LEFT JOIN consulta_status sc ON sc.id = a.status_consulta_id
     LEFT JOIN pagamento_status sp ON sp.id = a.status_pagamento_id
     LEFT JOIN pessoa_empresas emp ON emp.id = a.empresa_fatura
     LEFT JOIN pessoas p_agendado ON p_agendado.id = a.agendado_por
     LEFT JOIN pessoas p_criado ON p_criado.id = a.criado_por
     LEFT JOIN pessoas p_atualizado ON p_atualizado.id = a.atualizado_por
     LEFT JOIN pessoas p_cobranca ON p_cobranca.id = pac.responsavel_cobranca_id
     LEFT JOIN enderecos end_cobranca ON end_cobranca.id = p_cobranca.id_endereco
     LEFT JOIN LATERAL ( SELECT pessoa_responsaveis.id_responsavel
           FROM pessoa_responsaveis
          WHERE pessoa_responsaveis.id_pessoa = a.paciente_id AND (pessoa_responsaveis.tipo_responsabilidade = ANY (ARRAY['legal'::text, 'ambos'::text])) AND pessoa_responsaveis.ativo = true
         LIMIT 1) resp_legal ON true
     LEFT JOIN pessoas p_legal ON p_legal.id = resp_legal.id_responsavel
     LEFT JOIN LATERAL ( SELECT pessoa_responsaveis.id_responsavel
           FROM pessoa_responsaveis
          WHERE pessoa_responsaveis.id_pessoa = a.paciente_id AND (pessoa_responsaveis.tipo_responsabilidade = ANY (ARRAY['financeiro'::text, 'ambos'::text])) AND pessoa_responsaveis.ativo = true
         LIMIT 1) resp_fin ON true
     LEFT JOIN pessoas p_fin ON p_fin.id = resp_fin.id_responsavel
     LEFT JOIN comissao_profissional com ON com.id_profissional = a.profissional_id AND com.id_servico = a.tipo_servico_id AND com.ativo = true
  WHERE a.ativo = true;

-- -----------------------------------------------------------------------------
-- Quem pode marcar na agenda de quem
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_agenda_expressa_pode_marcar(p_profissional_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_profissional_id IS NOT NULL AND (
    public.is_admin()
    OR (public.is_secretaria() AND EXISTS (
          SELECT 1 FROM public.permissoes_agendamento pa
           WHERE pa.id_secretaria = public.get_current_pessoa_id()
             AND pa.id_profissional = p_profissional_id
             AND pa.ativo = true))
    OR (public.is_profissional() AND p_profissional_id = public.get_current_pessoa_id())
  );
$$;

-- -----------------------------------------------------------------------------
-- Horário livre? (mesma régua da Ju: consulta ativa, compromisso que impede
-- agendamento e reserva pendente; domiciliar ganha 30 min de deslocamento)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_agenda_expressa_slot_livre(
  p_profissional_id uuid,
  p_inicio timestamptz,
  p_minutos integer,
  p_domiciliar boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH j AS (
    SELECT p_inicio - CASE WHEN p_domiciliar THEN interval '30 minutes' ELSE interval '0' END AS ini,
           p_inicio + make_interval(mins => greatest(coalesce(p_minutos, 60), 20))
                    + CASE WHEN p_domiciliar THEN interval '30 minutes' ELSE interval '0' END AS fim
  )
  SELECT NOT EXISTS (
           SELECT 1
             FROM public.agendamentos a
             JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
             LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id, j
            WHERE a.profissional_id = p_profissional_id
              AND a.ativo
              AND cs.codigo NOT IN ('cancelado', 'erro', 'reagendado')
              AND a.data_hora - CASE WHEN ts.nome ~* 'domiciliar' THEN interval '30 minutes' ELSE interval '0' END < j.fim
              AND a.data_hora + make_interval(mins => coalesce(nullif(ts.duracao_minutos, 0), 60))
                  + CASE WHEN ts.nome ~* 'domiciliar' THEN interval '30 minutes' ELSE interval '0' END > j.ini)
     AND NOT EXISTS (
           SELECT 1 FROM public.agenda_bloqueios b, j
            WHERE b.ativo AND b.deleted_at IS NULL AND b.impede_agendamento
              AND (b.profissional_id IS NULL OR b.profissional_id = p_profissional_id)
              AND b.periodo && tstzrange(j.ini, j.fim))
     AND NOT EXISTS (
           SELECT 1 FROM public.ju_reservas r, j
            WHERE r.profissional_id = p_profissional_id
              AND (r.status = 'pendente' OR (r.status = 'aguardando_cadastro' AND r.expira_em > now()))
              AND r.data_hora < j.fim
              AND r.data_hora + interval '60 minutes' > j.ini);
$$;

-- -----------------------------------------------------------------------------
-- Contexto: o que a tela precisa para abrir já pronta
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_agenda_expressa_contexto(p_agendamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
  v_eu uuid := public.get_current_pessoa_id();
  v_so_eu boolean := public.is_profissional() AND NOT public.is_admin() AND NOT public.is_secretaria();
  v_prof uuid;
  v_profs jsonb;
  v_proximas jsonb;
BEGIN
  IF v_eu IS NULL OR NOT (public.is_admin() OR public.is_secretaria() OR public.is_profissional()) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  SELECT a.id, a.paciente_id, a.profissional_id, a.tipo_servico_id, a.local_id,
         (a.data_hora AT TIME ZONE 'UTC') AS dh,
         pac.nome AS paciente_nome, ts.nome AS servico_nome,
         coalesce(nullif(ts.duracao_minutos, 0), 60) AS duracao,
         l.nome AS local_nome
    INTO o
    FROM public.agendamentos a
    JOIN public.pessoas pac ON pac.id = a.paciente_id
    LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
    LEFT JOIN public.locais_atendimento l ON l.id = a.local_id
   WHERE a.id = p_agendamento_id AND a.ativo;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'consulta_nao_encontrada');
  END IF;

  -- Profissional: sempre a própria agenda. Demais: a profissional da consulta.
  v_prof := CASE WHEN v_so_eu THEN v_eu ELSE o.profissional_id END;

  -- Profissionais que esta pessoa pode escolher em "Trocar"
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) ORDER BY p.nome), '[]'::jsonb)
    INTO v_profs
    FROM public.pessoas p
   WHERE p.ativo
     AND p.role IN ('admin', 'profissional')
     AND (p.id = v_prof OR EXISTS (
           SELECT 1 FROM public.agendamentos x
            WHERE x.profissional_id = p.id AND x.ativo
              AND x.data_hora > now() - interval '120 days'))
     AND public.fn_agenda_expressa_pode_marcar(p.id);

  -- Próximas consultas já marcadas da criança (evita marcar em dobro)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id,
           'data_hora', to_char(a.data_hora AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
           'profissional_nome', pr.nome,
           'expressa', a.agenda_expressa_origem_id IS NOT NULL) ORDER BY a.data_hora), '[]'::jsonb)
    INTO v_proximas
    FROM (SELECT a.* FROM public.agendamentos a
            JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
           WHERE a.paciente_id = o.paciente_id AND a.ativo
             AND cs.codigo IN ('agendado', 'confirmado')
             AND a.data_hora > (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'
             AND a.id <> o.id
           ORDER BY a.data_hora
           LIMIT 4) a
    LEFT JOIN public.pessoas pr ON pr.id = a.profissional_id;

  RETURN jsonb_build_object(
    'ok', true,
    'origem', jsonb_build_object(
      'id', o.id,
      'data_hora', to_char(o.dh, 'YYYY-MM-DD"T"HH24:MI'),
      'hora', to_char(o.dh, 'HH24:MI'),
      'paciente_id', o.paciente_id,
      'paciente_nome', o.paciente_nome,
      'servico_nome', o.servico_nome,
      'duracao_minutos', o.duracao,
      'local_nome', o.local_nome,
      'profissional_id', o.profissional_id),
    'profissional_padrao', (SELECT jsonb_build_object('id', p.id, 'nome', p.nome) FROM public.pessoas p WHERE p.id = v_prof),
    'pode_marcar', public.fn_agenda_expressa_pode_marcar(v_prof),
    'pode_trocar', NOT v_so_eu AND jsonb_array_length(v_profs) > 1,
    'profissionais', v_profs,
    'proximas', v_proximas
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Horários: grade tirada do histórico da profissional (minuto de início mais
-- comum e faixa de horas por dia da semana), marcando livre/ocupado.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_agenda_expressa_horarios(
  p_agendamento_id uuid,
  p_profissional_id uuid DEFAULT NULL,
  p_de date DEFAULT NULL,
  p_dias integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
  v_eu uuid := public.get_current_pessoa_id();
  v_so_eu boolean := public.is_profissional() AND NOT public.is_admin() AND NOT public.is_secretaria();
  v_prof uuid;
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date;
  v_minuto int;
  v_hora_origem time;
  v_dia date;
  v_ini int; v_fim int;
  v_t time;
  v_slot timestamp;
  v_horas time[];
  v_lista jsonb;
  v_dias jsonb := '[]'::jsonb;
  v_livres int;
BEGIN
  SELECT a.id, a.profissional_id, ts.nome AS servico_nome,
         coalesce(nullif(ts.duracao_minutos, 0), 60) AS duracao,
         (a.data_hora AT TIME ZONE 'UTC')::time AS hora
    INTO o
    FROM public.agendamentos a
    LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
   WHERE a.id = p_agendamento_id AND a.ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'consulta_nao_encontrada');
  END IF;

  v_prof := CASE WHEN v_so_eu THEN v_eu ELSE coalesce(p_profissional_id, o.profissional_id) END;
  IF NOT public.fn_agenda_expressa_pode_marcar(v_prof) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  v_de := greatest(coalesce(p_de, v_hoje), v_hoje);
  v_hora_origem := o.hora;

  -- Minuto de início mais comum da profissional (Flávia começa nas meias horas)
  SELECT extract(minute FROM a.data_hora AT TIME ZONE 'UTC')::int
    INTO v_minuto
    FROM public.agendamentos a
   WHERE a.profissional_id = v_prof AND a.ativo
     AND a.data_hora > now() - interval '120 days'
   GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
  v_minuto := coalesce(v_minuto, 0);

  FOR v_dia IN SELECT d::date FROM generate_series(v_de, v_de + (least(greatest(p_dias, 1), 31) - 1), interval '1 day') d LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.followup_feriados f WHERE f.dia = v_dia);

    -- Faixa de horas que ela costuma atender neste dia da semana
    SELECT min(h), max(h) INTO v_ini, v_fim
      FROM (SELECT extract(hour FROM a.data_hora AT TIME ZONE 'UTC')::int AS h
              FROM public.agendamentos a
             WHERE a.profissional_id = v_prof AND a.ativo
               AND a.data_hora > now() - interval '120 days'
               AND extract(isodow FROM a.data_hora AT TIME ZONE 'UTC') = extract(isodow FROM v_dia)
             GROUP BY 1 HAVING count(*) >= 2) x
     -- Só conta o dia da semana em que ela costuma atender (6+ dos ~17 no
     -- período): Beatriz faz domingos, Bruna quase nunca.
     WHERE (SELECT count(DISTINCT (a.data_hora AT TIME ZONE 'UTC')::date)
              FROM public.agendamentos a
             WHERE a.profissional_id = v_prof AND a.ativo
               AND a.data_hora > now() - interval '120 days'
               AND extract(isodow FROM a.data_hora AT TIME ZONE 'UTC') = extract(isodow FROM v_dia)) >= 6;

    -- Sem histórico nenhum: seg a sex, 8h às 18h
    IF v_ini IS NULL THEN
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.agendamentos a
                             WHERE a.profissional_id = v_prof AND a.ativo
                               AND a.data_hora > now() - interval '120 days')
                 OR extract(isodow FROM v_dia) IN (6, 7);
      v_ini := 8; v_fim := 17;
    END IF;

    v_horas := ARRAY[]::time[];
    FOR h IN v_ini..v_fim LOOP
      v_horas := v_horas || make_time(h, v_minuto, 0);
    END LOOP;
    -- O horário de hoje entra mesmo fora da grade ("mesmo horário")
    IF NOT (v_hora_origem = ANY (v_horas)) THEN
      v_horas := v_horas || v_hora_origem;
    END IF;

    v_lista := '[]'::jsonb; v_livres := 0;
    FOR v_t IN SELECT unnest(v_horas) ORDER BY 1 LOOP
      v_slot := v_dia + v_t;
      CONTINUE WHEN v_slot <= v_agora + interval '15 minutes';
      IF public.fn_agenda_expressa_slot_livre(v_prof, v_slot AT TIME ZONE 'UTC', o.duracao, o.servico_nome ~* 'domiciliar') THEN
        v_lista := v_lista || jsonb_build_object('hora', to_char(v_t, 'HH24:MI'), 'livre', true);
        v_livres := v_livres + 1;
      ELSE
        v_lista := v_lista || jsonb_build_object('hora', to_char(v_t, 'HH24:MI'), 'livre', false);
      END IF;
    END LOOP;

    CONTINUE WHEN jsonb_array_length(v_lista) = 0;
    v_dias := v_dias || jsonb_build_object(
      'data', to_char(v_dia, 'YYYY-MM-DD'),
      'livres', v_livres,
      'horarios', v_lista);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'profissional_id', v_prof,
    'hora_origem', to_char(v_hora_origem, 'HH24:MI'),
    'dias', v_dias);
END;
$$;

-- -----------------------------------------------------------------------------
-- Criar: repete a consulta de origem no dia/hora escolhidos
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_agenda_expressa_criar(
  p_agendamento_id uuid,
  p_data_hora timestamp,           -- hora de parede, ex.: '2026-11-03 15:00'
  p_profissional_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
  v_eu uuid := public.get_current_pessoa_id();
  v_so_eu boolean := public.is_profissional() AND NOT public.is_admin() AND NOT public.is_secretaria();
  v_prof uuid;
  v_inicio timestamptz := p_data_hora AT TIME ZONE 'UTC';
  v_novo uuid;
  v_valor numeric;
BEGIN
  IF p_data_hora IS NULL THEN
    RAISE EXCEPTION 'Escolha o dia e o horário.' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.* , ts.nome AS servico_nome, coalesce(nullif(ts.duracao_minutos, 0), 60) AS duracao
    INTO o
    FROM public.agendamentos a
    LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
   WHERE a.id = p_agendamento_id AND a.ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consulta de origem não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  -- Profissional pedindo a agenda de outra: recusa (não troca em silêncio)
  IF v_so_eu AND p_profissional_id IS NOT NULL AND p_profissional_id <> v_eu THEN
    RAISE EXCEPTION 'Você só pode marcar na sua própria agenda.' USING ERRCODE = '42501';
  END IF;
  v_prof := CASE WHEN v_so_eu THEN v_eu ELSE coalesce(p_profissional_id, o.profissional_id) END;
  IF NOT public.fn_agenda_expressa_pode_marcar(v_prof) THEN
    RAISE EXCEPTION 'Você só pode marcar na sua própria agenda.' USING ERRCODE = '42501';
  END IF;

  IF p_data_hora <=(now() AT TIME ZONE 'America/Sao_Paulo') THEN
    RAISE EXCEPTION 'Esse horário já passou.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.fn_agenda_expressa_slot_livre(v_prof, v_inicio, o.duracao, o.servico_nome ~* 'domiciliar') THEN
    RAISE EXCEPTION 'Esse horário acabou de ser ocupado. Escolha outro.' USING ERRCODE = '23P01';
  END IF;

  -- A criança já tem consulta nesse horário (com qualquer profissional)?
  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
      JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
     WHERE a.paciente_id = o.paciente_id AND a.ativo
       AND cs.codigo IN ('agendado', 'confirmado')
       AND a.periodo && tstzrange(v_inicio, v_inicio + make_interval(mins => o.duracao))
  ) THEN
    RAISE EXCEPTION 'A criança já tem consulta nesse horário.' USING ERRCODE = '23P01';
  END IF;

  v_valor := coalesce(public.fn_valor_servico(o.tipo_servico_id, v_prof, o.paciente_id), o.valor_servico);

  INSERT INTO public.agendamentos (
    data_hora, paciente_id, profissional_id, tipo_servico_id, local_id,
    status_consulta_id, status_pagamento_id, valor_servico, empresa_fatura,
    agendado_por, criado_por, agenda_expressa_origem_id
  ) VALUES (
    v_inicio, o.paciente_id, v_prof, o.tipo_servico_id, o.local_id,
    (SELECT id FROM public.consulta_status WHERE codigo = 'agendado'),
    (SELECT id FROM public.pagamento_status WHERE codigo = 'pendente'),
    v_valor, o.empresa_fatura,
    v_eu, v_eu, o.id
  )
  RETURNING id INTO v_novo;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_novo,
    'data_hora', to_char(p_data_hora, 'YYYY-MM-DD"T"HH24:MI'),
    'profissional_nome', (SELECT nome FROM public.pessoas WHERE id = v_prof));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_agenda_expressa_pode_marcar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_agenda_expressa_slot_livre(uuid, timestamptz, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_agenda_expressa_contexto(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_agenda_expressa_horarios(uuid, uuid, date, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_agenda_expressa_criar(uuid, timestamp, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_agenda_expressa_pode_marcar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_agenda_expressa_slot_livre(uuid, timestamptz, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_agenda_expressa_contexto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_agenda_expressa_horarios(uuid, uuid, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_agenda_expressa_criar(uuid, timestamp, uuid) TO authenticated;
