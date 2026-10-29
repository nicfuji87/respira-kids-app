-- ATENÇÃO: este arquivo é a primeira versão. Em produção foram aplicados por
-- cima os ajustes de conversas_central_ajustes.sql, e fn_conversas_desempenho /
-- fn_conversas_qualidade foram recriadas com exclusão de números de teste e da
-- equipe (fn_conversas_ids_teste), faixas de espera corrigidas e mais campos na
-- comparação semanal. A definição vigente é a do banco
-- (pg_get_functiondef); use-a como base em qualquer alteração.
--
-- Central de Conversas (28/10/2026): a seção /conversas deixa de ser relatório da
-- IA e vira central de ação + gestão. Tudo agregado no banco (antes a tela baixava
-- ~2 MB e calculava no navegador).
--
--   fn_conversas_hoje()               prioridades da equipe, com responsável e motivo
--   fn_conversas_tarefa(...)          assumir / resolver; resolver atualiza o estado
--                                     operacional de origem (follow-up, pedido da Ju)
--   fn_conversas_desempenho(dias)     atendimento por MENSAGEM (ju_mensagens, desde
--                                     16/10/2026), funil real com a agenda, Ju
--   fn_conversas_qualidade(dias)      atrito categorizado, falhas da operação,
--                                     automação por família, sentimento
--
-- Regras de medida (decididas com o dono):
--  * pedido = bloco de mensagens da família depois da última resposta (equipe ou
--    Ju). Mensagem automática não conta como resposta. Só "ok/obrigada" ou só
--    clique de botão não é pedido.
--  * tempo de resposta = do início do bloco até a primeira resposta da equipe ou
--    da Ju. Mostrar mediana E pior 10% (a média engana).
--  * expediente = seg a sex, 8h às 18h de Brasília.

-- =====================================================================
-- Auxiliares
-- =====================================================================

-- Chave de telefone que ignora DDI, +, máscara e o nono dígito: DDD + 8 finais.
CREATE OR REPLACE FUNCTION public.fn_tel_chave(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE WHEN length(d) >= 10
              THEN left(CASE WHEN d LIKE '55%' AND length(d) >= 12 THEN substr(d, 3) ELSE d END, 2) || right(d, 8)
         END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS d) x;
$$;

CREATE OR REPLACE FUNCTION public.fn_conversas_expediente(p timestamptz)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT extract(isodow FROM p AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
     AND (p AT TIME ZONE 'America/Sao_Paulo')::time >= time '08:00'
     AND (p AT TIME ZONE 'America/Sao_Paulo')::time < time '18:00';
$$;

-- "ok", "obrigada", emoji: não é pedido.
CREATE OR REPLACE FUNCTION public.fn_conversas_eh_reconhecimento(p text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT p IS NULL
      OR length(btrim(p)) = 0
      OR (length(btrim(p)) <= 40 AND lower(btrim(p)) ~
          '^(ok+|okay|obrigad[oa]s?|muito obrigad[oa]|obg|valeu|vlw|blz|beleza|certo|perfeito|combinado|t[aá] bom|show|top|joia|j[oó]ia|ótimo|otimo|amém|amem|de nada|bom dia|boa tarde|boa noite|tudo bem|👍|🙏|❤️|😊|🥰|😍|👏)[\s!.,😊🙏👍❤️🥰😍👏]*$');
$$;

-- Categoria de um ponto de atrito (texto livre da IA) por regra fixa.
-- interna = falha da operação da clínica (não do cliente nem do mercado).
CREATE OR REPLACE FUNCTION public.fn_conversas_categoria_atrito(p text)
RETURNS TABLE (categoria text, interna boolean)
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT c, c IN ('cobranca_indevida', 'contrato', 'nota_fiscal', 'pagamento_sistema', 'cobranca_tardia', 'cadastro', 'automacao')
  FROM (SELECT CASE
    WHEN t ~ '(j[aá] (havia |tinha )?(pag|quit)|ap[oó]s (o )?pagamento|depois (do|de ter) pag|duplicad|duplicidade|contest|cobran[cç]as? (autom[aá]ticas? )?(recorrent|repetid|indevid)|baixa n[aã]o|n[aã]o (foi )?baixad|lembretes? autom[aá]tic[oa]s? de (cobran|fatura))' THEN 'cobranca_indevida'
    WHEN t ~ '(fatura|cobran[cç]a) (enviada|gerada|chegou) .*(m[eê]s|semanas) (ap[oó]s|depois)|cobran[cç]a tardia|envio tardio' THEN 'cobranca_tardia'
    WHEN t ~ '(contrato|assinatura|assinafy)' THEN 'contrato'
    WHEN t ~ '(nota fiscal|\mnf\M|nfs|\mrps\M|reembolso)' THEN 'nota_fiscal'
    WHEN t ~ '(link|pix n[aã]o|parcel|cart[aã]o|forma de pagamento|chave pix|qr ?code|boleto)' THEN 'pagamento_sistema'
    WHEN t ~ '(cadastro|formul[aá]rio)' THEN 'cadastro'
    WHEN t ~ '(mensage(m|ns) autom[aá]tic|aviso autom[aá]tic|alerta autom[aá]tic|assistente virtual|\mia\M em teste|rob[oô])' THEN 'automacao'
    WHEN t ~ '(demor|sem (resposta|retorno)|n[aã]o (respond|retorn)|esquec|ficou perdid|aguardando retorno|v[aá]rias mensagens)' THEN 'demora_resposta'
    WHEN t ~ '(hor[aá]rio|agenda|encaixe|remarc|vaga|disponibilidade|fila de espera|lista de espera)' THEN 'agenda'
    WHEN t ~ '(pre[cç]o|valor|caro|desconto|or[cç]amento|plano de sa[uú]de|conv[eê]nio)' THEN 'preco_convenio'
    WHEN t ~ '(atras(o|ou) (no|do) atendimento|recep[cç][aã]o|estacionamento|endere[cç]o)' THEN 'presencial'
    ELSE 'outros' END AS c
  FROM (SELECT lower(coalesce(p, '')) AS t) x) y;
$$;

CREATE OR REPLACE FUNCTION public.fn_conversas_label_categoria(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE p
    WHEN 'cobranca_indevida' THEN 'Cobrança indevida'
    WHEN 'cobranca_tardia' THEN 'Cobrança tardia'
    WHEN 'contrato' THEN 'Contrato'
    WHEN 'nota_fiscal' THEN 'Nota fiscal / reembolso'
    WHEN 'pagamento_sistema' THEN 'Link ou forma de pagamento'
    WHEN 'cadastro' THEN 'Cadastro'
    WHEN 'automacao' THEN 'Mensagem automática'
    WHEN 'demora_resposta' THEN 'Demora para responder'
    WHEN 'agenda' THEN 'Agenda e horários'
    WHEN 'preco_convenio' THEN 'Preço ou convênio'
    WHEN 'presencial' THEN 'Atendimento presencial'
    ELSE 'Outros' END;
$$;

CREATE OR REPLACE FUNCTION public.fn_conversas_checar_acesso()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT (session_user = 'postgres' OR public.fn_rls_admin_secretaria_ativo()) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Pedidos das famílias (blocos) a partir das mensagens.
CREATE OR REPLACE FUNCTION public.fn_conversas_pedidos(p_inicio timestamptz, p_fim timestamptz)
RETURNS TABLE (
  conversa_id bigint, inicio timestamptz, ultima_cliente timestamptz, msgs_cliente int,
  resposta_em timestamptz, respondido_por text, minutos numeric, expediente boolean, repetiu boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH m AS (
    SELECT x.conversa_id, x.origem, x.tipo, x.created_at, x.conteudo,
           lag(x.origem) OVER (PARTITION BY x.conversa_id ORDER BY x.created_at, x.id) AS anterior
    FROM public.ju_mensagens x
    WHERE x.origem IN ('CLIENTE', 'HUMANO', 'JU')
      AND x.created_at >= p_inicio - interval '3 days' AND x.created_at < p_fim + interval '3 days'
  ),
  marcado AS (
    SELECT m.*, sum(CASE WHEN m.origem = 'CLIENTE' AND m.anterior IS DISTINCT FROM 'CLIENTE' THEN 1 ELSE 0 END)
                  OVER (PARTITION BY m.conversa_id ORDER BY m.created_at ROWS UNBOUNDED PRECEDING) AS bloco
    FROM m
  ),
  blocos AS (
    SELECT conversa_id, bloco,
           min(created_at) FILTER (WHERE origem = 'CLIENTE') AS inicio,
           max(created_at) FILTER (WHERE origem = 'CLIENTE') AS ultima_cliente,
           count(*) FILTER (WHERE origem = 'CLIENTE')::int AS n,
           bool_and(origem <> 'CLIENTE' OR tipo = 'BOTAO' OR public.fn_conversas_eh_reconhecimento(conteudo)) AS so_reconhecimento,
           min(created_at) FILTER (WHERE origem IN ('HUMANO', 'JU')) AS resposta_em
    FROM marcado
    WHERE bloco > 0
    GROUP BY conversa_id, bloco
  )
  SELECT b.conversa_id, b.inicio, b.ultima_cliente, b.n, b.resposta_em,
         (SELECT x.origem FROM public.ju_mensagens x
           WHERE x.conversa_id = b.conversa_id AND x.created_at = b.resposta_em AND x.origem IN ('HUMANO', 'JU') LIMIT 1),
         round(extract(epoch FROM (b.resposta_em - b.inicio)) / 60.0, 1),
         public.fn_conversas_expediente(b.inicio),
         (b.n >= 2 AND b.ultima_cliente - b.inicio > interval '30 minutes')
  FROM blocos b
  WHERE NOT b.so_reconhecimento
    AND b.inicio >= p_inicio AND b.inicio < p_fim;
$$;

-- =====================================================================
-- Tarefas do painel (assumir / resolver)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.conversas_tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('familia_aguardando', 'pedido_ju', 'followup', 'reclamacao', 'lead')),
  ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('assumida', 'resolvida')),
  resultado text CHECK (resultado IN ('respondeu', 'agendou', 'resolveu', 'perdeu', 'nao_se_aplica')),
  observacao text,
  atividade_ref timestamptz,
  assumida_por uuid REFERENCES public.pessoas(id),
  assumida_por_nome text,
  assumida_em timestamptz,
  resolvida_por uuid REFERENCES public.pessoas(id),
  resolvida_por_nome text,
  resolvida_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, ref)
);
ALTER TABLE public.conversas_tarefas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversas_tarefas_staff_select ON public.conversas_tarefas;
CREATE POLICY conversas_tarefas_staff_select ON public.conversas_tarefas
  FOR SELECT TO authenticated USING ((SELECT public.fn_rls_admin_secretaria_ativo()));
