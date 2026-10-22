-- =====================================================================
-- Ju (MVP) — conteúdo da base + dados vindos do sistema
-- =====================================================================
-- AI dev note: NÃO APLICADA (aguarda revisão). Depende de ju_mvp.sql.
-- Valores e regras de contrato NÃO ficam escritos na base: vêm do sistema
-- (tipo_servicos e contract_templates), para um reajuste ou contrato novo
-- valer na hora, sem mexer no prompt.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Base de conhecimento
-- ---------------------------------------------------------------------
INSERT INTO public.ju_conhecimento (id, categoria, texto) VALUES
('SERVICOS_GERAIS', 'SERVICOS',
 'A Respira Kids é uma clínica de fisioterapia pediátrica em Brasília, especializada no atendimento de recém-nascidos, bebês e crianças. Os principais cuidados são fisioterapia respiratória, desenvolvimento motor, torcicolo em bebês e assimetrias cranianas, como plagiocefalia e braquicefalia. Também há atendimento domiciliar no Plano Piloto e regiões próximas.'),
('FISIOTERAPIA_RESPIRATORIA', 'SERVICOS',
 'A Respira Kids realiza fisioterapia respiratória pediátrica para bebês e crianças. O atendimento pode fazer parte do cuidado em situações como bronquiolite, bronquite, sibilância, pneumonia, acúmulo de secreção e infecções respiratórias de repetição. A necessidade e a conduta são avaliadas individualmente pela fisioterapeuta. A Ju não deve diagnosticar nem dizer que a criança precisa de fisioterapia apenas pelos sintomas relatados no WhatsApp.'),
('DESENVOLVIMENTO_MOTOR', 'SERVICOS',
 'A Respira Kids acompanha o desenvolvimento motor de bebês e crianças, incluindo aquisição e evolução de habilidades como controle da cabeça, rolar, sentar, engatinhar, ficar em pé e andar. Quando a família relata uma preocupação com o desenvolvimento, a Ju pode explicar o serviço e encaminhar para avaliação, mas não deve concluir pelo WhatsApp se existe ou não atraso motor.'),
('TORCICOLO', 'SERVICOS',
 'A Respira Kids realiza avaliação e fisioterapia para bebês com torcicolo congênito ou preferência persistente por olhar para um lado. A avaliação presencial permite entender o movimento do bebê e definir a conduta adequada. A Ju pode orientar a família sobre o serviço e solicitar agendamento, mas não deve diagnosticar torcicolo pelo WhatsApp.'),
('ASSIMETRIA_CRANIANA', 'SERVICOS',
 'A Respira Kids realiza avaliação e acompanhamento de assimetrias cranianas em bebês, incluindo plagiocefalia e braquicefalia. A avaliação considera o formato da cabeça, mobilidade, posicionamento e desenvolvimento do bebê. A Ju não deve classificar a gravidade nem interpretar medidas ou fotos como diagnóstico.'),
('ATENDIMENTO_DOMICILIAR', 'SERVICOS',
 'A Respira Kids também realiza atendimento domiciliar no Plano Piloto e em regiões próximas. A disponibilidade e a região atendida precisam ser confirmadas pela equipe no momento da solicitação. O valor do atendimento domiciliar é o da tabela de serviços enviada pelo sistema.'),
('EQUIPE', 'SERVICOS',
 'A equipe de fisioterapeutas da Respira Kids é formada por Beatriz Perisse, Bruna Cury Lourenço Peres, Flávia da Silva Pacheco e Jeniffer Marjory. A Ju pode dizer quem faz parte da equipe, mas não promete qual profissional vai atender nem disponibilidade de horário: isso é definido pela secretaria no agendamento.'),
('VALORES', 'FINANCEIRO',
 'Os valores dos atendimentos vêm da tabela de serviços enviada pelo sistema em cada conversa. A Ju informa somente os valores dessa tabela, sem arredondar nem estimar. Se o serviço não estiver na tabela, ou se a família pedir pacote, desconto ou condição especial, a Ju encaminha para a secretaria.'),
('FORMAS_PAGAMENTO', 'FINANCEIRO',
 'A Respira Kids aceita pagamento em dinheiro, PIX e cartão. Os valores da tabela de serviços são para pagamento via PIX; no cartão de crédito ou débito há acréscimo das taxas da operadora, conforme o contrato. Quando houver uma cobrança vinculada ao paciente, a Ju só pode informar os dados financeiros disponíveis para aquele responsável e deve utilizar o link de pagamento fornecido pelo sistema da Respira Kids. Cobrança sem link do sistema é encaminhada ao financeiro.'),
