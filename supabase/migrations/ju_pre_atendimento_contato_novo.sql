-- Pré-atendimento de contato novo (Google Ads, decisão do dono 26/10/2026): a Ju vai o mais longe possível
-- e a Lolô só entra para oferecer o horário.
-- 1) Com pedido de AGENDAMENTO aberto de contato novo e a Lolô ainda fora da conversa, a Ju continua
--    conduzindo (modo RESPONDER), em vez de só anotar.
-- 2) Base: triagem da Lolô (motora e respiratória), avaliação/primeira sessão e desconto.
-- 3) Follow-up automático ligado, só para contato novo (os demais seguem simulados).

-- contato novo = nenhuma criança da família já atendida na clínica
CREATE OR REPLACE FUNCTION public.fn_ju_contato_novo(p_conversa_id bigint)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(public.fn_ju_contexto_cliente(p_conversa_id) -> 'pacientes', '[]'::jsonb)) x
     WHERE coalesce((x ->> 'ja_atendido')::boolean, false));
$function$;

-- pré-atendimento: só pedidos de AGENDAMENTO abertos, contato novo e nenhuma mensagem da equipe depois do pedido
CREATE OR REPLACE FUNCTION public.fn_ju_pre_atendimento(p_conversa_id bigint)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT coalesce((
    SELECT c.status = 'AGUARDANDO_EQUIPE'
       AND EXISTS (SELECT 1 FROM public.ju_solicitacoes s WHERE s.conversa_id = c.id AND s.status = 'ABERTA')
       AND NOT EXISTS (SELECT 1 FROM public.ju_solicitacoes s
                        WHERE s.conversa_id = c.id AND s.status = 'ABERTA' AND s.tipo <> 'AGENDAMENTO')
       AND NOT EXISTS (SELECT 1 FROM public.ju_mensagens h
                        WHERE h.conversa_id = c.id AND h.origem = 'HUMANO'
                          AND h.created_at > (SELECT min(s.created_at) FROM public.ju_solicitacoes s
                                               WHERE s.conversa_id = c.id AND s.status = 'ABERTA'))
       AND public.fn_ju_contato_novo(c.id)
      FROM public.ju_conversas c WHERE c.id = p_conversa_id), false);
