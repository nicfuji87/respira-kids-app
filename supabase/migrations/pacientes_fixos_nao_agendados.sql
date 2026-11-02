-- Pacientes Fixos: lista de quem não agendou (02/11/2026, pedido do dono)
--
-- - Entra a partir da SEGUNDA da semana em que o paciente deveria vir.
-- - Continua na lista depois que a semana passa, até marcar um horário (ou
--   alguém retirar). Não depende da semana escolhida na tela.
-- - "Desde": semana prevista = semana de (última sessão + ciclo da frequência),
--   respeitando o adiamento. Sem sessão nenhuma: a semana em que virou fixo.
--   Qualquer consulta ativa depois da última (inclusive futura) tira da lista.
-- - "Retirar da lista" guarda a semana atual: só volta se o paciente marcar e
--   depois ficar sem horário de novo (nova semana prevista).

ALTER TABLE public.pacientes_fixos
  ADD COLUMN IF NOT EXISTS nao_agendou_dispensado_ate date,
  ADD COLUMN IF NOT EXISTS nao_agendou_dispensado_por uuid REFERENCES public.pessoas(id);

COMMENT ON COLUMN public.pacientes_fixos.nao_agendou_dispensado_ate IS
  'Retirado da lista "Não agendaram" nesta semana (segunda-feira). Volta só com nova semana prevista depois dela.';

-- O histórico ignora a retirada (não é mudança do cadastro)
CREATE OR REPLACE FUNCTION public.fn_pacientes_fixos_historico_gravar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acao text;
  v_antes jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  v_depois jsonb := to_jsonb(NEW);
  v_ignorar text[] := ARRAY['updated_at', 'atualizado_por', 'ultima_origem', 'ultima_evolucao_id',
                            'nao_agendou_dispensado_ate', 'nao_agendou_dispensado_por'];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (v_antes - v_ignorar) = (v_depois - v_ignorar) THEN
      RETURN NULL;
    END IF;
  END IF;
  v_acao := CASE
    WHEN TG_OP = 'INSERT' THEN 'criado'
    WHEN NEW.ativo IS DISTINCT FROM OLD.ativo THEN CASE WHEN NEW.ativo THEN 'reativado' ELSE 'encerrado' END
    WHEN NEW.frequencia IS DISTINCT FROM OLD.frequencia
      OR NEW.intervalo_dias IS DISTINCT FROM OLD.intervalo_dias THEN 'frequencia'
    WHEN NEW.adiado_ate IS DISTINCT FROM OLD.adiado_ate THEN
      CASE WHEN NEW.adiado_ate IS NULL THEN 'adiamento_removido' ELSE 'adiado' END
    ELSE 'editado' END;
  INSERT INTO public.pacientes_fixos_historico
    (fixo_id, paciente_id, acao, antes, depois, origem, evolucao_id, feito_por)
  VALUES
    (NEW.id, NEW.paciente_id, v_acao, v_antes, v_depois, NEW.ultima_origem,
     NEW.ultima_evolucao_id, NEW.atualizado_por);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_pacientes_fixos_nao_agendados()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_seg date := date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date;
  v_ids uuid[];
  v_res jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT array_agg(f.paciente_id) INTO v_ids
    FROM public.pacientes_fixos f JOIN public.pessoas p ON p.id = f.paciente_id
   WHERE f.ativo AND p.ativo;

  WITH sess AS (
    SELECT * FROM public.fn_paciente_fixo_sessoes(coalesce(v_ids, '{}'))
  ), base AS (
    SELECT f.paciente_id, f.adiado_ate, f.nao_agendou_dispensado_ate, f.created_at,
           public.fn_paciente_fixo_ciclo_dias(f.frequencia, f.intervalo_dias) AS ciclo,
           (SELECT max(s.dh) FROM sess s WHERE s.paciente_id = f.paciente_id) AS ultima
      FROM public.pacientes_fixos f
      JOIN public.pessoas p ON p.id = f.paciente_id
     WHERE f.ativo AND p.ativo
  ), calc AS (
    SELECT b.*,
           greatest(
             coalesce(date_trunc('week', b.ultima + make_interval(days => b.ciclo))::date,
                      date_trunc('week', (b.created_at AT TIME ZONE 'America/Sao_Paulo'))::date),
             coalesce(b.adiado_ate, '-infinity'::date)) AS desde
      FROM base b
     WHERE b.ultima IS NULL OR b.ultima <= v_agora
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'paciente_id', c.paciente_id,
           'desde', c.desde,
           'semanas_sem_agendar', ((v_seg - c.desde) / 7) + 1,
           'ultima_sessao', to_char(c.ultima, 'YYYY-MM-DD"T"HH24:MI'),
           'dias_sem_vir', CASE WHEN c.ultima IS NOT NULL THEN (v_agora::date - c.ultima::date) END,
           'ultimo_link_em', (SELECT max(e.enviado_em) FROM public.pacientes_fixos_envios e
                               WHERE e.paciente_id = c.paciente_id AND e.status = 'enviado'
                                 AND e.enviado_em > coalesce(c.ultima, '-infinity'::timestamp) AT TIME ZONE 'America/Sao_Paulo')
         ) ORDER BY c.desde, c.paciente_id), '[]'::jsonb)
    INTO v_res
    FROM calc c
   WHERE c.desde <= v_seg
     AND (c.nao_agendou_dispensado_ate IS NULL OR c.desde > c.nao_agendou_dispensado_ate);

  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_paciente_fixo_retirar_nao_agendados(p_paciente_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_secretaria()) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  UPDATE public.pacientes_fixos
     SET nao_agendou_dispensado_ate = date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date,
         nao_agendou_dispensado_por = public.get_current_pessoa_id()
   WHERE paciente_id = p_paciente_id AND ativo;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_pacientes_fixos_nao_agendados() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_paciente_fixo_retirar_nao_agendados(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_pacientes_fixos_historico_gravar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.fn_pacientes_fixos_nao_agendados(),
  public.fn_paciente_fixo_retirar_nao_agendados(uuid)
TO authenticated;