('CONVENIO', 'CONVENIO_REEMBOLSO',
 'A Respira Kids não atende diretamente por convênios ou planos de saúde. Os atendimentos são particulares.'),
('REEMBOLSO', 'CONVENIO_REEMBOLSO',
 'Algumas famílias conseguem solicitar reembolso ao próprio plano de saúde. A Respira Kids fornece a documentação necessária para a solicitação de reembolso. A aprovação, o percentual e as regras do reembolso dependem exclusivamente do plano de saúde da família, por isso a Ju não deve prometer que o reembolso será aprovado nem informar um valor de reembolso sem documentação do próprio plano.'),
('ENDERECO', 'LOCALIZACAO',
 'A Respira Kids fica na SEPS 709/909, Centro Médico Júlio Adnet, Bloco A, Sala 311, Asa Sul, Brasília-DF, CEP 70390-095.'),
('TELEFONE', 'CONTATO',
 'O telefone e WhatsApp da Respira Kids é (61) 99131-0529.'),
('HORARIO_FUNCIONAMENTO', 'HORARIOS',
 'O horário regular da Respira Kids é de segunda a sexta-feira, das 8h às 19h. Aos finais de semana e feriados podem existir atendimentos emergenciais em horários específicos, sempre sujeitos à disponibilidade da equipe. A Ju não deve prometer disponibilidade ou horário.'),
('DURACAO_SESSAO', 'ATENDIMENTO',
 'As sessões têm duração média de 45 minutos. O tempo pode variar conforme a necessidade e a condição da criança.'),
('AGENDAMENTO', 'ATENDIMENTO',
 'Os atendimentos da Respira Kids são previamente agendados. A Ju pode entender a necessidade da família, identificar o paciente e coletar preferência de dia ou período, mas não confirma nem cria horários. A solicitação é encaminhada para a secretaria concluir o agendamento.'),
('REMARCACAO_CANCELAMENTO', 'POLITICAS',
 'Pedidos de remarcação ou cancelamento são encaminhados para a secretaria. As regras de antecedência, multa e falta sem aviso são as dos termos do contrato vigente enviados pelo sistema em cada conversa. A Ju pode explicar essas regras citando o contrato, mas não promete isenção nem decide exceções.'),
('ATESTADO_COMPARECIMENTO', 'DOCUMENTOS',
 'A Ju pode gerar atestado de comparecimento somente em nome do responsável identificado pelo número do WhatsApp e somente para consultas já realizadas de um paciente vinculado a esse responsável. Pedido em outro nome, para outra pessoa, para consulta não realizada ou com qualquer alteração no texto é encaminhado para a secretaria.')
ON CONFLICT (id) DO UPDATE
   SET categoria = EXCLUDED.categoria, texto = EXCLUDED.texto, ativo = true, updated_at = now();


-- ---------------------------------------------------------------------
-- 2. Tabela de serviços e valores (do sistema; SOCIAL e valor zero fora)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_servicos()
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('servico', s.nome, 'valor', s.valor) ORDER BY s.nome), '[]'::jsonb)
  FROM (
    SELECT regexp_replace(regexp_replace(
             btrim(regexp_replace(ts.nome, '\s+', ' ', 'g')),
             '\s*-\s*DU$', ' (dias úteis)'),
             '\s*-\s*FDS$', ' (fins de semana e feriados)') AS nome,
           ts.valor
    FROM public.tipo_servicos ts
    WHERE ts.ativo AND ts.valor > 0 AND ts.nome !~* 'social'
  ) s;
$$;