$function$;
REVOKE ALL ON FUNCTION public.fn_ju_contato_novo(bigint), public.fn_ju_pre_atendimento(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_contato_novo(bigint), public.fn_ju_pre_atendimento(bigint) TO service_role;

DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_turno(bigint,bigint)'::regprocedure); n text;
BEGIN
  IF d LIKE '%pre_atendimento%' THEN RETURN; END IF;
  n := replace(d, $a$'modo', CASE WHEN c.status = 'AGUARDANDO_EQUIPE' THEN 'ANOTAR' ELSE 'RESPONDER' END,$a$,
    $a$'modo', CASE WHEN c.status = 'AGUARDANDO_EQUIPE' AND NOT public.fn_ju_pre_atendimento(c.id) THEN 'ANOTAR' ELSE 'RESPONDER' END,
    'contato_novo', public.fn_ju_contato_novo(c.id),
    'pre_atendimento', public.fn_ju_pre_atendimento(c.id),$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: modo não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_ju_responder(bigint,bigint,text,text)'::regprocedure); n text;
BEGIN
  IF d LIKE '%fn_ju_pre_atendimento%' THEN RETURN; END IF;
  n := replace(d, $a$      OR (c.status = 'AGUARDANDO_EQUIPE' AND EXISTS ($a$,
    $a$      OR (c.status = 'AGUARDANDO_EQUIPE' AND public.fn_ju_pre_atendimento(c.id))
      OR (c.status = 'AGUARDANDO_EQUIPE' AND EXISTS ($a$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_responder: trecho do RESPONDER não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

-- base de conhecimento (texto da própria Lolô nas conversas de 21–22/10/2026)
INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo) VALUES
('TRIAGEM_MOTORA', 'ATENDIMENTO',
 'Triagem de contato novo para fisioterapia motora (desenvolvimento motor, estimulação precoce, torcicolo, assimetria craniana, tensões). Quando a família quiser agendar, a Ju pergunta, uma por vez e só o que ainda não foi dito: a idade e o que está acontecendo; se a criança já é acompanhada por outro profissional (fono, consultora de amamentação, dentista, osteopata); quem diagnosticou as tensões, a assimetria ou o atraso motor e encaminhou; quem é o pediatra; e, em bebês, se há alguma dificuldade na amamentação. Essas respostas ajudam a equipe a definir a urgência e a profissional. Bebê pequeno com atraso ou tensões costuma ir para estimulação precoce, mas quem define é a equipe.',
 true),
('TRIAGEM_RESPIRATORIA', 'ATENDIMENTO',
 'Triagem de contato novo para fisioterapia respiratória. Quando a família quiser agendar, a Ju pergunta, uma por vez e só o que ainda não foi dito: a idade e o que está acontecendo (por exemplo catarro, chiado, tosse, há quantos dias); quem indicou ou quem é o pediatra. A Ju não avalia se a criança precisa de fisioterapia nem orienta conduta: isso é com as fisios. Sinal de gravidade segue a regra de GRAVIDADE.',
 true),
('AVALIACAO_PRIMEIRA_SESSAO', 'ATENDIMENTO',
 'Na fisioterapia motora, o primeiro atendimento é a avaliação: a fisio entende o motivo da procura, faz perguntas sobre o histórico da gestação e do bebê e, em seguida, já inicia o tratamento. A avaliação com o primeiro atendimento tem o valor da "Avaliação Fisioterapêutica Motora" da tabela de serviços; as sessões seguintes seguem o valor da fisioterapia motora. Na fisioterapia respiratória não há avaliação separada: cada sessão é completa, com avaliação, técnicas e orientações (veja RETORNO). O número de sessões depende de como cada criança responde; a fisio orienta ao longo do tratamento (veja PACOTE).',
 true),
('DESCONTO', 'FINANCEIRO',
 'A Respira Kids não trabalha com descontos, inclusive para irmãos ou gêmeos: cada sessão é cobrada pelo valor da tabela. A Ju responde isso direto, com gentileza. Se a família insistir ou pedir outra condição, vai para a secretaria (FINANCEIRO).',
 true)
ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, categoria = EXCLUDED.categoria, ativo = true, updated_at = now();

UPDATE public.ju_conhecimento
   SET texto = replace(texto, 'Se o serviço não estiver na tabela, ou se a família pedir desconto ou condição especial, a Ju encaminha para a secretaria.',
                              'Desconto: veja DESCONTO. Se o serviço não estiver na tabela, ou se a família pedir outra condição especial, a Ju encaminha para a secretaria.'),
       updated_at = now()
 WHERE id = 'VALORES';

-- follow-up automático: liga o envio, só para contato novo; os demais continuam simulados (sombra)
ALTER TABLE public.followup_config ADD COLUMN IF NOT EXISTS apenas_contato_novo boolean NOT NULL DEFAULT true;

DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_followup_decidir(bigint)'::regprocedure); n text;
BEGIN
  IF d LIKE '%apenas_contato_novo%' THEN RETURN; END IF;
  n := replace(d, $a$v_sombra := NOT (k.envio_ativo AND k.canal_autorizado);$a$,
    $a$v_sombra := NOT (k.envio_ativo AND k.canal_autorizado)
              OR (k.apenas_contato_novo AND NOT coalesce(x.contato_novo, false));$a$);
  IF n = d THEN RAISE EXCEPTION 'fn_followup_decidir: v_sombra não encontrado'; END IF;
  EXECUTE n;
END
$mig$;

UPDATE public.followup_config SET envio_ativo = true, apenas_contato_novo = true, atualizado_em = now() WHERE id = 1;
