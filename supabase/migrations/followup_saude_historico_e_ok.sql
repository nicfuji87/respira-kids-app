-- AI dev note: 06/11/2026, auditoria dos leads sem follow-up (ok do dono):
-- 1) mencao_saude só bloqueia quando a situação é ATUAL (está internado, vai internar, indo ao PS/UPA, piorou,
--    emergência). Menção ao passado ("esteve internada", "passou por uma internação", "recebeu alta",
--    "acompanha no hospital") não bloqueia: se a conversa chegaria a candidata, vira 'revisar' (saude_historico),
--    que não envia sozinho; a equipe decide.
-- 2) Última mensagem da família só de "ok / obrigada / compreendo / tá bom" depois de uma mensagem da clínica sem
--    pergunta não conta como "a clínica deve resposta": a conversa segue para as outras regras.
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_followup_avaliar()'::regprocedure); n text;
  a1 text := $a$  v_pediu boolean;$a$;
  a2 text := $a$    SELECT m.origem INTO v_ult FROM public.ju_mensagens m
     WHERE m.conversa_id = r.conversa_id AND m.origem IN ('CLIENTE','HUMANO','JU')
     ORDER BY m.created_at DESC LIMIT 1;$a$;
  a3 text := $a$    IF r.sem_ia THEN v_sit := 'bloqueado'; v_mot := 'sem_ia';$a$;
  a4 text := $a$    ELSIF coalesce(v_cli_t, '') ~* v_re_saude THEN v_sit := 'bloqueado'; v_mot := 'mencao_saude';$a$;
  a5 text := $a$    ELSE v_sit := 'candidato'; v_mot := CASE WHEN v_pediu THEN 'familia_parou' ELSE 'pesquisa_contato_novo' END;
    END IF;$a$;
BEGIN
  IF d LIKE '%saude_historico%' THEN RETURN; END IF;
  IF position(a1 IN d) = 0 OR position(a2 IN d) = 0 OR position(a3 IN d) = 0 OR position(a4 IN d) = 0 OR position(a5 IN d) = 0 THEN
    RAISE EXCEPTION 'fn_followup_avaliar: trecho não encontrado';
  END IF;
  n := replace(d, a1, $a$  v_saude_hist boolean;
  v_re_saude_agora text := '(est[áa] internad|vai (ser )?internad|vai internar|v[ãa]o internar|necessidade de interna|\m(estamos|estou|t[ôo]|vou|fomos|vamos|levei|levamos|indo)\M[^.!?|]{0,30}(hospital|pronto.?socorro|\mps\M|\mupa\M|emerg)|emerg[êe]ncia|piorou|piorando|\mupa\M|\mps\M|(est[áa]|ficou) na uti)';
  v_pediu boolean;$a$);
  n := replace(n, a2, a2 || $a$
    IF v_ult = 'CLIENTE'
       AND EXISTS (SELECT 1 FROM (SELECT m.conteudo FROM public.ju_mensagens m
                                   WHERE m.conversa_id = r.conversa_id AND m.origem = 'CLIENTE'
                                   ORDER BY m.created_at DESC LIMIT 1) q
                    WHERE btrim(coalesce(q.conteudo, '')) ~* '^(ok(ay)?|t[áa]( bom)?|certo|entendi(do)?|compreendo|obrigad[oa]|obg|valeu|beleza|blz|perfeito|combinado|show|ah,? (sim|t[áa]|ok)|(ok|sim|certo|t[áa] bom),? (muito )?obrigad[oa]|muito obrigad[oa])[^[:alnum:]]*$')
       AND EXISTS (SELECT 1 FROM (SELECT m.conteudo FROM public.ju_mensagens m
                                   WHERE m.conversa_id = r.conversa_id AND m.origem IN ('HUMANO','JU')
                                   ORDER BY m.created_at DESC LIMIT 1) q
                    WHERE position('?' IN coalesce(q.conteudo, '')) = 0) THEN
      v_ult := 'CLIENTE_OK';   -- só agradeceu ou confirmou que leu: ninguém deve resposta
    END IF;$a$);
  n := replace(n, a3, $a$    v_saude_hist := coalesce(v_cli_t, '') ~* v_re_saude AND NOT coalesce(v_cli_t, '') ~* v_re_saude_agora;
$a$ || a3);
  n := replace(n, a4, $a$    ELSIF coalesce(v_cli_t, '') ~* v_re_saude AND NOT v_saude_hist THEN v_sit := 'bloqueado'; v_mot := 'mencao_saude';$a$);
  n := replace(n, a5, a5 || $a$
    IF v_sit = 'candidato' AND v_saude_hist THEN v_sit := 'revisar'; v_mot := 'saude_historico'; END IF;$a$);
  EXECUTE n;
END $do$;