REVOKE ALL ON public.conversas_tarefas FROM anon, authenticated;
GRANT SELECT ON public.conversas_tarefas TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_conversas_tarefa(
  p_tipo text, p_ref text, p_acao text,
  p_resultado text DEFAULT NULL, p_observacao text DEFAULT NULL, p_atividade timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_pessoa uuid;
  v_nome text;
  v_id text := split_part(p_ref, ':', 2);
BEGIN
  PERFORM public.fn_conversas_checar_acesso();
  SELECT p.id, p.nome INTO v_pessoa, v_nome FROM public.pessoas p WHERE p.auth_user_id = auth.uid();

  IF p_acao = 'assumir' THEN
    INSERT INTO public.conversas_tarefas (tipo, ref, status, assumida_por, assumida_por_nome, assumida_em)
    VALUES (p_tipo, p_ref, 'assumida', v_pessoa, v_nome, now())
    ON CONFLICT (tipo, ref) DO UPDATE
      SET status = 'assumida', assumida_por = v_pessoa, assumida_por_nome = v_nome, assumida_em = now(),
          resultado = NULL, resolvida_em = NULL, resolvida_por = NULL, resolvida_por_nome = NULL, atualizado_em = now();
    RETURN jsonb_build_object('ok', true);
  ELSIF p_acao = 'soltar' THEN
    DELETE FROM public.conversas_tarefas WHERE tipo = p_tipo AND ref = p_ref AND status = 'assumida';
    RETURN jsonb_build_object('ok', true);
  ELSIF p_acao <> 'resolver' THEN
    RAISE EXCEPTION 'ação inválida: %', p_acao;
  END IF;

  IF p_resultado NOT IN ('respondeu', 'agendou', 'resolveu', 'perdeu', 'nao_se_aplica') THEN
    RAISE EXCEPTION 'resultado inválido: %', p_resultado;
  END IF;

  -- Resolver atualiza o estado de origem: uma tarefa resolvida aqui some também
  -- da fila de onde veio (senão viram duas ferramentas divergentes).
  IF p_tipo = 'pedido_ju' THEN
    UPDATE public.ju_solicitacoes
       SET status = 'RESOLVIDA', resolvida_em = now(),
           resolvida_por = 'painel Conversas (' || coalesce(split_part(btrim(v_nome), ' ', 1), 'equipe') || ')'
     WHERE id = v_id::bigint AND status = 'ABERTA';
  ELSIF p_tipo IN ('followup', 'reclamacao') THEN
    UPDATE public.whatsapp_conversas
       SET followup_status = CASE WHEN p_resultado IN ('perdeu', 'nao_se_aplica') THEN 'ignorado' ELSE 'concluido' END,
           followup_concluido_em = now(), followup_concluido_por = v_pessoa,
           followup_motivo = 'Resolvido no painel: ' || p_resultado
                             || CASE WHEN nullif(btrim(p_observacao), '') IS NOT NULL THEN ' (' || left(btrim(p_observacao), 200) || ')' ELSE '' END
     WHERE id = v_id::uuid;
  END IF;

  INSERT INTO public.conversas_tarefas (tipo, ref, status, resultado, observacao, atividade_ref,
                                        resolvida_por, resolvida_por_nome, resolvida_em)
  VALUES (p_tipo, p_ref, 'resolvida', p_resultado, nullif(btrim(p_observacao), ''), coalesce(p_atividade, now()),
          v_pessoa, v_nome, now())
  ON CONFLICT (tipo, ref) DO UPDATE
    SET status = 'resolvida', resultado = EXCLUDED.resultado, observacao = EXCLUDED.observacao,
        atividade_ref = EXCLUDED.atividade_ref, resolvida_por = v_pessoa, resolvida_por_nome = v_nome,
        resolvida_em = now(), atualizado_em = now();
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- =====================================================================
-- Oportunidades comerciais (leads que não agendaram), com pontuação
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_conversas_oportunidades()
RETURNS TABLE (
  id uuid, nome text, telefone text, chatwoot_id text, pontos int, motivo text, resumo text,
  ultima_mensagem_em timestamptz, cadastrado boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH base AS (
    SELECT w.*, coalesce(w.ultima_mensagem_em, w.created_at) AS ult,
           array(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(to_jsonb(w.pacientes_vinculados)) x) AS pacs
    FROM public.vw_whatsapp_conversas_enriquecidas w
    WHERE coalesce(w.ultima_mensagem_em, w.created_at) > now() - interval '60 days'
      AND (w.lead_quente OR w.perguntou_valor OR w.perguntou_disponibilidade
           OR w.intencao_principal IN ('agendamento', 'avaliacao', 'duvida_valor'))
      AND NOT w.cancelamento_detectado
      AND coalesce(w.resumo, '') !~* '(desist|outr[ao] (cl[ií]nica|lugar|profissional)|n[aã]o tem (mais )?interesse|sem interesse|j[aá] (agendou|marcou) (em|com) outr)'
  )
  SELECT b.id,
         coalesce(b.pessoa_vinculada_nome, b.contato_nome),
         b.contato_telefone,
         b.chatwoot_conversa_id,
         ( CASE WHEN b.lead_quente THEN 35 ELSE 0 END
         + CASE WHEN b.perguntou_disponibilidade THEN 20 ELSE 0 END
         + CASE WHEN b.perguntou_valor THEN 10 ELSE 0 END
         + CASE WHEN b.intencao_principal IN ('agendamento', 'avaliacao') THEN 10 ELSE 0 END
         + CASE WHEN b.ult > now() - interval '7 days' THEN 30
                WHEN b.ult > now() - interval '21 days' THEN 20
                WHEN b.ult > now() - interval '40 days' THEN 10 ELSE 0 END
         + CASE WHEN b.ultima_mensagem_remetente = 'cliente' THEN 10 ELSE 0 END
         + CASE WHEN b.cliente_cadastrado THEN 5 ELSE 0 END
         - CASE WHEN b.sentimento_cliente IN ('frustrado', 'negativo') THEN 25 ELSE 0 END )::int,
         concat_ws(' · ',
           CASE WHEN b.lead_quente THEN 'interesse claro' END,
           CASE WHEN b.perguntou_disponibilidade THEN 'pediu horário' END,
           CASE WHEN b.perguntou_valor THEN 'perguntou valor' END,
           CASE WHEN b.ultima_mensagem_remetente = 'cliente' THEN 'última mensagem foi da família' END,
           CASE WHEN b.cliente_cadastrado THEN 'já é cadastrada' END),
         b.resumo, b.ult, b.cliente_cadastrado
  FROM base b
  WHERE NOT EXISTS (
          SELECT 1 FROM public.agendamentos a
          WHERE a.paciente_id = ANY (b.pacs) AND a.ativo AND a.created_at >= b.ult - interval '30 days')
    AND NOT EXISTS (
          SELECT 1 FROM public.conversas_tarefas t
          WHERE t.tipo = 'lead' AND t.ref = 'lead:' || b.id AND t.status = 'resolvida'
            AND (t.resultado IN ('perdeu', 'agendou', 'nao_se_aplica') OR t.atividade_ref >= b.ult));
$$;

-- =====================================================================
-- HOJE
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_conversas_hoje()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_itens jsonb := '[]'::jsonb;
  v_kpis jsonb;
  v_agora timestamptz := now();
BEGIN
  PERFORM public.fn_conversas_checar_acesso();

  WITH
  tarefa AS (SELECT * FROM public.conversas_tarefas),
  wc AS (
    SELECT DISTINCT ON (public.fn_tel_chave(w.contato_telefone))
           public.fn_tel_chave(w.contato_telefone) AS chave, w.id, w.contato_nome, w.chatwoot_conversa_id
    FROM public.whatsapp_conversas w
    WHERE w.contato_telefone IS NOT NULL
    ORDER BY public.fn_tel_chave(w.contato_telefone), w.updated_at DESC
  ),
  -- 1) Família esperando resposta (última fala é dela, sem resposta da equipe nem da Ju)
  aguardando AS (
    SELECT c.id AS conversa_id, c.telefone, c.nome_whatsapp, b.inicio, b.ultima, b.texto, b.n
    FROM public.ju_conversas c
    CROSS JOIN LATERAL (
      SELECT max(x.created_at) AS ult_resp FROM public.ju_mensagens x
      WHERE x.conversa_id = c.id AND x.origem IN ('HUMANO', 'JU')) r
    CROSS JOIN LATERAL (
      SELECT min(x.created_at) AS inicio, max(x.created_at) AS ultima, count(*) AS n,
             (array_agg(x.conteudo ORDER BY x.created_at DESC) FILTER (WHERE x.tipo <> 'BOTAO'))[1] AS texto,
             bool_and(x.tipo = 'BOTAO' OR public.fn_conversas_eh_reconhecimento(x.conteudo)) AS so_rec
      FROM public.ju_mensagens x
      WHERE x.conversa_id = c.id AND x.origem = 'CLIENTE' AND x.created_at > coalesce(r.ult_resp, '-infinity')) b
    WHERE b.inicio IS NOT NULL AND b.ultima > v_agora - interval '3 days' AND NOT b.so_rec
      AND NOT EXISTS (SELECT 1 FROM public.ju_solicitacoes s WHERE s.conversa_id = c.id AND s.status = 'ABERTA')
  ),
  i_aguardando AS (
    SELECT jsonb_build_object(
      'tipo', 'familia_aguardando', 'ref', 'ju:' || a.conversa_id,
      'prioridade', CASE WHEN a.inicio < v_agora - interval '2 hours' THEN 'alta'
                         WHEN a.inicio < v_agora - interval '30 minutes' THEN 'media' ELSE 'baixa' END,
      'responsavel', 'Recepção',
      'titulo', 'Família esperando resposta',
      'descricao', left(regexp_replace(coalesce(a.texto, '(mídia ou botão)'), '\s+', ' ', 'g'), 180),
      'evidencia', a.n || CASE WHEN a.n = 1 THEN ' mensagem' ELSE ' mensagens' END || ' sem resposta da equipe nem da Ju',
      'desde', a.inicio, 'atividade', a.ultima,
      'nome', coalesce(wc.contato_nome, a.nome_whatsapp, 'Contato sem nome'),
      'telefone', regexp_replace(a.telefone, '\D', '', 'g'),
      'chatwoot_id', wc.chatwoot_conversa_id,
      'tarefa', (SELECT jsonb_build_object('status', t.status, 'por', t.assumida_por_nome, 'em', t.assumida_em)
                 FROM tarefa t WHERE t.tipo = 'familia_aguardando' AND t.ref = 'ju:' || a.conversa_id AND t.status = 'assumida')
    ) AS item
    FROM aguardando a
    LEFT JOIN wc ON wc.chave = public.fn_tel_chave(a.telefone)
    WHERE NOT EXISTS (SELECT 1 FROM tarefa t WHERE t.tipo = 'familia_aguardando' AND t.ref = 'ju:' || a.conversa_id
                        AND t.status = 'resolvida' AND t.atividade_ref >= a.ultima)
  ),
  -- 2) Pedidos abertos pela Ju
  i_pedidos AS (
    SELECT jsonb_build_object(
      'tipo', 'pedido_ju', 'ref', 'pedido:' || s.id,
      'prioridade', CASE WHEN s.urgente OR s.created_at < v_agora - interval '24 hours' THEN 'alta'
                         WHEN s.created_at < v_agora - interval '4 hours' THEN 'media' ELSE 'baixa' END,
      'responsavel', CASE s.tipo WHEN 'FINANCEIRO' THEN 'Financeiro' WHEN 'NOTA_FISCAL' THEN 'Financeiro'
                                 WHEN 'CLINICO' THEN 'Fisioterapeutas' WHEN 'RECLAMACAO' THEN 'Gestão' ELSE 'Recepção' END,
      'titulo', 'Pedido registrado pela Ju: ' || CASE s.tipo WHEN 'AGENDAMENTO' THEN 'agendamento' WHEN 'REMARCACAO' THEN 'remarcação'
                 WHEN 'CANCELAMENTO' THEN 'cancelamento' WHEN 'FINANCEIRO' THEN 'financeiro' WHEN 'NOTA_FISCAL' THEN 'nota fiscal'
                 WHEN 'CLINICO' THEN 'dúvida clínica' WHEN 'CONTRATO' THEN 'contrato' WHEN 'RECLAMACAO' THEN 'reclamação'
                 WHEN 'HUMANO' THEN 'quer falar com alguém' WHEN 'CADASTRO' THEN 'cadastro' ELSE lower(s.tipo) END,
      'descricao', left(coalesce(s.resumo, ''), 220),
      'evidencia', CASE WHEN s.urgente THEN 'Marcado como urgente pela Ju' ELSE 'Aberto pela Ju' END
                   || CASE WHEN s.lembretes > 0 THEN ' · ' || s.lembretes || ' lembrete(s) no grupo' ELSE '' END,
      'desde', s.created_at, 'atividade', s.created_at,
      'nome', coalesce(wc.contato_nome, c.nome_whatsapp, (SELECT p.nome FROM public.pessoas p WHERE p.id = s.paciente_id), 'Contato sem nome'),
      'telefone', regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'),
      'chatwoot_id', wc.chatwoot_conversa_id,
      'paciente_id', s.paciente_id,
      'tarefa', (SELECT jsonb_build_object('status', t.status, 'por', t.assumida_por_nome, 'em', t.assumida_em)
                 FROM tarefa t WHERE t.tipo = 'pedido_ju' AND t.ref = 'pedido:' || s.id AND t.status = 'assumida')
    ) AS item
    FROM public.ju_solicitacoes s
    LEFT JOIN public.ju_conversas c ON c.id = s.conversa_id
    LEFT JOIN wc ON wc.chave = public.fn_tel_chave(c.telefone)
    WHERE s.status = 'ABERTA' AND s.tipo <> 'EXTERNO'
  ),
  -- 3) Cobranças em conferência (resolvidas na tela de Cobranças)
  i_cobranca AS (
    SELECT jsonb_build_object(
      'tipo', 'cobranca', 'ref', 'susp:' || s.id,
      'prioridade', CASE WHEN s.status = 'escalada' OR s.prazo_verificacao < v_agora THEN 'alta' ELSE 'media' END,
      'responsavel', 'Financeiro',
      'titulo', 'Conferir pagamento: ' || CASE s.motivo WHEN 'pagamento_informado' THEN 'família diz que pagou'
                 WHEN 'pagamento_fora_asaas' THEN 'pagou fora do link' WHEN 'contestacao' THEN 'família contesta'
                 WHEN 'duplicidade' THEN 'possível duplicidade' ELSE 'outro motivo' END,
      'descricao', coalesce(s.detalhe, '') ,
      'evidencia', 'Lembretes parados · ' || public.fn_brl(coalesce(f.valor_total, pl.valor_base))
                   || ' · conferir até ' || to_char(s.prazo_verificacao AT TIME ZONE 'America/Sao_Paulo', 'DD/MM'),
      'desde', s.criado_em, 'atividade', s.criado_em,
      'nome', coalesce((SELECT p.nome FROM public.pessoas p WHERE p.id = s.responsavel_cobranca_id), 'Responsável'),
      'telefone', (SELECT p.telefone::text FROM public.pessoas p WHERE p.id = s.responsavel_cobranca_id),
      'paciente_id', s.paciente_id,
      'link_interno', '/cobrancas'
    ) AS item
    FROM public.cobranca_suspensoes s
    LEFT JOIN public.faturas f ON f.id = s.fatura_id
    LEFT JOIN public.pagamento_links pl ON pl.id = s.pagamento_link_id
    WHERE s.status IN ('ativa', 'escalada')
  ),
  -- 4) Follow-ups e reclamações (fila da análise de conversas)
  fila AS (
    SELECT w.*, coalesce(w.ultima_mensagem_em, w.created_at) AS ult,
           (w.reclamacao_identificada AND coalesce(w.ultima_mensagem_em, w.created_at) > v_agora - interval '30 days') AS eh_reclamacao
    FROM public.whatsapp_conversas w
    WHERE (w.necessita_followup AND w.followup_status = 'pendente')
       OR (w.reclamacao_identificada AND coalesce(w.ultima_mensagem_em, w.created_at) > v_agora - interval '30 days'
           AND w.followup_status NOT IN ('concluido', 'ignorado', 'resolvido_sistema'))
  ),
  i_fila AS (
    SELECT jsonb_build_object(
      'tipo', CASE WHEN f.eh_reclamacao THEN 'reclamacao' ELSE 'followup' END,
      'ref', CASE WHEN f.eh_reclamacao THEN 'reclamacao:' ELSE 'followup:' END || f.id,
      'prioridade', CASE
          WHEN f.eh_reclamacao AND (f.requer_atencao_admin OR f.nivel_insatisfacao IN ('medio', 'alto')) THEN 'alta'
          WHEN f.followup_motivo = 'Há fatura paga sem nota fiscal' THEN 'alta'
          WHEN f.ultima_mensagem_remetente = 'cliente' AND f.ult > v_agora - interval '3 days' THEN 'alta'
          WHEN f.prazo_followup IN ('hoje', '24h') AND f.ult > v_agora - interval '7 days' THEN 'media'
          ELSE 'baixa' END,
      'responsavel', CASE WHEN f.eh_reclamacao THEN 'Gestão'
          ELSE CASE f.responsavel_sugerido WHEN 'financeiro' THEN 'Financeiro' WHEN 'fisioterapeuta' THEN 'Fisioterapeutas'
                    WHEN 'medico_ou_triagem' THEN 'Fisioterapeutas' WHEN 'gestao' THEN 'Gestão' ELSE 'Recepção' END END,
      'titulo', CASE WHEN f.eh_reclamacao THEN 'Reclamação: ' || coalesce(lower(left(f.motivo_insatisfacao, 90)), 'insatisfação')
          ELSE CASE f.followup_tipo_acao WHEN 'nota_fiscal' THEN 'Nota fiscal pendente' WHEN 'pagamento' THEN 'Pagamento a conferir'
                    WHEN 'agenda' THEN 'Retorno sobre agenda' WHEN 'cancelamento' THEN 'Confirmar cancelamento'
                    WHEN 'contrato' THEN 'Contrato pendente' WHEN 'valor' THEN 'Responder sobre valores'
                    ELSE 'Ação pendente na conversa' END END,
      'descricao', left(coalesce(f.acao_recomendada, f.resumo, ''), 220),
      'evidencia', coalesce(f.followup_motivo, 'Indicado pela análise da conversa'),
      'desde', f.ult, 'atividade', f.ult,
      'nome', coalesce(f.contato_nome, 'Contato sem nome'),
      'telefone', f.contato_telefone,
      'chatwoot_id', f.chatwoot_conversa_id,
      'tarefa', (SELECT jsonb_build_object('status', t.status, 'por', t.assumida_por_nome, 'em', t.assumida_em)
                 FROM tarefa t WHERE t.ref = CASE WHEN f.eh_reclamacao THEN 'reclamacao:' ELSE 'followup:' END || f.id
                   AND t.status = 'assumida')
    ) AS item
    FROM fila f
    WHERE NOT EXISTS (SELECT 1 FROM tarefa t
                      WHERE t.ref = CASE WHEN f.eh_reclamacao THEN 'reclamacao:' ELSE 'followup:' END || f.id
                        AND t.status = 'resolvida' AND t.atividade_ref >= f.ult)
  ),
  -- 5) Oportunidades (as 10 mais fortes)
  i_leads AS (
    SELECT jsonb_build_object(
      'tipo', 'lead', 'ref', 'lead:' || o.id,
      'prioridade', CASE WHEN o.pontos >= 80 THEN 'alta' WHEN o.pontos >= 60 THEN 'media' ELSE 'baixa' END,
      'responsavel', 'Recepção',
      'titulo', 'Oportunidade: interessou-se e não agendou',
      'descricao', left(coalesce(o.resumo, ''), 220),
      'evidencia', o.motivo || ' · ' || o.pontos || ' pontos',
      'desde', o.ultima_mensagem_em, 'atividade', o.ultima_mensagem_em,
      'nome', coalesce(o.nome, 'Contato sem nome'),
      'telefone', o.telefone, 'chatwoot_id', o.chatwoot_id, 'pontos', o.pontos,
      'tarefa', (SELECT jsonb_build_object('status', t.status, 'por', t.assumida_por_nome, 'em', t.assumida_em)
                 FROM tarefa t WHERE t.tipo = 'lead' AND t.ref = 'lead:' || o.id AND t.status = 'assumida')
    ) AS item
    FROM (SELECT * FROM public.fn_conversas_oportunidades() WHERE pontos >= 50 ORDER BY pontos DESC, ultima_mensagem_em DESC LIMIT 10) o
  )
  SELECT coalesce(jsonb_agg(item), '[]'::jsonb) INTO v_itens
  FROM (SELECT item FROM i_aguardando UNION ALL SELECT item FROM i_pedidos UNION ALL SELECT item FROM i_cobranca
        UNION ALL SELECT item FROM i_fila UNION ALL SELECT item FROM i_leads) u;

  SELECT jsonb_build_object(
    'familias_aguardando', count(*) FILTER (WHERE x ->> 'tipo' = 'familia_aguardando'),
    'familias_aguardando_2h', count(*) FILTER (WHERE x ->> 'tipo' = 'familia_aguardando' AND x ->> 'prioridade' = 'alta'),
    'pedidos_ju', count(*) FILTER (WHERE x ->> 'tipo' = 'pedido_ju'),
    'financeiro', count(*) FILTER (WHERE x ->> 'responsavel' = 'Financeiro'),
    'cobrancas_conferencia', count(*) FILTER (WHERE x ->> 'tipo' = 'cobranca'),
    'reclamacoes', count(*) FILTER (WHERE x ->> 'tipo' = 'reclamacao'),
    'oportunidades', (SELECT count(*) FROM public.fn_conversas_oportunidades() WHERE pontos >= 50),
    'em_revisao', (SELECT count(*) FROM public.whatsapp_conversas WHERE followup_status = 'em_revisao'),
    'recuperados_30d', (SELECT count(*) FROM public.conversas_tarefas t
                        WHERE t.tipo = 'lead' AND t.resultado = 'agendou' AND t.resolvida_em > v_agora - interval '30 days'),
    'alta', count(*) FILTER (WHERE x ->> 'prioridade' = 'alta'),
    'gerado_em', v_agora)
  INTO v_kpis
  FROM jsonb_array_elements(v_itens) x;

  RETURN jsonb_build_object('kpis', v_kpis, 'itens', v_itens);
