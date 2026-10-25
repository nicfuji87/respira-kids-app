-- @ju ganha cobrança, nota fiscal, "me conta desse paciente" e "o que você faz" (pedido do dono, 25/10/2026).
-- A IA só entende o pedido (linguagem livre: "gere a cobrança", "gera o pagamento do mês passado",
-- "reenvia a nota"...) e escolhe ids que vieram no contexto. Quem confere tudo é o banco
-- (fn_ju_comando_preparar); quem cria o link e pede a nota é a edge ju-comando, com a mesma regra do app.
-- Cobrança: sessão que já aconteceu (agendada/confirmada/finalizada/faltou), sem cobrança, valor > 0;
-- uma cobrança por paciente e empresa de faturamento (igual ao app).

ALTER TABLE public.ju_comandos DROP CONSTRAINT IF EXISTS ju_comandos_status_check;
ALTER TABLE public.ju_comandos ADD CONSTRAINT ju_comandos_status_check CHECK (status = ANY (ARRAY[
  'recebido', 'agendado', 'pergunta', 'recusado', 'erro', 'nao_suportado',
  'executando', 'cobrado', 'nota', 'informado', 'ajuda']));

-- sessões que podem ser cobradas de um conjunto de pacientes (mesma regra da preparação)
CREATE OR REPLACE FUNCTION public.fn_ju_sessoes_cobraveis(p_pacientes uuid[])
 RETURNS TABLE (agendamento_id uuid, paciente_id uuid, data_hora timestamptz, valor numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.id, a.paciente_id, a.data_hora, a.valor_servico
    FROM agendamentos a
    JOIN consulta_status cs ON cs.id = a.status_consulta_id
    JOIN pagamento_status ps ON ps.id = a.status_pagamento_id
   WHERE a.paciente_id = ANY (p_pacientes) AND a.ativo
     AND a.fatura_id IS NULL AND a.pagamento_link_id IS NULL
     AND cs.codigo IN ('agendado', 'confirmado', 'finalizado', 'faltou')
     AND ps.codigo IN ('pendente', 'atrasado')
     AND coalesce(a.valor_servico, 0) > 0
     AND a.data_hora < (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'
     AND a.data_hora > (now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC' - interval '365 days';
$function$;
REVOKE ALL ON FUNCTION public.fn_ju_sessoes_cobraveis(uuid[]) FROM PUBLIC, anon, authenticated;

-- contexto do @ju: + família inteira (o mesmo contexto do atendimento) e sessões que podem ser cobradas
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_comando_contexto(bigint,bigint)'::regprocedure); n text;
BEGIN
  IF d LIKE '%sessoes_para_cobrar%' THEN RETURN; END IF;
  n := replace(d, $a$    'profissionais', coalesce(($a$,
    $a$    'familia', ctx,
    'sessoes_para_cobrar', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'agendamento_id', a.id,
               'crianca', split_part(btrim(pac.nome), ' ', 1),
               'paciente_id', a.paciente_id,
               'data', to_char(a.data_hora AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
               'dia_semana', dias[extract(dow FROM a.data_hora AT TIME ZONE 'UTC')::int + 1],
               'hora', to_char(a.data_hora AT TIME ZONE 'UTC', 'HH24:MI'),
               'servico', regexp_replace(ts.nome, '\s+', ' ', 'g'),
               'profissional', split_part(btrim(pr.nome), ' ', 1),
               'status', cs.codigo,
               'valor', a.valor_servico) ORDER BY a.data_hora)
        FROM fn_ju_sessoes_cobraveis(ARRAY(SELECT (x ->> 'paciente_id')::uuid
                                             FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]'::jsonb)) x)) s
        JOIN agendamentos a ON a.id = s.agendamento_id
        JOIN pessoas pac ON pac.id = a.paciente_id
        JOIN consulta_status cs ON cs.id = a.status_consulta_id
        LEFT JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
        LEFT JOIN pessoas pr ON pr.id = a.profissional_id), '[]'::jsonb),
    'profissionais', coalesce(($a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_comando_contexto: profissionais não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- confere o pedido e devolve o que a edge vai executar; trava o comando contra execução dupla
CREATE OR REPLACE FUNCTION public.fn_ju_comando_preparar(p_conversa_id bigint, p_mensagem_id bigint, p_acao text, p_ids uuid[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  cmd   ju_comandos;
  ctx   jsonb := fn_ju_contexto_cliente(p_conversa_id);
  fam   uuid[];
  ids   uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
  rec   jsonb := '[]'::jsonb;
  itens jsonb := '[]'::jsonb;
  g     record;
  r     record;
  falta text[];
  falta2 text[];
BEGIN
  SELECT * INTO cmd FROM ju_comandos WHERE mensagem_id = p_mensagem_id AND conversa_id = p_conversa_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'codigo', 'COMANDO_INEXISTENTE'); END IF;
  IF cmd.status = 'executando' OR cmd.resultado ? 'executado' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'JA_EXECUTADO');
  END IF;
  IF p_acao NOT IN ('cobrar', 'nota') THEN RETURN jsonb_build_object('ok', false, 'codigo', 'ACAO_INVALIDA'); END IF;
  IF cardinality(ids) = 0 OR cardinality(ids) > 40 THEN RETURN jsonb_build_object('ok', false, 'codigo', 'SEM_ITENS'); END IF;

  fam := ARRAY(SELECT (x ->> 'paciente_id')::uuid FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]'::jsonb)) x);

  IF p_acao = 'cobrar' THEN
    -- o que não pode ser cobrado volta com o motivo
    FOR r IN
      SELECT i AS id, a.id AS ag, a.paciente_id, split_part(btrim(pac.nome), ' ', 1) AS crianca,
             to_char(a.data_hora AT TIME ZONE 'UTC', 'DD/MM') AS dia, cs.codigo AS st, a.fatura_id, a.pagamento_link_id,
             (SELECT s.agendamento_id FROM fn_ju_sessoes_cobraveis(ARRAY[a.paciente_id]) s WHERE s.agendamento_id = a.id) AS ok
        FROM unnest(ids) i
        LEFT JOIN agendamentos a ON a.id = i
        LEFT JOIN pessoas pac ON pac.id = a.paciente_id
        LEFT JOIN consulta_status cs ON cs.id = a.status_consulta_id
    LOOP
      IF r.ag IS NULL OR NOT (r.paciente_id = ANY (fam)) THEN
        rec := rec || jsonb_build_object('id', r.id, 'motivo', 'FORA_DA_FAMILIA');
      ELSIF r.ok IS NULL THEN
        rec := rec || jsonb_build_object('id', r.id, 'crianca', r.crianca, 'dia', r.dia,
                 'motivo', CASE WHEN r.fatura_id IS NOT NULL OR r.pagamento_link_id IS NOT NULL THEN 'JA_COBRADA'
                                WHEN r.st IN ('cancelado', 'reagendado', 'erro') THEN 'CANCELADA'
                                ELSE 'NAO_COBRAVEL' END);
      END IF;
    END LOOP;

    -- uma cobrança por paciente + empresa de faturamento
    FOR g IN
      SELECT a.paciente_id, a.empresa_fatura AS empresa_id,
             array_agg(a.id ORDER BY a.data_hora) AS ags, sum(a.valor_servico) AS total
        FROM agendamentos a
       WHERE a.id = ANY (ids) AND a.paciente_id = ANY (fam)
         AND a.id IN (SELECT s.agendamento_id FROM fn_ju_sessoes_cobraveis(fam) s)
       GROUP BY a.paciente_id, a.empresa_fatura
    LOOP
      SELECT pac.nome, pac.cpf_cnpj, coalesce(pac.responsavel_cobranca_id, pac.id) AS resp INTO r
        FROM pessoas pac WHERE pac.id = g.paciente_id;
      falta := '{}';
      IF g.empresa_id IS NULL THEN falta := falta || 'empresa de faturamento das consultas'::text; END IF;
      -- mesmos campos que o app exige do responsável financeiro (validateResponsibleForAsaas)
      SELECT array_remove(ARRAY[
               CASE WHEN nullif(btrim(v.responsavel_cobranca_nome), '') IS NULL THEN 'nome completo' END,
               CASE WHEN nullif(btrim(v.responsavel_cobranca_cpf), '') IS NULL THEN 'CPF' END,
               CASE WHEN nullif(btrim(v.responsavel_cobranca_email), '') IS NULL THEN 'e-mail'
                    WHEN v.responsavel_cobranca_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
                      OR v.responsavel_cobranca_email ~* '[àáâãäåèéêëìíîïòóôõöùúûü]'
                      OR split_part(v.responsavel_cobranca_email, '@', 2) ~* '\.(con|comm|gmial|hotmial|yahooo)$'
                    THEN 'e-mail válido' END,
               CASE WHEN v.responsavel_cobranca_telefone IS NULL THEN 'telefone' END,
               CASE WHEN nullif(btrim(v.responsavel_cobranca_cep), '') IS NULL THEN 'CEP' END,
               CASE WHEN nullif(btrim(v.responsavel_cobranca_numero::text), '') IS NULL THEN 'número do endereço' END], NULL)
             || falta INTO falta2
        FROM vw_agendamentos_completos v WHERE v.id = g.ags[1];
      falta := coalesce(falta2, falta || 'dados do responsável financeiro'::text);

      itens := itens || jsonb_build_object(
        'paciente_id', g.paciente_id,
        'paciente_nome', r.nome,
        'paciente_cpf', r.cpf_cnpj,
        'crianca', split_part(btrim(r.nome), ' ', 1),
        'responsavel_id', r.resp,
        'empresa_id', g.empresa_id,
        'valor_base', g.total,
        'faltando', to_jsonb(coalesce(falta, '{}')),
        'consultas', (
          SELECT jsonb_agg(jsonb_build_object(
                   'id', a.id,
                   'data_hora', to_char(a.data_hora AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'),
                   'servico_nome', ts.nome,
                   'valor_servico', a.valor_servico,
                   'profissional_nome', coalesce(pr.nome, 'Profissional'),
                   'profissional_id', a.profissional_id,
                   'tipo_servico_id', a.tipo_servico_id) ORDER BY a.data_hora)
            FROM agendamentos a
            LEFT JOIN tipo_servicos ts ON ts.id = a.tipo_servico_id
            LEFT JOIN pessoas pr ON pr.id = a.profissional_id
           WHERE a.id = ANY (g.ags)));
    END LOOP;

  ELSE  -- nota: faturas pagas da família (mesma visão do contexto)
    FOR r IN
      SELECT i AS id, n
        FROM unnest(ids) i
        LEFT JOIN LATERAL (
          SELECT nf || jsonb_build_object('crianca', split_part(btrim(x ->> 'nome'), ' ', 1)) AS n
            FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]'::jsonb)) x,
                 jsonb_array_elements(coalesce(x -> 'notas_fiscais', '[]'::jsonb)) nf
           WHERE (nf ->> 'fatura_id')::uuid = i LIMIT 1) z ON true
    LOOP
      IF r.n IS NULL THEN
        rec := rec || jsonb_build_object('id', r.id, 'motivo', 'FORA_DA_FAMILIA');
      ELSE
        itens := itens || (r.n - 'ju_ja_tentou_emitir' - 'descricao');
      END IF;
    END LOOP;
  END IF;

  IF jsonb_array_length(itens) > 0 THEN
    UPDATE ju_comandos SET status = 'executando', proposta = jsonb_build_object('acao', p_acao, 'ids', to_jsonb(ids))
     WHERE id = cmd.id;
  END IF;
  RETURN jsonb_build_object('ok', jsonb_array_length(itens) > 0, 'codigo', CASE WHEN jsonb_array_length(itens) = 0 THEN 'NADA_A_FAZER' END,
                            'itens', itens, 'recusadas', rec);
END;
$function$;

-- grava o que a edge fez (o n8n grava a resposta depois, com fn_ju_comando_resposta)
CREATE OR REPLACE FUNCTION public.fn_ju_comando_registrar(p_mensagem_id bigint, p_status text, p_resultado jsonb)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  UPDATE ju_comandos
     SET status = p_status,
         resultado = coalesce(p_resultado, '{}'::jsonb) || jsonb_build_object('executado', true),
         concluido_em = now()
   WHERE mensagem_id = p_mensagem_id;
$function$;

REVOKE ALL ON FUNCTION public.fn_ju_comando_preparar(bigint, bigint, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ju_comando_registrar(bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_comando_preparar(bigint, bigint, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_comando_registrar(bigint, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ju_sessoes_cobraveis(uuid[]) TO service_role;

-- fn_ju_comando_resposta: status de cobrança/nota gravado pela edge não é sobrescrito
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_comando_resposta(bigint,text,text,jsonb)'::regprocedure); n text;
BEGIN
  IF d LIKE '%''cobrado''%' THEN RETURN; END IF;
  n := replace(d, $a$status = CASE WHEN status = 'agendado' THEN status$a$,
                  $a$status = CASE WHEN status IN ('agendado', 'cobrado', 'nota') THEN status$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_comando_resposta: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
