-- Ju: mensagens enviadas pela Ju começam com "*Ju:*" (pedido do dono, 21/10/2026),
-- para a família saber quem está falando. O prefixo é posto só no envio (n8n).
-- AI dev note: o eco da uazapi volta COM o prefixo; aqui ele é ignorado na
-- comparação com resposta_pendente (senão o eco viraria AUTOMACAO e a Ju se
-- apresentaria de novo) e removido do histórico (senão a IA passaria a escrever
-- "*Ju:*" sozinha e o prefixo sairia dobrado).
DO $do$
DECLARE d text; n text; i int;
  troca text[][] := ARRAY[
    [$v$AND btrim(coalesce(p_conteudo, ''), E' \t\r\n') = ANY ($v$,
     $v$AND btrim(regexp_replace(coalesce(p_conteudo, ''), '^\s*\*Ju:\*\s*', ''), E' \t\r\n') = ANY ($v$],
    [$v$btrim(coalesce(p_conteudo, ''), E' \t\r\n')), E'\x1f'), '')$v$,
     $v$btrim(regexp_replace(coalesce(p_conteudo, ''), '^\s*\*Ju:\*\s*', ''), E' \t\r\n')), E'\x1f'), '')$v$],
    [$v$nullif(btrim(p_conteudo), ''),$v$,
     $v$nullif(btrim(CASE WHEN v_origem = 'JU' THEN regexp_replace(coalesce(p_conteudo, ''), '^\s*\*Ju:\*\s*', '') ELSE p_conteudo END), ''),$v$]];
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.proname = 'fn_ju_receber';
  n := d;
  FOR i IN 1 .. array_length(troca, 1) LOOP
    IF (length(n) - length(replace(n, troca[i][1], ''))) / length(troca[i][1]) <> 1 THEN
      RAISE EXCEPTION 'fn_ju_receber: trecho % não encontrado (ou repetido)', i;
    END IF;
    n := replace(n, troca[i][1], troca[i][2]);
  END LOOP;
  EXECUTE n;
END
$do$;