END;
$$;

-- =====================================================================
-- DESEMPENHO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_conversas_desempenho(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_fim timestamptz := now();
  v_ini timestamptz := now() - make_interval(days => p_dias);
  v_ini_ant timestamptz := now() - make_interval(days => 2 * p_dias);
  v_desde timestamptz := (SELECT min(created_at) FROM public.ju_mensagens);
  v_res jsonb;
BEGIN
  PERFORM public.fn_conversas_checar_acesso();

  CREATE TEMP TABLE IF NOT EXISTS _cv_ped ON COMMIT DROP AS
    SELECT * FROM public.fn_conversas_pedidos(now(), now()) LIMIT 0;
  TRUNCATE _cv_ped;
  INSERT INTO _cv_ped SELECT * FROM public.fn_conversas_pedidos(v_ini_ant, v_fim);

  WITH
  per AS (SELECT 'atual' AS p, v_ini AS ini, v_fim AS fim UNION ALL SELECT 'anterior', v_ini_ant, v_ini),
  kpis AS (
    SELECT per.p,
      jsonb_build_object(
        'familias', (SELECT count(DISTINCT m.conversa_id) FROM public.ju_mensagens m
                     WHERE m.origem = 'CLIENTE' AND m.created_at >= per.ini AND m.created_at < per.fim),
        'pedidos', count(x.*),
        'respondidos', count(x.resposta_em),
        'mediana_min', percentile_cont(0.5) WITHIN GROUP (ORDER BY x.minutos) FILTER (WHERE x.resposta_em IS NOT NULL),
        'p90_min', percentile_cont(0.9) WITHIN GROUP (ORDER BY x.minutos) FILTER (WHERE x.resposta_em IS NOT NULL),
        'mediana_expediente_min', percentile_cont(0.5) WITHIN GROUP (ORDER BY x.minutos) FILTER (WHERE x.resposta_em IS NOT NULL AND x.expediente),
        'mediana_fora_min', percentile_cont(0.5) WITHIN GROUP (ORDER BY x.minutos) FILTER (WHERE x.resposta_em IS NOT NULL AND NOT x.expediente),
        'pct_15min', round(100.0 * count(*) FILTER (WHERE x.minutos <= 15) / nullif(count(x.*), 0)),
        'pct_1h', round(100.0 * count(*) FILTER (WHERE x.minutos <= 60) / nullif(count(x.*), 0)),
        'sem_resposta', count(*) FILTER (WHERE x.resposta_em IS NULL AND x.inicio < v_fim - interval '1 hour'),
        'pct_ju', round(100.0 * count(*) FILTER (WHERE x.respondido_por = 'JU') / nullif(count(x.resposta_em), 0)),
        'repetiram', count(*) FILTER (WHERE x.repetiu),
        'fora_expediente', round(100.0 * count(*) FILTER (WHERE NOT x.expediente) / nullif(count(x.*), 0))
      ) AS k
    FROM per LEFT JOIN _cv_ped x ON x.inicio >= per.ini AND x.inicio < per.fim
    GROUP BY per.p, per.ini, per.fim
  ),
  dias AS (
    SELECT d::date AS dia FROM generate_series((v_ini AT TIME ZONE 'America/Sao_Paulo')::date,
                                              (v_fim AT TIME ZONE 'America/Sao_Paulo')::date, interval '1 day') d
  ),
  volume AS (
    SELECT jsonb_agg(jsonb_build_object(
             'dia', d.dia,
             'familia', coalesce(v.cliente, 0), 'equipe', coalesce(v.humano, 0),
             'ju', coalesce(v.ju, 0), 'automacao', coalesce(v.automacao, 0)) ORDER BY d.dia) AS j
    FROM dias d
    LEFT JOIN (
      SELECT (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
             count(*) FILTER (WHERE m.origem = 'CLIENTE') AS cliente,
             count(*) FILTER (WHERE m.origem = 'HUMANO') AS humano,
             count(*) FILTER (WHERE m.origem = 'JU') AS ju,
             count(*) FILTER (WHERE m.origem = 'AUTOMACAO') AS automacao
      FROM public.ju_mensagens m WHERE m.created_at >= v_ini AND m.created_at < v_fim
      GROUP BY 1) v ON v.dia = d.dia
  ),
  calor AS (
    SELECT jsonb_agg(jsonb_build_object('dow', dow, 'hora', hora, 'pedidos', n, 'mediana_min', med)) AS j
    FROM (
      SELECT extract(isodow FROM x.inicio AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
             extract(hour FROM x.inicio AT TIME ZONE 'America/Sao_Paulo')::int AS hora,
             count(*) AS n,
             round(percentile_cont(0.5) WITHIN GROUP (ORDER BY x.minutos) FILTER (WHERE x.resposta_em IS NOT NULL)::numeric, 0) AS med
      FROM _cv_ped x WHERE x.inicio >= v_ini GROUP BY 1, 2) c
  ),
  faixas AS (
    SELECT jsonb_agg(jsonb_build_object('faixa', faixa, 'ordem', ordem, 'expediente', exp, 'fora', fora) ORDER BY ordem) AS j
    FROM (
      SELECT f.faixa, f.ordem,
             count(x.*) FILTER (WHERE x.expediente) AS exp,
             count(x.*) FILTER (WHERE NOT x.expediente) AS fora
      FROM (VALUES ('até 5 min', 1, 0, 5), ('5 a 15 min', 2, 5, 15), ('15 a 60 min', 3, 15, 60),
                   ('1 a 4 h', 4, 60, 240), ('4 a 24 h', 5, 240, 1440), ('mais de 24 h', 6, 1440, 1e9),
                   ('sem resposta', 7, NULL, NULL)) f(faixa, ordem, de, ate)
      LEFT JOIN _cv_ped x ON x.inicio >= v_ini AND (
             (f.de IS NULL AND x.resposta_em IS NULL)
          OR (f.de IS NOT NULL AND x.resposta_em IS NOT NULL AND x.minutos > f.de AND x.minutos <= f.ate)
          OR (f.de = 0 AND x.resposta_em IS NOT NULL AND x.minutos = 0))
      GROUP BY f.faixa, f.ordem) z
  ),
  -- Funil comercial: contatos que começaram a conversar no período
  coorte AS (
    SELECT w.id, w.lead_quente, w.perguntou_valor, w.perguntou_disponibilidade, w.intencao_principal,
           w.cliente_cadastrado, coalesce(w.iniciada_em, w.created_at) AS ini,
           array(SELECT (x ->> 'id')::uuid FROM jsonb_array_elements(to_jsonb(w.pacientes_vinculados)) x) AS pacs
    FROM public.vw_whatsapp_conversas_enriquecidas w
    WHERE coalesce(w.iniciada_em, w.created_at) >= v_ini AND coalesce(w.iniciada_em, w.created_at) < v_fim
  ),
  coorte2 AS (
    SELECT c.*,
      NOT EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.paciente_id = ANY (c.pacs) AND a.ativo
                    AND a.data_hora < (c.ini AT TIME ZONE 'America/Sao_Paulo') - interval '1 day') AS novo,
      (SELECT count(*) FROM public.agendamentos a WHERE a.paciente_id = ANY (c.pacs) AND a.ativo
         AND a.created_at >= c.ini - interval '1 day') AS agendados,
      (SELECT count(*) FROM public.agendamentos a JOIN public.consulta_status cs ON cs.id = a.status_consulta_id
        WHERE a.paciente_id = ANY (c.pacs) AND a.ativo AND a.created_at >= c.ini - interval '1 day'
          AND a.data_hora < (now() AT TIME ZONE 'America/Sao_Paulo')
          AND cs.codigo IN ('agendado', 'confirmado', 'finalizado')) AS realizados
    FROM coorte c
  ),
  funil AS (
    SELECT jsonb_build_object(
      'contatos_novos', count(*) FILTER (WHERE novo),
      'interessados', count(*) FILTER (WHERE novo AND (lead_quente OR perguntou_valor OR perguntou_disponibilidade
                                                       OR intencao_principal IN ('agendamento', 'avaliacao', 'duvida_valor'))),
      'cadastrados', count(*) FILTER (WHERE novo AND cliente_cadastrado),
      'agendaram', count(*) FILTER (WHERE novo AND agendados > 0),
      'atendidos', count(*) FILTER (WHERE novo AND realizados > 0),
      'voltaram', count(*) FILTER (WHERE novo AND realizados >= 2)) AS j
    FROM coorte2
  ),
  motivos AS (
    SELECT jsonb_agg(jsonb_build_object('intencao', i, 'total', n) ORDER BY n DESC) AS j
    FROM (SELECT coalesce(w.intencao_principal, 'outros') AS i, count(*) AS n
          FROM public.whatsapp_conversas w
          WHERE coalesce(w.ultima_mensagem_em, w.created_at) >= v_ini
          GROUP BY 1) z
  ),
  ju AS (
    SELECT jsonb_build_object(
      'pedidos_respondidos', (SELECT count(*) FROM _cv_ped x WHERE x.inicio >= v_ini AND x.respondido_por = 'JU'),
      'encaminhados', (SELECT count(*) FROM public.ju_solicitacoes s WHERE s.created_at >= v_ini AND s.tipo <> 'EXTERNO'),
      'encaminhados_por_tipo', (SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'total', n) ORDER BY n DESC)
                                FROM (SELECT s.tipo, count(*) AS n FROM public.ju_solicitacoes s
                                      WHERE s.created_at >= v_ini GROUP BY 1) z),
      'acoes', (SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'ok', ok, 'falhou', falhou) ORDER BY ok DESC)
                FROM (SELECT a.tipo, count(*) FILTER (WHERE a.status IN ('OK', 'CONCLUIDA')) AS ok,
                             count(*) FILTER (WHERE a.status IN ('FALHOU', 'ESCALADA')) AS falhou
                      FROM public.ju_acoes a WHERE a.created_at >= v_ini GROUP BY 1) z),
      'resolvidos_automaticamente', (SELECT count(*) FROM public.ju_solicitacoes s
                                     WHERE s.created_at >= v_ini AND s.resolvida_por LIKE 'automático%'),
      'tempo_ate_resolver_h', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM s.resolvida_em - s.created_at) / 3600))::numeric, 1)
                               FROM public.ju_solicitacoes s WHERE s.created_at >= v_ini AND s.resolvida_em IS NOT NULL)
    ) AS j
  ),
  semana AS (
    SELECT jsonb_build_object(
      'reclamacoes', (SELECT count(*) FROM public.whatsapp_conversas w WHERE w.reclamacao_identificada AND w.ultima_mensagem_em >= now() - interval '7 days'),
      'reclamacoes_ant', (SELECT count(*) FROM public.whatsapp_conversas w WHERE w.reclamacao_identificada AND w.ultima_mensagem_em >= now() - interval '14 days' AND w.ultima_mensagem_em < now() - interval '7 days'),
      'cobrancas_pausadas', (SELECT count(*) FROM public.cobranca_suspensoes s WHERE s.criado_em >= now() - interval '7 days'),
      'cobrancas_pausadas_ant', (SELECT count(*) FROM public.cobranca_suspensoes s WHERE s.criado_em >= now() - interval '14 days' AND s.criado_em < now() - interval '7 days'),
      'recuperados', (SELECT count(*) FROM public.conversas_tarefas t WHERE t.tipo = 'lead' AND t.resultado = 'agendou' AND t.resolvida_em >= now() - interval '7 days'),
      'tarefas_resolvidas', (SELECT count(*) FROM public.conversas_tarefas t WHERE t.status = 'resolvida' AND t.resolvida_em >= now() - interval '7 days'),
      'mediana_min', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x.minutos) FROM _cv_ped x WHERE x.resposta_em IS NOT NULL AND x.inicio >= now() - interval '7 days'),
      'mediana_min_ant', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x.minutos) FROM _cv_ped x WHERE x.resposta_em IS NOT NULL AND x.inicio >= now() - interval '14 days' AND x.inicio < now() - interval '7 days'),
      'sem_resposta', (SELECT count(*) FROM _cv_ped x WHERE x.resposta_em IS NULL AND x.inicio >= now() - interval '7 days' AND x.inicio < now() - interval '1 hour'),
      'sem_resposta_ant', (SELECT count(*) FROM _cv_ped x WHERE x.resposta_em IS NULL AND x.inicio >= now() - interval '14 days' AND x.inicio < now() - interval '7 days'),
      'principal_atrito', (SELECT public.fn_conversas_label_categoria(c.categoria)
                           FROM public.whatsapp_conversas w,
                                LATERAL jsonb_array_elements_text(coalesce(w.pontos_de_atrito, '[]'::jsonb)) a,
                                LATERAL public.fn_conversas_categoria_atrito(a) c
                           WHERE w.ultima_mensagem_em >= now() - interval '7 days' AND c.categoria <> 'outros'
                           GROUP BY c.categoria ORDER BY count(DISTINCT w.id) DESC LIMIT 1)
    ) AS j
  )
  SELECT jsonb_build_object(
    'periodo_dias', p_dias,
    'mensagens_desde', v_desde,
    'historico_limitado', v_ini < v_desde,
    'kpis', (SELECT jsonb_object_agg(p, k) FROM kpis),
    'volume', (SELECT j FROM volume),
    'calor', coalesce((SELECT j FROM calor), '[]'::jsonb),
    'faixas', (SELECT j FROM faixas),
    'funil', (SELECT j FROM funil),
    'motivos', coalesce((SELECT j FROM motivos), '[]'::jsonb),
    'ju', (SELECT j FROM ju),
    'semana', (SELECT j FROM semana)
  ) INTO v_res;

  RETURN v_res;
