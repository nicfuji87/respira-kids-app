-- Marketing P0, parte 1 (25/11/2026): base única de presença, aquisição e receita. Só acrescenta; o painel antigo não muda.
--
-- Antes havia três regras para "a sessão aconteceu":
--   - painel antigo (vw_atrib_aquisicoes): Finalizado, ou sessão passada com fatura paga;
--   - Retorno por canal (fn_atrib_retorno_canais) e Retorno dos anúncios
--     (fn_atrib_retorno_anuncios): QUALQUER sessão passada "Agendado"/"Confirmado".
-- O mesmo paciente aparecia como atendido numa aba e não na outra.
--
-- Regra única (fn_atrib_presenca), decidida com o dono em 25/11/2026:
--   confirmada = Finalizado na agenda;
--   provavel   = já passou, sem baixa, com pagamento (fatura paga). Pagamento NÃO prova
--                presença (a clínica cobra falta), por isso é "a conferir", não confirmada;
--   pendente   = já passou, sem baixa e sem pagamento;
--   falta      = Faltou: não conta atendimento, mas a cobrança (integral) é receita;
--   cancelada  = Cancelado/Reagendado: não conta nada;
--   agendada   = ainda vai acontecer;
--   invalida   = Erro.
-- Três dimensões separadas: presença (acima), aquisição (canal = 1ª origem conhecida
-- da conversa, vínculo com a oportunidade e sua confiança) e financeiro (realizada =
-- confirmada + falta; a conferir = provável + pendente; recebida = faturas pagas;
-- agendada = futuras). Confiança da ATRIBUIÇÃO (vínculo provável) não muda a da PRESENÇA.
--
-- O painel antigo continua igual (para comparação até a conciliação ser aprovada):
-- fn_atrib_sessao_ocorreu passa a ser "presença confirmada ou provável", que é
-- exatamente o que ela já fazia; vw_atrib_aquisicoes exige um Finalizado.
--
-- Filtros: fn_atrib_retorno_canais e fn_atrib_retorno_anuncios recebem canal, campanha
-- e serviço e aplicam o recorte nos totais, não só nas listas. Com serviço, conversas e
-- investimento não se dividem: voltam nulos e o painel mostra "indisponível neste recorte".
--
-- Convênio: o alerta semanal deixa de recomendar negar operadoras só pela taxa de
-- agendamento. Negativa só com evidência nos termos de pesquisa (gasto em buscas com
-- nome de operadora); sem isso, o alerta é um diagnóstico.
--
-- 'nao_atribuido' passa a ser o código de "sem origem identificada" também aqui (antes
-- 'desconhecido', que no painel antigo quer dizer "código sem clique").

-- ── 1. Presença de uma sessão ──────────────────────────────────────────────
-- Sem SET search_path de propósito: só usa funções do catálogo e assim o planejador
-- consegue embutir a função nas visões (milhares de linhas).
CREATE OR REPLACE FUNCTION public.fn_atrib_presenca(
  p_consulta text, p_pagamento text, p_fatura_id uuid, p_fatura_status text, p_data_hora timestamptz)
RETURNS text LANGUAGE sql STABLE PARALLEL SAFE AS $function$
  SELECT CASE
    WHEN p_consulta = 'finalizado' THEN 'confirmada'
    WHEN p_consulta = 'faltou' THEN 'falta'
    WHEN p_consulta IN ('cancelado', 'reagendado') THEN 'cancelada'
    WHEN p_consulta IN ('agendado', 'confirmado') THEN
      CASE
        -- data_hora é hora de parede gravada como UTC: comparar com o relógio de SP.
        WHEN (p_data_hora AT TIME ZONE 'UTC') >= (now() AT TIME ZONE 'America/Sao_Paulo') THEN 'agendada'
        WHEN p_pagamento IS DISTINCT FROM 'estornado'
         AND (p_fatura_status = 'pago' OR (p_fatura_id IS NULL AND p_pagamento = 'pago')) THEN 'provavel'
        ELSE 'pendente'
      END
    ELSE 'invalida'
  END