-- ---------------------------------------------------------------------
-- 3. Termos do contrato vigente que interessam ao atendimento
--    (cancelamento, remarcação, falta, antecedência, reajuste, pagamento,
--    reembolso, rescisão). Sempre do contrato ativo: mudou o contrato,
--    mudou a resposta.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_termos_contrato()
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH contrato AS (
    SELECT conteudo_template
    FROM public.contract_templates
    WHERE ativo AND template_principal_id IS NULL
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  )
  SELECT coalesce(jsonb_agg(t.trecho ORDER BY t.ord), '[]'::jsonb)
  FROM (
    SELECT x.ord,
           left(btrim(regexp_replace(regexp_replace(regexp_replace(x.linha,
             '\*\*', '', 'g'), '\{\{[^}]*\}\}', '[dado do cliente]', 'g'), '\s+', ' ', 'g')), 1500) AS trecho
    FROM contrato,
         regexp_split_to_table(contrato.conteudo_template, '\n') WITH ORDINALITY AS x(linha, ord)
    WHERE x.linha ~* '(cancel|remarc|reagend|falta|no-show|comparec|anteced|reajust|pagament|reembols|rescis|multa)'
  ) t;
$$;


-- ---------------------------------------------------------------------
-- 4. Contexto do cliente (mesma função, com dois acréscimos):
--    - responsavel_identificado: nome completo quando o telefone aponta
--      para exatamente uma pessoa (base do atestado);
--    - atendimentos_realizados: consultas finalizadas dos últimos 60 dias,
--      para quem tem agenda (base do atestado).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ju_contexto_cliente(p_conversa_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH conv AS (
    SELECT telefone, substr(telefone, 2) AS t13,
           CASE WHEN telefone ~ '^\+55[0-9]{2}9[0-9]{8}$' THEN substr(telefone, 2, 4) || substr(telefone, 7) END AS t12
    FROM public.ju_conversas WHERE id = p_conversa_id
  ),
  resp AS (                       -- pessoas dona(s) do telefone
    SELECT p.id, p.nome, t.codigo
    FROM conv JOIN public.pessoas p ON p.telefone::text IN (conv.t13, conv.t12)
    JOIN public.pessoa_tipos t ON t.id = p.id_tipo_pessoa
    WHERE p.ativo
      AND (t.codigo = 'responsavel'
           OR (t.codigo = 'paciente' AND p.data_nascimento <= current_date - interval '18 years'))
  ),
  escopo AS (                     -- paciente + finalidades
    SELECT x.paciente_id, bool_or(x.agenda) AS agenda, bool_or(x.financeiro) AS financeiro
    FROM (
      SELECT pr.id_pessoa AS paciente_id,
             pr.tipo_responsabilidade IN ('legal','ambos') AS agenda,
             pr.tipo_responsabilidade IN ('financeiro','ambos') AS financeiro
      FROM resp JOIN public.pessoa_responsaveis pr ON pr.id_responsavel = resp.id
      WHERE pr.ativo AND (pr.data_fim IS NULL OR pr.data_fim >= current_date)
      UNION ALL
      -- quem paga também vê o financeiro, mesmo vinculado só como "legal"
      SELECT pac.id, false, true
      FROM resp JOIN public.pessoas pac ON pac.responsavel_cobranca_id = resp.id
      UNION ALL
      SELECT id, true, true FROM resp WHERE codigo = 'paciente'
    ) x
    JOIN public.pessoas pac ON pac.id = x.paciente_id AND pac.ativo
    GROUP BY x.paciente_id
  )
  SELECT jsonb_build_object(
    'identificado', EXISTS (SELECT 1 FROM resp),
    'responsaveis', coalesce((SELECT jsonb_agg(split_part(btrim(nome), ' ', 1)) FROM resp), '[]'::jsonb),
    'responsavel_identificado', CASE WHEN (SELECT count(*) FROM resp) = 1 THEN (SELECT nome FROM resp) END,
    'pacientes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'paciente_id', pac.id,
        'nome', pac.nome,
        'idade_meses', (extract(year FROM age(pac.data_nascimento)) * 12
                        + extract(month FROM age(pac.data_nascimento)))::int,
        'acesso_agenda', e.agenda,
        'acesso_financeiro', e.financeiro,
        'proximas_consultas', CASE WHEN e.agenda THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'data_hora', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM HH24:MI'),
                   'servico', ts.nome,
                   'profissional', split_part(btrim(prof.nome), ' ', 1)) ORDER BY a.data_hora)
          FROM public.agendamentos a
          JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
          LEFT JOIN public.tipo_servicos ts ON ts.id = a.tipo_servico_id
          LEFT JOIN public.pessoas prof ON prof.id = a.profissional_id
          WHERE a.paciente_id = pac.id AND a.ativo AND cs.codigo IN ('agendado','confirmado')
            AND a.data_hora >= (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'
            AND a.data_hora <  (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC' + interval '60 days'),
          '[]'::jsonb) END,
        'atendimentos_realizados', CASE WHEN e.agenda THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'agendamento_id', a.id,
                   'data', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM/YYYY'),
                   'periodo', CASE WHEN extract(hour FROM a.data_hora AT TIME ZONE 'UTC') < 12
                                   THEN 'matutino' ELSE 'vespertino' END,
                   'profissional', split_part(btrim(prof.nome), ' ', 1)) ORDER BY a.data_hora DESC)
          FROM public.agendamentos a
          JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
          LEFT JOIN public.pessoas prof ON prof.id = a.profissional_id
          WHERE a.paciente_id = pac.id AND a.ativo AND cs.codigo = 'finalizado'
            AND a.data_hora >= (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC' - interval '60 days'
            AND a.data_hora <  (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'),
          '[]'::jsonb) END,
        'contrato', CASE WHEN e.agenda THEN (
          SELECT uc.status_contrato FROM public.user_contracts uc
          WHERE uc.pessoa_id = pac.id AND uc.ativo
          ORDER BY uc.data_geracao DESC NULLS LAST LIMIT 1) END,
        'cobrancas_em_aberto', CASE WHEN e.financeiro THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object(
                   'descricao', cp.descricao, 'valor', cp.valor, 'vencimento', cp.vencimento,
                   'situacao', cp.situacao,
                   -- só o link do nosso app; fatura direta do Asaas vai ao financeiro
                   'link', CASE WHEN cp.token IS NOT NULL
                                THEN 'https://app.respirakidsbrasilia.com.br/#/pagamento/' || cp.token END))
          FROM public.vw_cobrancas_pendentes cp WHERE cp.paciente_id = pac.id), '[]'::jsonb) END,
        'pagamentos_ultimos_45_dias', CASE WHEN e.financeiro THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object('valor', f.valor_total,
                                              'data', (f.pago_em AT TIME ZONE 'UTC')::date))
          FROM public.faturas f
          WHERE f.paciente_id = pac.id AND f.ativo AND f.status = 'pago'
            AND f.pago_em > now() - interval '45 days'), '[]'::jsonb) END
      ) ORDER BY pac.nome)
      FROM escopo e JOIN public.pessoas pac ON pac.id = e.paciente_id), '[]'::jsonb)
  );