END;
$$;

-- =====================================================================
-- QUALIDADE
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_conversas_qualidade(p_dias integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_ini timestamptz := now() - make_interval(days => p_dias);
  v_res jsonb;
BEGIN
  PERFORM public.fn_conversas_checar_acesso();

  WITH
  atr AS (
    SELECT w.id, w.contato_nome, w.reclamacao_identificada, coalesce(w.ultima_mensagem_em, w.created_at) AS ult,
           c.categoria, c.interna, a AS texto
    FROM public.whatsapp_conversas w
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements_text(coalesce(w.pontos_de_atrito, '[]'::jsonb)) AS a
      UNION ALL SELECT w.motivo_insatisfacao WHERE w.reclamacao_identificada AND w.motivo_insatisfacao IS NOT NULL) t
    CROSS JOIN LATERAL public.fn_conversas_categoria_atrito(t.a) c
  ),
  janela AS (SELECT * FROM atr WHERE ult >= v_ini),
  cats AS (
    SELECT jsonb_agg(jsonb_build_object(
             'categoria', categoria, 'label', public.fn_conversas_label_categoria(categoria),
             'interna', interna, 'familias', fam, 'reclamacoes', rec) ORDER BY fam DESC) AS j
    FROM (SELECT categoria, bool_or(interna) AS interna, count(DISTINCT id) AS fam,
                 count(DISTINCT id) FILTER (WHERE reclamacao_identificada) AS rec
          FROM janela GROUP BY categoria) z
  ),
  por_familia AS (
    SELECT id, count(*) FILTER (WHERE interna) AS internas, count(DISTINCT categoria) FILTER (WHERE interna) AS cats_internas
    FROM janela GROUP BY id
  ),
  mensal AS (
    SELECT jsonb_agg(jsonb_build_object('mes', mes, 'internas', internas, 'outras', outras) ORDER BY mes) AS j
    FROM (
      SELECT to_char(date_trunc('month', m.mes), 'YYYY-MM') AS mes,
             count(DISTINCT a.id) FILTER (WHERE a.interna) AS internas,
             count(DISTINCT a.id) FILTER (WHERE NOT a.interna AND a.categoria <> 'outros') AS outras
      FROM generate_series(date_trunc('month', now() - interval '5 months'), date_trunc('month', now()), interval '1 month') m(mes)
      LEFT JOIN atr a ON date_trunc('month', a.ult AT TIME ZONE 'America/Sao_Paulo') = m.mes
      GROUP BY m.mes) z
  ),
  pausas AS (
    SELECT jsonb_build_object(
      'criadas', count(*),
      'abertas', count(*) FILTER (WHERE s.status IN ('ativa', 'escalada')),
      'vencidas', count(*) FILTER (WHERE s.status = 'escalada'),
      'pagamento_confirmado', count(*) FILTER (WHERE s.resultado = 'pagamento_confirmado'),
      'divida_confirmada', count(*) FILTER (WHERE s.resultado = 'divida_confirmada'),
      'horas_ate_resolver', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM s.encerrada_em - s.criado_em) / 3600)
                                   FILTER (WHERE s.encerrada_em IS NOT NULL))::numeric, 1)
    ) AS j
    FROM public.cobranca_suspensoes s WHERE s.criado_em >= v_ini
  ),
  auto_msgs AS (
    SELECT m.conversa_id, m.created_at,
      CASE WHEN m.conteudo ~* '(fatura|cobran|pagamento|\mpix\M|vencid|em aberto)' THEN 'cobranca'
           WHEN m.conteudo ~* '(contrato|assin)' THEN 'contrato'
           WHEN m.conteudo ~* '(nota fiscal|\mnfs?\M)' THEN 'nota_fiscal'
           WHEN m.conteudo ~* '(pesquisa|avalia[cç][aã]o|como foi|de 0 a 10)' THEN 'pesquisa'
           WHEN m.conteudo ~* '(lembrete|consulta|sess[aã]o|agend|confirm|amanh[aã]|hor[aá]rio)' THEN 'agenda'
           WHEN m.tipo = 'DOCUMENT' THEN 'documento'
           ELSE 'outros' END AS assunto
    FROM public.ju_mensagens m
    WHERE m.origem = 'AUTOMACAO' AND m.created_at >= greatest(v_ini, now() - interval '30 days')
  ),
  auto_sem AS (
    SELECT conversa_id, date_trunc('week', created_at) AS semana, count(*) AS n
    FROM auto_msgs GROUP BY 1, 2
  ),
  automacao AS (
    SELECT jsonb_build_object(
      'janela_dias', least(p_dias, 30),
      'mensagens', (SELECT count(*) FROM auto_msgs),
      'familias', (SELECT count(DISTINCT conversa_id) FROM auto_msgs),
      'mediana_por_familia_semana', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n) FROM auto_sem),
      'familias_5mais_semana', (SELECT count(DISTINCT conversa_id) FROM auto_sem WHERE n >= 5),
      'por_assunto', (SELECT jsonb_agg(jsonb_build_object('assunto', assunto, 'total', n) ORDER BY n DESC)
                      FROM (SELECT assunto, count(*) AS n FROM auto_msgs GROUP BY 1) z),
      'mais_recebem', (SELECT jsonb_agg(z ORDER BY z.n DESC) FROM (
                         SELECT coalesce(w.contato_nome, c.nome_whatsapp, 'Contato') AS nome, count(*) AS n,
                                string_agg(DISTINCT a.assunto, ', ') AS assuntos
                         FROM auto_msgs a JOIN public.ju_conversas c ON c.id = a.conversa_id
                         LEFT JOIN LATERAL (SELECT w.contato_nome FROM public.whatsapp_conversas w
                                            WHERE public.fn_tel_chave(w.contato_telefone) = public.fn_tel_chave(c.telefone)
                                            ORDER BY w.updated_at DESC LIMIT 1) w ON true
                         WHERE a.created_at >= now() - interval '7 days'
                         GROUP BY 1 ORDER BY 2 DESC LIMIT 5) z)
    ) AS j
  ),
  sentimento AS (
    SELECT jsonb_agg(jsonb_build_object('semana', to_char(s.semana, 'YYYY-MM-DD'), 'total', s.total,
                                        'negativo', s.neg, 'preocupado', s.preoc) ORDER BY s.semana) AS j
    FROM (
      SELECT g.semana, count(w.id) AS total,
             count(w.id) FILTER (WHERE w.sentimento_cliente IN ('frustrado', 'negativo')) AS neg,
             count(w.id) FILTER (WHERE w.sentimento_cliente IN ('preocupado', 'ansioso')) AS preoc
      FROM generate_series(date_trunc('week', now() - interval '11 weeks'), date_trunc('week', now()), interval '1 week') g(semana)
      LEFT JOIN public.whatsapp_conversas w ON date_trunc('week', w.ultima_mensagem_em) = g.semana
      GROUP BY g.semana) s
  ),
  recentes AS (
    SELECT jsonb_agg(z ORDER BY z.ult DESC) AS j FROM (
      SELECT w.id, coalesce(w.contato_nome, 'Contato') AS nome, coalesce(w.ultima_mensagem_em, w.created_at) AS ult,
             w.motivo_insatisfacao AS motivo, w.nivel_insatisfacao AS nivel, w.chatwoot_conversa_id AS chatwoot_id,
             w.contato_telefone AS telefone, w.followup_status,
             (SELECT jsonb_agg(DISTINCT jsonb_build_object('categoria', a.categoria, 'label', public.fn_conversas_label_categoria(a.categoria), 'interna', a.interna))
                FROM atr a WHERE a.id = w.id AND a.categoria <> 'outros') AS categorias
      FROM public.whatsapp_conversas w
      WHERE w.reclamacao_identificada AND coalesce(w.ultima_mensagem_em, w.created_at) >= v_ini
      ORDER BY coalesce(w.ultima_mensagem_em, w.created_at) DESC LIMIT 10) z
  )
  SELECT jsonb_build_object(
    'periodo_dias', p_dias,
    'kpis', jsonb_build_object(
      'familias_com_atrito', (SELECT count(DISTINCT id) FROM janela WHERE categoria <> 'outros'),
      'familias_falha_interna', (SELECT count(*) FROM por_familia WHERE internas > 0),
      'familias_repetidas', (SELECT count(*) FROM por_familia WHERE internas >= 2),
      'reclamacoes', (SELECT count(*) FROM public.whatsapp_conversas w WHERE w.reclamacao_identificada AND coalesce(w.ultima_mensagem_em, w.created_at) >= v_ini),
      'reclamacoes_falha_interna', (SELECT count(DISTINCT id) FROM janela WHERE reclamacao_identificada AND interna),
      'conversas_analisadas', (SELECT count(*) FROM public.whatsapp_conversas w WHERE coalesce(w.ultima_mensagem_em, w.created_at) >= v_ini)
    ),
    'categorias', coalesce((SELECT j FROM cats), '[]'::jsonb),
    'mensal', (SELECT j FROM mensal),
    'pausas', (SELECT j FROM pausas),
    'automacao', (SELECT j FROM automacao),
    'sentimento', (SELECT j FROM sentimento),
    'reclamacoes_recentes', coalesce((SELECT j FROM recentes), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END;
$$;

-- =====================================================================
-- Permissões
-- =====================================================================
REVOKE ALL ON FUNCTION public.fn_conversas_checar_acesso() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_conversas_pedidos(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_conversas_oportunidades() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_conversas_hoje() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_conversas_desempenho(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_conversas_qualidade(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_conversas_tarefa(text, text, text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conversas_hoje() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_conversas_desempenho(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_conversas_qualidade(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_conversas_tarefa(text, text, text, text, text, timestamptz) TO authenticated;