$function$;
COMMENT ON FUNCTION public.fn_atrib_presenca(text, text, uuid, text, timestamptz) IS
  'Presença de uma sessão para o Marketing: confirmada (Finalizado), provavel (passou, sem baixa, paga), pendente (passou, sem baixa, sem pagamento), falta, cancelada, agendada, invalida. Pagamento não prova presença (falta é cobrada). Ver atribuicao_v2_p0_calculo_unico.sql.';

-- O painel antigo passa a usar a mesma regra (mesmo resultado de antes).
CREATE OR REPLACE FUNCTION public.fn_atrib_sessao_ocorreu(
  p_consulta text, p_pagamento text, p_fatura_id uuid, p_fatura_status text, p_data_hora timestamptz)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $function$
  SELECT public.fn_atrib_presenca(p_consulta, p_pagamento, p_fatura_id, p_fatura_status, p_data_hora)
         IN ('confirmada', 'provavel')
$function$;

-- ── 2. Sessões classificadas (ao vivo; a receita recebida vem do rateio horário) ──
CREATE OR REPLACE VIEW interno.vw_atrib_sessoes AS
SELECT a.id AS agendamento_id,
       a.paciente_id,
       (a.data_hora AT TIME ZONE 'UTC') AS dh,            -- hora de parede
       a.created_at,
       cs.codigo AS status_consulta,
       public.fn_atrib_presenca(cs.codigo, ps.codigo, a.fatura_id, f.status, a.data_hora) AS presenca,
       coalesce(a.valor_servico, 0) AS valor,
       regexp_replace(btrim(ts.nome), '\s*-\s*(DU|FDS)$', '') AS servico,
       pr.nome AS profissional,
       coalesce(r.receita_recebida, 0) AS recebida
  FROM public.agendamentos a
  LEFT JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
  LEFT JOIN public.pagamento_status ps ON ps.id = a.status_pagamento_id
  LEFT JOIN public.faturas f ON f.id = a.fatura_id AND f.ativo
  LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
  LEFT JOIN public.pessoas pr ON pr.id = a.profissional_id
  LEFT JOIN interno.mv_atrib_receita_sessao r ON r.agendamento_id = a.id
 WHERE a.ativo;
REVOKE ALL ON interno.vw_atrib_sessoes FROM PUBLIC, anon, authenticated;
COMMENT ON VIEW interno.vw_atrib_sessoes IS
  'Cada sessão com presença (fn_atrib_presenca), valor, serviço (sem sufixo DU/FDS), profissional e receita recebida. Base única do Marketing.';

-- ── 3. Conversas de contato novo: canal = 1ª origem conhecida ──────────────
CREATE OR REPLACE FUNCTION interno.fn_atrib_conversas(p_desde date, p_ate date, p_base text)
RETURNS TABLE (
  conversa_id bigint, oportunidade_id bigint, canal text, plataforma text, campanha_id text,
  palavra_chave text, landing_path text, vinculo text, entrada timestamp,
  etapa_maxima text, estado text, origem_declarada text, convenio boolean)
LANGUAGE sql STABLE SET search_path = '' AS $function$
  WITH prim AS (
    SELECT DISTINCT ON (t.conversa_id)
           t.conversa_id, t.oportunidade_id, coalesce(t.canal, 'outro') canal, t.plataforma,
           t.campanha_id, t.palavra_chave, t.landing_path, t.vinculo,
           (t.mensagem_em AT TIME ZONE 'America/Sao_Paulo') entrada
      FROM public.atrib_toques t
     WHERE t.mensagem_em IS NOT NULL
     ORDER BY t.conversa_id, t.mensagem_em, t.id
  ),
  sem_toque AS (  -- contato novo que chegou sem código RK
    SELECT DISTINCT ON (o.conversa_id)
           o.conversa_id, o.id, 'nao_atribuido'::text, NULL::text, NULL::text, NULL::text, NULL::text,
           NULL::text, (o.aberta_em AT TIME ZONE 'America/Sao_Paulo')
      FROM public.atrib_oportunidades o
     WHERE o.contato_novo
       AND NOT EXISTS (SELECT 1 FROM public.atrib_toques t WHERE t.conversa_id = o.conversa_id)
     ORDER BY o.conversa_id, o.aberta_em
  ),
  todas AS (SELECT * FROM prim UNION ALL SELECT * FROM sem_toque)
  SELECT x.conversa_id, x.oportunidade_id, x.canal, x.plataforma, x.campanha_id, x.palavra_chave,
         x.landing_path, x.vinculo, x.entrada, o.etapa_maxima, o.estado,
         (SELECT d.categoria FROM public.atrib_origens_declaradas d WHERE d.conversa_id = x.conversa_id
           ORDER BY (d.fonte = 'humano') DESC, d.registrado_em DESC LIMIT 1),
         EXISTS (SELECT 1 FROM public.atrib_sinais s WHERE s.conversa_id = x.conversa_id AND s.tipo = 'convenio')
    FROM todas x
    LEFT JOIN public.atrib_oportunidades o ON o.id = x.oportunidade_id
   WHERE CASE WHEN p_base = 'atendimento' THEN x.entrada::date <= p_ate
              ELSE x.entrada::date BETWEEN p_desde AND p_ate END
