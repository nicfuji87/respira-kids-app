-- Avisos de consulta (Nova Consulta, atualização, lembretes) vão para o responsável legal.
-- Quando ele não tem telefone, o aviso caía no vazio (uazapi 400). Agora usa o contato do
-- responsável financeiro: telefone, e-mail (se o legal não tiver) e o nome, para a saudação
-- chegar certa. O cadastro em pessoas não muda; só o payload do webhook.
DO $mig$
DECLARE
  f text;
  d text;
  n text;
BEGIN
  FOREACH f IN ARRAY ARRAY['webhook_appointment_created','webhook_appointment_updated',
                           'processar_lembretes_consulta','reenviar_lembrete_agendamento'] LOOP
    d := pg_get_functiondef(('public.' || f)::regproc);
    IF d LIKE '%v_contato_financeiro%' THEN
      CONTINUE;  -- já aplicado
    END IF;

    -- 1) variável que marca o desvio
    n := regexp_replace(d, '(v_responsavel_legal_telefone\s+BIGINT;)',
                        E'\\1\n  v_contato_financeiro BOOLEAN := false;');
    IF n = d THEN RAISE EXCEPTION '%: declaração não encontrada', f; END IF;
    d := n;

    -- 2) contato com desvio para o financeiro
    n := regexp_replace(d,
      'SELECT\s+email,\s*telefone\s+INTO\s+v_responsavel_legal_email,\s*v_responsavel_legal_telefone\s+FROM\s+pessoas\s+WHERE\s+id\s*=\s*v_agendamento\.responsavel_legal_id;',
      'SELECT coalesce(nullif(btrim(pl.email), ''''), nullif(btrim(pf.email), '''')),
               coalesce(pl.telefone, pf.telefone),
               (pl.telefone IS NULL AND pf.telefone IS NOT NULL)
          INTO v_responsavel_legal_email, v_responsavel_legal_telefone, v_contato_financeiro
          FROM pessoas pl
          LEFT JOIN pessoas pf ON pf.id = v_agendamento.responsavel_financeiro_id
         WHERE pl.id = v_agendamento.responsavel_legal_id;');
    IF n = d THEN RAISE EXCEPTION '%: SELECT do contato não encontrado', f; END IF;
    d := n;

    -- 3) saudação com o nome de quem recebe
    n := regexp_replace(d, '''nome'',\s*v_agendamento\.responsavel_legal_nome',
      '''nome'', CASE WHEN v_contato_financeiro THEN v_agendamento.responsavel_financeiro_nome ELSE v_agendamento.responsavel_legal_nome END');
    IF n = d THEN RAISE EXCEPTION '%: nome do responsável não encontrado', f; END IF;
    d := n;

    EXECUTE d;
  END LOOP;
END
$mig$;
