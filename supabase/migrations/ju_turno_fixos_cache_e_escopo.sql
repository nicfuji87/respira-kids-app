-- 23/11/2026: Ju em silêncio de sexta a domingo para famílias com paciente fixo.
--
-- fn_ju_fixo_sem_marcar chamava fn_pacientes_fixos_semana_dados(semana) (todos os fixos da clínica,
-- ~430 ms) para cada criança, e fn_ju_contexto_cliente é chamado 4–5 vezes por turno. De sexta a
-- domingo são duas semanas, e o turno da Ju passava dos 8 s (statement timeout): 20/11 conversa 306,
-- 21/11 conversa 69 (família sem resposta até segunda). Agora cada semana é calculada uma vez por
-- transação e guardada em um GUC local ('ju.fixos_AAAAMMDD'). Conversa 69: 3,6 s → 0,7 s.
--
-- Também: escopo clínico na base de conhecimento da Ju (definição do dono em 21 e 23/11/2026).

CREATE OR REPLACE FUNCTION public.fn_ju_fixo_sem_marcar(p_paciente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_sem date; d jsonb; p jsonb; v_profs uuid[]; v_links jsonb; v_cache text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pacientes_fixos f WHERE f.paciente_id = p_paciente_id AND f.ativo) THEN RETURN NULL; END IF;
  FOREACH v_sem IN ARRAY ARRAY[date_trunc('week', v_hoje)::date, date_trunc('week', v_hoje)::date + 7] LOOP
    CONTINUE WHEN v_sem > v_hoje AND extract(isodow FROM v_hoje) < 5;
    -- cache por transação: o turno da Ju chama isto várias vezes por criança
    v_cache := nullif(current_setting('ju.fixos_' || to_char(v_sem, 'YYYYMMDD'), true), '');
    IF v_cache IS NOT NULL THEN
      d := v_cache::jsonb;
    ELSE
      d := public.fn_pacientes_fixos_semana_dados(v_sem);
      PERFORM set_config('ju.fixos_' || to_char(v_sem, 'YYYYMMDD'), coalesce(d, '{}'::jsonb)::text, true);
    END IF;
    SELECT e INTO p FROM jsonb_array_elements(coalesce(d -> 'pacientes', '[]'::jsonb)) e
     WHERE e ->> 'paciente_id' = p_paciente_id::text;
    CONTINUE WHEN p IS NULL OR p ->> 'situacao' <> 'falta';
    SELECT array_agg(x.id ORDER BY (x.id::text = p ->> 'profissional_id') DESC, x.ord) INTO v_profs
      FROM (SELECT (e ->> 'id')::uuid AS id, ord FROM jsonb_array_elements(p -> 'profissionais') WITH ORDINALITY t(e, ord)) x;
    v_links := public.fn_fixos_links_semana(coalesce(v_profs, '{}'), v_sem);
    CONTINUE WHEN jsonb_array_length(v_links) = 0;
    RETURN jsonb_build_object(
      'semana', to_char(v_sem, 'DD/MM') || ' a ' || to_char(v_sem + 5, 'DD/MM'),
      'esta_semana', v_sem = date_trunc('week', v_hoje)::date,
      'links', v_links,
      'lembrete_enviado_em', (SELECT to_char(max(e.enviado_em) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
                                FROM pacientes_fixos_envios e
                               WHERE e.paciente_id = p_paciente_id AND e.semana = v_sem AND e.status = 'enviado'));
  END LOOP;
  RETURN NULL;
END $function$;

INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo, updated_at)
VALUES ('ESCOPO_ATENDIMENTO', 'SERVICOS',
'O QUE A CLÍNICA ATENDE: crianças até 12 anos, em quatro áreas: fisioterapia respiratória, desenvolvimento motor, assimetria craniana (plagiocefalia, braquicefalia) e torcicolo congênito. Também atende prematuros e pós-cirúrgico (por exemplo, cirurgia cardíaca ou torácica). Respiração pela boca (respiração bucal), inclusive quando indicada por dentista ou ortodontista, entra como fisioterapia respiratória: a fisio avalia, com o mesmo valor da fisioterapia respiratória; siga o pré-atendimento normal.
O QUE NÃO ATENDE: fisioterapia ortopédica ou pós-fratura (braço ou perna quebrada, gesso, entorse, joelho, coluna) e pacientes com mais de 12 anos. Nesses casos, explique com gentileza logo na primeira resposta que esse tipo de atendimento não faz parte do que a clínica oferece, diga em uma frase o que a clínica atende e não faça perguntas de pré-atendimento nem ofereça horário. Se a família insistir ou o caso misturar algo que a clínica atende, chame a secretaria.',
  true, now())
ON CONFLICT (id) DO UPDATE SET categoria = excluded.categoria, texto = excluded.texto, ativo = true, updated_at = now();
