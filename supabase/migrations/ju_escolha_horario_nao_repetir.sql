-- AI dev note: 07/11/2026, caso Daiane: depois de a Ju marcar, o "Sim pf" (resposta ao aviso de contrato) reabriu a
-- mesma oferta e gerou "Falta marcar" falso (JA_TEM_CONSULTA_PERTO com a própria consulta recém-marcada).
-- 1) Gatilho: só conta oferta da equipe feita DEPOIS da última escolha já agendada nesta conversa.
-- 2) Aplicar: se a criança já tem consulta ativa nesse dia/hora (±30 min) com a mesma fisio, encerra calado (ja_marcado).
-- Também em 07/11 (n8n editori Y8sVnV4Lwuvhzg0Y, nó "Confirmação [Cancelar]"): o aviso de cancelamento à família
-- virou "Desmarcamos a sessão de terça, 10/11, às 16h. Se quiser combinar outro horário, é só chamar a gente por aqui."
DO $do$
DECLARE d text := pg_get_functiondef('public.trg_ju_escolha_detectar()'::regprocedure); n text;
BEGIN
  IF d LIKE '%ultima_agendada%' THEN RETURN; END IF;
  n := replace(d, $a$AND coalesce(h.conteudo, '') !~* '^\s*@ju' AND fn_ju_texto_tem_horario(h.conteudo)) THEN$a$,
    $a$AND coalesce(h.conteudo, '') !~* '^\s*@ju' AND fn_ju_texto_tem_horario(h.conteudo)
                    AND h.created_at > coalesce((SELECT max(x.atualizado_em) FROM ju_escolhas_horario x   -- ultima_agendada
                                                  WHERE x.conversa_id = NEW.conversa_id AND x.status = 'agendado'), '-infinity'::timestamptz)) THEN$a$);
  IF n = d THEN RAISE EXCEPTION 'trg_ju_escolha_detectar: trecho não encontrado'; END IF;
  EXECUTE n;
END $do$;

DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_escolha_aplicar(bigint,jsonb)'::regprocedure); n text;
BEGIN
  IF d LIKE '%ja_marcado_mesmo_horario%' THEN RETURN; END IF;
  n := replace(d, $a$  INSERT INTO ju_comandos (conversa_id, mensagem_id, texto, status)$a$,
    $a$  -- ja_marcado_mesmo_horario: a criança já tem essa consulta (ex.: a própria Ju marcou antes) → nada a fazer
  IF EXISTS (SELECT 1 FROM agendamentos a JOIN consulta_status cs ON cs.id = a.status_consulta_id
              WHERE a.paciente_id = v_pac AND a.ativo AND a.profissional_id = v_prof
                AND cs.codigo NOT IN ('cancelado', 'erro', 'reagendado')
                AND abs(extract(epoch FROM (a.data_hora AT TIME ZONE 'UTC') - v_quando)) <= 1800) THEN
    UPDATE ju_escolhas_horario SET status = 'ja_marcado', resultado = jsonb_build_object('motivo', 'mesmo_horario_ja_marcado') WHERE id = p_id;
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_marcado');
  END IF;

  INSERT INTO ju_comandos (conversa_id, mensagem_id, texto, status)$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_escolha_aplicar: trecho não encontrado'; END IF;
  EXECUTE n;
END $do$;
