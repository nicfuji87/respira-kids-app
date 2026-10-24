-- Conversa da Larissa (24/10/2026): o dono teve de responder pelo Chatwoot a pergunta de pacote e,
-- depois, o endereço.
-- 1) Base: a clínica não trabalha com pacote (resposta do dono). Parcelamento agora vai até 12x.
-- 2) Pedido aberto + alguém da equipe já falou na conversa: a Ju ficava muda até para pergunta simples.
--    Agora ela só se cala enquanto a Lolô está conduzindo (mesma janela do lolo_conduzindo:
--    30 min, ou 90 min seg–sex das 8h às 17h59).

INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo)
VALUES ('PACOTE', 'FINANCEIRO',
        'A Respira Kids não trabalha com pacote de sessões. Cada criança responde ao tratamento de um jeito, então a cobrança é por sessão realizada: se o pedido médico fala em 5 sessões e a criança melhora com 3, cobram-se só as 3. Não há desconto por quantidade. A Ju responde isso direto, sem passar para a secretaria.',
        true)
ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, categoria = EXCLUDED.categoria, ativo = true, updated_at = now();

UPDATE public.ju_conhecimento
   SET texto = 'Os valores dos atendimentos vêm da tabela de serviços enviada pelo sistema em cada conversa. A Ju informa somente os valores dessa tabela, sem arredondar nem estimar. Pacote: veja o item PACOTE (não trabalhamos com pacote). Se o serviço não estiver na tabela, ou se a família pedir desconto ou condição especial, a Ju encaminha para a secretaria.',
       updated_at = now()
 WHERE id = 'VALORES';

UPDATE public.ju_conhecimento
   SET texto = 'Parcelamento: no cartão de crédito, pelo link de pagamento, dá para parcelar em até 12 vezes, com os juros da máquina. A Ju não calcula juros, não informa o valor de cada parcela e não promete parcelamento sem juros. Negociação diferente disso vai para a secretaria (FINANCEIRO).',
       updated_at = now()
 WHERE id = 'PARCELAMENTO';

DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_responder(bigint,bigint,text,text)'::regprocedure); n text;
BEGIN
  IF d LIKE '%janela da Lolô%' THEN RETURN; END IF;
  n := replace(d,
    $a$      AND NOT EXISTS (
        SELECT 1 FROM public.ju_mensagens m
         WHERE m.conversa_id = c.id AND m.origem = 'HUMANO'
           AND m.created_at > coalesce((SELECT min(s.created_at) FROM public.ju_solicitacoes s
                                         WHERE s.conversa_id = c.id AND s.status = 'ABERTA'),
                                       now() - interval '90 minutes'))$a$,
    $a$      AND NOT EXISTS (  -- janela da Lolô (igual ao lolo_conduzindo do fn_ju_turno)
        SELECT 1 FROM public.ju_mensagens m
         WHERE m.conversa_id = c.id AND m.origem = 'HUMANO'
           AND (m.created_at > now() - interval '30 minutes'
                OR (m.created_at > now() - interval '90 minutes'
                    AND extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
                    AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 8 AND 17)))$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_responder: trecho do RESPONDER_SIMPLES não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
