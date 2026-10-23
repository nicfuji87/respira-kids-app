-- Aplicada em 23/10/2026 (migration ju_concluir_devolve_aviso), pedido do dono.
-- 1) Concluído no grupo 🔔 Notificações: em vez de a Ju responder com nova mensagem, reage ✅ no aviso
--    original (❓ se o pedido não foi achado). fn_ju_concluir passou a devolver aviso_msg_id
--    (notificacao_msg_id). Etiqueta tirada = ✅ no aviso também. n8n Entrada: "Responder no grupo" e
--    "Avisar conclusão" usam POST /message/react {id, text}.
-- 2) Os avisos saem do número da clínica, o mesmo da secretaria, e não notificam ela. A Entrada
--    reconhece mensagem da própria clínica enviada por API no grupo (fromMe + wasSentByApi, menos
--    reações) → evento grupo_nao_lido → POST /chat/read {number: grupo, read: false}.
--    "Que evento?": 0 concluir, 1 nao_lido, 2 etiquetas, 3 mensagem.
-- O preço da consulta criada pelo @ju já é fn_valor_servico (paciente → fisio → padrão), igual ao app.
DO $m$
DECLARE d text := pg_get_functiondef('public.fn_ju_concluir(bigint,text,text,text)'::regprocedure);
BEGIN
  IF position('aviso_msg_id' in d) = 0 THEN RAISE EXCEPTION 'aplicar ju_concluir_devolve_aviso'; END IF;
END $m$;
