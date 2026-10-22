-- =====================================================================
-- Bateria do REDATOR do follow-up (V2.1) com conversas FICTÍCIAS, pelo caminho
-- real (pg_net → n8n "RK Follow-up - Envio"), em SOMBRA (nada é enviado).
-- 1) abre a janela só para o teste; 2) cria conversas 55619990007N com
--    oportunidade, avaliação e tentativa FU1 de sombra vencida; 3) dispara.
-- Depois: ler o resultado (consulta no fim), FECHAR a janela e limpar.
-- =====================================================================
UPDATE public.followup_config SET janela_inicio = '00:00', janela_fim = '23:59:59' WHERE id = 1;

DO $$
DECLARE
  r record; n bigint; op bigint; av bigint; i int; base timestamptz; k int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    (1, 'CADASTRO_PENDENTE', '[["F","Pode ser às 9h?"],["L","Pode sim! Preenche esse cadastro pra eu agendar no sistema: https://app.respirakidsbrasilia.com.br/#/cadastro-paciente"]]'),
    (2, 'OPCOES_HORARIO',    '[["F","Quero agendar pro meu filho"],["L","Temos quarta às 9h ou quinta às 16h. Qual fica melhor?"]]'),
    (3, 'AGENDAMENTO_INTERROMPIDO', '[["F","Queria marcar uma avaliação pro meu bebê"],["J","Claro! Vocês preferem de manhã ou à tarde?"]]'),
    (4, 'AGENDAMENTO_INTERROMPIDO', '[["F","Quero agendar, quanto custa?"],["L","A sessão é R$ 260 no Pix. Quer que eu veja os horários pra você?"]]'),
    (5, 'AGENDAMENTO_INTERROMPIDO', '[["F","Vocês atendem em casa? Queria marcar"],["L","Atendemos sim! Qual o seu bairro?"]]'),
    (6, 'AGENDAMENTO_INTERROMPIDO', '[["F","oi"],["F","queria marcar"],["F","pro meu filho"],["J","Claro! Qual o nome e a idade dele?"]]'),
    (7, 'OPCOES_HORARIO',    '[["F","Quero marcar, ele está muito cansado pra respirar desde ontem"],["L","Temos amanhã às 9h ou às 14h."]]'),
    (8, 'AGENDAMENTO_INTERROMPIDO', '[["F","Quero marcar pra próxima semana"],["L","Vou ver a agenda e já te mando os horários!"]]')
  ) z(caso, cenario, msgs) LOOP
    DELETE FROM public.ju_conversas WHERE wa_chatid = '5561999000' || (70 + r.caso) || '@s.whatsapp.net';
    INSERT INTO public.ju_conversas (wa_chatid, telefone)
    VALUES ('5561999000' || (70 + r.caso) || '@s.whatsapp.net', public.fn_ju_telefone('5561999000' || (70 + r.caso)))
    RETURNING id INTO n;
    INSERT INTO public.atrib_oportunidades (conversa_id, telefone_chave, aberta_em, motivo_abertura, estado)
    VALUES (n, public.fn_atrib_tel_chave('5561999000' || (70 + r.caso)), now() - interval '4 hours', 'primeiro_contato', 'aberta')
    RETURNING id INTO op;
    k := jsonb_array_length(r.msgs::jsonb);
    FOR i IN 0 .. k - 1 LOOP
      INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, conteudo, created_at)
      VALUES (n, 'RED-' || n || '-' || i,
              CASE (r.msgs::jsonb -> i ->> 0) WHEN 'F' THEN 'CLIENTE' WHEN 'L' THEN 'HUMANO' ELSE 'JU' END,
              r.msgs::jsonb -> i ->> 1, now() - interval '3 hours' + make_interval(mins => 10 * i));
    END LOOP;
    base := now() - interval '3 hours' + make_interval(mins => 10 * (k - 1));
    INSERT INTO public.followup_avaliacoes (dia, oportunidade_id, conversa_id, situacao, motivo, ultima_clinica_em,
                                            ia_classificacao, ia_resultado, ia_em, acao_pendente)
    VALUES ((now() AT TIME ZONE 'America/Sao_Paulo')::date, op, n, 'candidato', 'teste_redator', base, 'CANDIDATA',
            jsonb_build_object('classificacao','CANDIDATA','quem_deve_agir','FAMILIA','cenario', r.cenario,
                               'pendencia_atual','teste','sinais_de_preocupacao_clinica','[]'::jsonb,'sinais_de_desinteresse','[]'::jsonb), now(), 'teste')
    RETURNING id INTO av;
    INSERT INTO public.followup_tentativas (oportunidade_id, conversa_id, telefone_chave, tipo, sequencia, sombra, estado, motivo,
                                            avaliacao_id, mensagem_codigo, base_em, programada_para)
    VALUES (op, n, public.fn_atrib_tel_chave('5561999000' || (70 + r.caso)), 'RECUPERACAO_COMERCIAL', 1, true, 'PROGRAMADA',
            'teste_redator', av, 'IA', base, now() - interval '1 minute');
  END LOOP;
END $$;

SELECT public.fn_followup_envio_disparar() AS pedido;

-- Resultado (depois de ~2 min):
-- SELECT right(c.wa_chatid, 17) AS caso, t.estado, t.motivo, t.texto_status, t.texto,
--        t.texto_resultado ->> 'tipo_pendencia' AS tipo, t.texto_resultado ->> 'justificativa' AS justificativa
--   FROM public.followup_tentativas t JOIN public.ju_conversas c ON c.id = t.conversa_id
--  WHERE c.wa_chatid LIKE '55619990007%' ORDER BY 1, t.sequencia;
-- FECHAR A JANELA: UPDATE public.followup_config SET janela_inicio = '09:00', janela_fim = '17:30' WHERE id = 1;
-- Limpeza (depois de ler o resultado e fechar a janela):
-- DO $$
-- DECLARE convs bigint[]; ops bigint[];
-- BEGIN
--   SELECT array_agg(id) INTO convs FROM public.ju_conversas WHERE wa_chatid LIKE '55619990007_@s.whatsapp.net';
--   SELECT array_agg(id) INTO ops FROM public.atrib_oportunidades WHERE conversa_id = ANY(convs);
--   DELETE FROM public.followup_tentativas WHERE conversa_id = ANY(convs);
--   DELETE FROM public.followup_avaliacoes WHERE conversa_id = ANY(convs);
--   DELETE FROM public.followup_contatos WHERE telefone_chave IN (SELECT public.fn_atrib_tel_chave('5561999000' || g) FROM generate_series(71,78) g);
--   DELETE FROM public.atrib_oportunidades WHERE id = ANY(ops);
--   DELETE FROM public.ju_conversas WHERE id = ANY(convs);
-- END $$;