$function$;
REVOKE ALL ON FUNCTION interno.fn_atrib_conversas(date, date, text) FROM PUBLIC, anon, authenticated;

-- ── 4. Pacientes ligadas a essas conversas, com presença e receita ─────────
-- Uma linha por paciente (vale a conversa mais antiga). Base 'aquisicao': todas as
-- sessões desde a 1ª ligada. Base 'atendimento': só sessões dentro do período.
CREATE OR REPLACE FUNCTION interno.fn_atrib_pacientes(p_desde date, p_ate date, p_base text)
RETURNS TABLE (
  paciente_id uuid, conversa_id bigint, tipo_vinculo text, confianca text, nome text,
  ja_era_paciente boolean, primeiro_agendamento timestamptz, presenca text,
  primeira_sessao timestamp, proxima_sessao timestamp,
  confirmadas int, provaveis int, pendentes int, faltas int, futuras int,
  receita_realizada numeric, receita_a_conferir numeric, receita_recebida numeric, receita_agendada numeric,
  servico text, profissional text)
LANGUAGE sql STABLE SET search_path = '' AS $function$
  WITH conv AS (
    SELECT c.* FROM interno.fn_atrib_conversas(p_desde, p_ate, p_base) c
     WHERE coalesce(c.estado, '') <> 'descartada'
  ),
  liga AS (
    SELECT cv.conversa_id, cv.oportunidade_id, a.paciente_id, min(a.data_hora) primeira_ligada,
           min(a.created_at) primeiro_agendamento,
           (array_agg(oa.tipo_vinculo ORDER BY oa.vinculado_em))[1] tipo_vinculo,
           (array_agg(oa.confianca ORDER BY oa.vinculado_em))[1] confianca
      FROM conv cv
      JOIN public.atrib_oportunidade_agendamentos oa ON oa.oportunidade_id = cv.oportunidade_id AND oa.removido_em IS NULL
      JOIN public.agendamentos a ON a.id = oa.agendamento_id
     GROUP BY 1, 2, 3
  ),
  pac AS (
    SELECT DISTINCT ON (l.paciente_id) l.*, cv.entrada
      FROM liga l JOIN conv cv ON cv.conversa_id = l.conversa_id
     ORDER BY l.paciente_id, cv.entrada
  ),
  sess AS (
    SELECT s.*
      FROM pac p
      JOIN interno.vw_atrib_sessoes s ON s.paciente_id = p.paciente_id
       AND s.dh >= (p.primeira_ligada AT TIME ZONE 'UTC')
     WHERE s.presenca NOT IN ('cancelada', 'invalida')
       AND (p_base <> 'atendimento' OR s.dh::date BETWEEN p_desde AND p_ate)
  ),
  agg AS (
    SELECT p.paciente_id, p.conversa_id, p.tipo_vinculo, p.confianca, p.primeiro_agendamento,
           -- Já era paciente = teve sessão realizada (confirmada ou provável) ANTES de a conversa
           -- abrir. Pela data da sessão, não pela criação do agendamento: a recepção lança
           -- sessões na agenda depois que acontecem. Mesma regra de vw_atrib_aquisicoes.
           EXISTS (SELECT 1 FROM interno.vw_atrib_sessoes s0
                    WHERE s0.paciente_id = p.paciente_id AND s0.presenca IN ('confirmada', 'provavel')
                      AND s0.dh < (SELECT o.aberta_em AT TIME ZONE 'America/Sao_Paulo'
                                     FROM public.atrib_oportunidades o WHERE o.id = p.oportunidade_id)) ja_era,
           min(s.dh) FILTER (WHERE s.presenca IN ('confirmada', 'provavel', 'pendente')) primeira_sessao,
           min(s.dh) FILTER (WHERE s.presenca = 'agendada') proxima_sessao,
           count(s.dh) FILTER (WHERE s.presenca = 'confirmada')::int confirmadas,
           count(s.dh) FILTER (WHERE s.presenca = 'provavel')::int provaveis,
           count(s.dh) FILTER (WHERE s.presenca = 'pendente')::int pendentes,
           count(s.dh) FILTER (WHERE s.presenca = 'falta')::int faltas,
           count(s.dh) FILTER (WHERE s.presenca = 'agendada')::int futuras,
           coalesce(sum(s.valor) FILTER (WHERE s.presenca IN ('confirmada', 'falta')), 0) receita_realizada,
           coalesce(sum(s.valor) FILTER (WHERE s.presenca IN ('provavel', 'pendente')), 0) receita_a_conferir,
           coalesce(sum(s.recebida), 0) receita_recebida,
           coalesce(sum(s.valor) FILTER (WHERE s.presenca = 'agendada'), 0) receita_agendada,
           (array_agg(s.servico ORDER BY s.dh) FILTER (WHERE s.dh IS NOT NULL))[1] servico,
           (array_agg(s.profissional ORDER BY s.dh) FILTER (WHERE s.dh IS NOT NULL))[1] profissional
      FROM pac p
      LEFT JOIN sess s ON s.paciente_id = p.paciente_id
     GROUP BY p.paciente_id, p.conversa_id, p.oportunidade_id, p.tipo_vinculo, p.confianca, p.primeiro_agendamento
  )
  SELECT g.paciente_id, g.conversa_id, g.tipo_vinculo, g.confianca, pe.nome, g.ja_era, g.primeiro_agendamento,
         CASE WHEN g.confirmadas > 0 THEN 'confirmada'
              WHEN g.provaveis > 0 THEN 'provavel'
              WHEN g.pendentes > 0 THEN 'pendente'
              WHEN g.futuras > 0 THEN 'agendada'
              WHEN g.faltas > 0 THEN 'falta'
              ELSE 'sem_sessao' END,
         g.primeira_sessao, g.proxima_sessao, g.confirmadas, g.provaveis, g.pendentes, g.faltas, g.futuras,
         g.receita_realizada, g.receita_a_conferir, g.receita_recebida, g.receita_agendada, g.servico, g.profissional
    FROM agg g
    LEFT JOIN public.pessoas pe ON pe.id = g.paciente_id
$function$;
REVOKE ALL ON FUNCTION interno.fn_atrib_pacientes(date, date, text) FROM PUBLIC, anon, authenticated;

-- Mesma regra de trafegoDe() em src/lib/marketing-atribuicao.ts — mudou lá, mude aqui.
CREATE OR REPLACE FUNCTION interno.fn_atrib_canal_ok(p_canal text, p_filtro text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $function$
  SELECT p_filtro IS NULL OR p_filtro = 'todos'
      OR CASE p_filtro
           WHEN 'tipo:pago' THEN p_canal IN ('google_ads', 'meta_ads')
           WHEN 'tipo:sem_origem' THEN p_canal IS NULL OR p_canal IN ('nao_atribuido', 'desconhecido')
           WHEN 'tipo:organico' THEN p_canal IS NOT NULL
                AND p_canal NOT IN ('google_ads', 'meta_ads', 'nao_atribuido', 'desconhecido')
           ELSE p_canal = p_filtro
         END
$function$;
REVOKE ALL ON FUNCTION interno.fn_atrib_canal_ok(text, text) FROM PUBLIC, anon, authenticated;

