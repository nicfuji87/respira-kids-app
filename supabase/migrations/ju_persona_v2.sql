-- =====================================================================
-- Ju: persona v2 (prompt de 17/10/2026) - o que o banco passa a fornecer
-- =====================================================================
-- AI dev note:
-- 1. fn_ju_turno devolve primeira_interacao (a Ju nunca falou na conversa),
--    dentro_do_horario (seg-sex 8h-19h, America/Sao_Paulo) e wa_chatid (o
--    alerta_clinico envia o texto do SAMU direto, sem depender do registro).
-- 2. Histórico: "Mensagem automática (tipo)", com o tipo vindo de
--    ju_assinaturas_automacao.descricao (o rodapé genérico fica por último).
-- 3. Resposta em várias mensagens: a Ju separa as partes com uma linha só com
--    "---". fn_ju_partes divide igual ao n8n (JS: split(/^[ \t]*-{3,}[ \t]*$/m),
--    trim, sem vazias) e guarda as partes em resposta_pendente separadas por
--    \x1f; fn_ju_receber reconhece o eco de cada parte como JU.
--    O modo ANOTAR não apaga mais o resposta_pendente.
-- 4. fn_ju_marcar_envio: envio feito fora do fn_ju_responder (o texto do SAMU
--    pelo alerta_clinico) também volta como fala da Ju.
-- As funções existentes são remendadas a partir da definição atual (replace);
-- cada troca confere que achou o trecho.
-- =====================================================================

UPDATE public.ju_assinaturas_automacao SET descricao = 'aviso do sistema'
 WHERE padrao = 'mensagem autom[aá]tica';
UPDATE public.ju_assinaturas_automacao SET descricao = 'mensagem com botões'
 WHERE padrao = '^\[(nativeflow|buttons|list|template|interactive)message\]$';
UPDATE public.ju_assinaturas_automacao SET descricao = 'resposta ao botão Confirmar: consulta confirmada'
 WHERE padrao = '^✅ ?consulta confirmada\.';


CREATE FUNCTION public.fn_ju_partes(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT nullif(array_to_string(array(
           SELECT btrim(x, E' \t\r\n')
           FROM regexp_split_to_table(coalesce(p_texto, ''), '^[ \t]*-{3,}[ \t]*$', 'n') WITH ORDINALITY AS t(x, n)
           WHERE btrim(x, E' \t\r\n') <> ''
           ORDER BY n), E'\x1f'), '');
$$;


CREATE FUNCTION public.fn_ju_marcar_envio(p_conversa_id bigint, p_texto text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.ju_conversas
     SET resposta_pendente = concat_ws(E'\x1f',
           CASE WHEN resposta_pendente_em > now() - interval '5 minutes' THEN resposta_pendente END,
           public.fn_ju_partes(p_texto)),
         resposta_pendente_em = now()
   WHERE id = p_conversa_id;
$$;
REVOKE ALL ON FUNCTION public.fn_ju_marcar_envio(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_marcar_envio(bigint, text) TO service_role;


DO $do$
DECLARE d text; n text;
BEGIN
  -- 1 e 2: fn_ju_turno
  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  n := replace(d, $a$'pode', true,$a$, $b$'pode', true,
    'primeira_interacao', NOT EXISTS (SELECT 1 FROM public.ju_mensagens j WHERE j.conversa_id = c.id AND j.origem = 'JU'),
    'dentro_do_horario', (extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
                          AND (now() AT TIME ZONE 'America/Sao_Paulo')::time >= time '08:00'
                          AND (now() AT TIME ZONE 'America/Sao_Paulo')::time < time '19:00'),
    'wa_chatid', c.wa_chatid,$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: retorno não encontrado'; END IF;
  d := n;
  n := replace(d, $a$WHEN 'HUMANO' THEN 'Recepção (Lolô)' ELSE 'Mensagem automática' END$a$,
                  $b$WHEN 'HUMANO' THEN 'Recepção (Lolô)'
                             ELSE 'Mensagem automática' || coalesce(' (' || (
                               SELECT a.descricao FROM public.ju_assinaturas_automacao a
                                WHERE a.ativo AND btrim(coalesce(m.conteudo, '')) ~* a.padrao
                                ORDER BY (a.padrao = 'mensagem autom[aá]tica'), a.id LIMIT 1) || ')', '') END$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: rótulo do histórico não encontrado'; END IF;
  EXECUTE n;

  -- 3: fn_ju_responder guarda as partes; ANOTAR não apaga o pendente
  d := pg_get_functiondef('public.fn_ju_responder'::regproc);
  n := replace(d, $a$resposta_pendente = CASE WHEN p_modo = 'RESPONDER' THEN btrim(p_texto) END,
         resposta_pendente_em = CASE WHEN p_modo = 'RESPONDER' THEN now() END,$a$,
                  $b$resposta_pendente = CASE WHEN p_modo = 'RESPONDER' THEN concat_ws(E'\x1f',
                               CASE WHEN resposta_pendente_em > now() - interval '5 minutes' THEN resposta_pendente END,
                               public.fn_ju_partes(p_texto))
                             ELSE resposta_pendente END,
         resposta_pendente_em = CASE WHEN p_modo = 'RESPONDER' THEN now() ELSE resposta_pendente_em END,$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_responder: trecho não encontrado'; END IF;
  EXECUTE n;

  -- 3: fn_ju_receber reconhece o eco de cada parte
  d := pg_get_functiondef('public.fn_ju_receber'::regproc);
  n := replace(d, $a$AND btrim(coalesce(p_conteudo, '')) = c.resposta_pendente THEN$a$,
                  $b$AND btrim(coalesce(p_conteudo, ''), E' \t\r\n') = ANY (string_to_array(c.resposta_pendente, E'\x1f')) THEN$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_receber: condição do eco não encontrada'; END IF;
  d := n;
  n := replace(d, $a$UPDATE public.ju_conversas SET resposta_pendente = NULL, resposta_pendente_em = NULL WHERE id = c.id;$a$,
                  $b$UPDATE public.ju_conversas
       SET resposta_pendente = nullif(array_to_string(array_remove(string_to_array(resposta_pendente, E'\x1f'),
                                                                   btrim(coalesce(p_conteudo, ''), E' \t\r\n')), E'\x1f'), '')
     WHERE id = c.id;$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_receber: limpeza do eco não encontrada'; END IF;
  EXECUTE n;
END
$do$;