$$;


-- ---------------------------------------------------------------------
-- 5. Assinaturas das profissionais (atestado). Uma linha por profissional
--    com assinatura; para habilitar outra profissional basta subir a
--    imagem no bucket respira-documents e inserir a linha aqui.
--    Fonte única pretendida também para a tela de atestado do app
--    (hoje AttendanceStatementGenerator.PROFESSIONALS ainda é fixo).
-- ---------------------------------------------------------------------
CREATE TABLE public.profissional_assinaturas (
  pessoa_id      uuid PRIMARY KEY REFERENCES public.pessoas(id) ON DELETE CASCADE,
  nome_exibicao  text NOT NULL,                       -- como aparece no atestado
  arquivo        text NOT NULL,                       -- imagem no bucket respira-documents
  titulo         text NOT NULL DEFAULT 'Fisioterapeuta',
  crefito        text,                                -- texto exibido, ex.: CREFITO 167135-F
  ativo          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profissional_assinaturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY profissional_assinaturas_staff_le ON public.profissional_assinaturas
  FOR SELECT TO authenticated USING ((SELECT public.fn_rls_staff_completo()));
CREATE POLICY profissional_assinaturas_admin_escreve ON public.profissional_assinaturas
  FOR ALL TO authenticated
  USING ((SELECT public.fn_rls_admin_aprovado_ativo()))
  WITH CHECK ((SELECT public.fn_rls_admin_aprovado_ativo()));
REVOKE ALL ON public.profissional_assinaturas FROM anon;

-- As três assinaturas que existem hoje no bucket (mesmos dados da tela do app).
INSERT INTO public.profissional_assinaturas (pessoa_id, nome_exibicao, arquivo, crefito)
SELECT v.pessoa_id, v.nome_exibicao, v.arquivo, v.crefito
FROM (VALUES
  ('c4883f76-d010-4fb4-ac5b-248914e56e6e'::uuid, 'Bruna Cury',      'Bruna Cury.png',      'CREFITO 167135-F'),
  ('2b1da16a-4294-47c0-b8c1-3f1595590332'::uuid, 'Flavia Pacheco',  'Flavia Pacheco.png',  NULL),
  ('b3e954bf-02dd-4821-aa58-aa4fb34c3e02'::uuid, 'Beatriz Perisse', 'Beatriz Perisse.png', NULL)
) AS v(pessoa_id, nome_exibicao, arquivo, crefito)
WHERE EXISTS (SELECT 1 FROM public.pessoas p WHERE p.id = v.pessoa_id)
ON CONFLICT (pessoa_id) DO NOTHING;


-- ---------------------------------------------------------------------
-- 6. Dados do atestado de comparecimento. A IA só escolhe o agendamento
--    (da lista atendimentos_realizados); aqui se confere tudo de novo:
--    - gate (versão e conversa ATIVA), como em fn_ju_escalar;
--    - o telefone aponta para exatamente UM responsável, que é o nome do
--      atestado (nunca outro nome);
--    - esse responsável tem agenda (legal/ambos) do paciente da consulta;
--    - consulta finalizada, nos últimos 60 dias;
--    - a profissional da consulta tem assinatura cadastrada.
--    Qualquer falha devolve ok=false + motivo e a Ju encaminha à secretaria.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.fn_ju_atestado_dados(p_conversa_id bigint, p_versao bigint, p_agendamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c        public.ju_conversas;
  v_ctx    jsonb;
  v_pac    jsonb;
  v_resp   text;
  a        record;
  v_assin  jsonb;
BEGIN
  SELECT * INTO c FROM public.ju_conversas WHERE id = p_conversa_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'CONVERSA_INEXISTENTE');
  ELSIF c.message_version <> p_versao THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'MENSAGEM_NOVA');
  ELSIF c.status <> 'ATIVA' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', c.status);
  END IF;

  v_ctx  := public.fn_ju_contexto_cliente(p_conversa_id);
  v_resp := v_ctx ->> 'responsavel_identificado';
  IF v_resp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'RESPONSAVEL_NAO_IDENTIFICADO');
  END IF;

  -- o agendamento precisa estar na lista que o próprio telefone enxerga
  SELECT p INTO v_pac
  FROM jsonb_array_elements(v_ctx -> 'pacientes') p
  WHERE (p -> 'acesso_agenda')::boolean
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(p -> 'atendimentos_realizados') r
                WHERE (r ->> 'agendamento_id')::uuid = p_agendamento_id)
  LIMIT 1;
  IF v_pac IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'AGENDAMENTO_FORA_DO_ESCOPO');
  END IF;

  SELECT ag.data_hora, ag.profissional_id INTO a
  FROM public.agendamentos ag
  WHERE ag.id = p_agendamento_id;

  -- assinatura da profissional que atendeu a consulta (tabela acima)
  SELECT jsonb_build_object('nome', pa.nome_exibicao, 'arquivo', pa.arquivo,
                            'titulo', pa.titulo, 'crefito', coalesce(pa.crefito, ''))
    INTO v_assin
  FROM public.profissional_assinaturas pa
  WHERE pa.pessoa_id = a.profissional_id AND pa.ativo;
  IF v_assin IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'PROFISSIONAL_SEM_ASSINATURA');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'agendamento_id', p_agendamento_id,
    'paciente_id', v_pac ->> 'paciente_id',
    'paciente_nome', v_pac ->> 'nome',
    'responsavel_nome', v_resp,
    'data_consulta', to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM/YYYY'),
    'periodo', CASE WHEN extract(hour FROM a.data_hora AT TIME ZONE 'UTC') < 12 THEN 'matutino' ELSE 'vespertino' END,
    'data_emissao', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
    'assinatura', v_assin);
END;
$$;


-- Só a service_role (n8n) executa.
REVOKE ALL ON FUNCTION
  public.fn_ju_servicos(),
  public.fn_ju_termos_contrato(),
  public.fn_ju_atestado_dados(bigint, bigint, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.fn_ju_servicos(),
  public.fn_ju_termos_contrato(),
  public.fn_ju_atestado_dados(bigint, bigint, uuid)
TO service_role;
-- fn_ju_contexto_cliente: CREATE OR REPLACE mantém os privilégios já ajustados em ju_mvp.sql
