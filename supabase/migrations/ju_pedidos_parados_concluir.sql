-- AI dev note: 04/11/2026 (pedido do dono). Pedido do 🔔 que a equipe respondeu e ficou aberto deixa a
-- conversa em AGUARDANDO_EQUIPE e a Ju muda (só anota). Regra: aberto há 24 h+, a última mensagem da
-- conversa (sem automação e sem clique de botão) é da equipe, mandada depois do pedido, e a família não
-- escreveu nada há 24 h → conclui sozinho. O card some e a etiqueta sai pela fila ju_grupo_apagar
-- (mesmo caminho de fn_ju_auto_concluir). Roda no fn_lista_espera_tick (1/min).

CREATE OR REPLACE FUNCTION public.fn_ju_pedidos_parados_concluir()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE s record; r jsonb; n integer := 0;
BEGIN
  FOR s IN
    SELECT so.id FROM ju_solicitacoes so
      JOIN LATERAL (SELECT m.origem, m.created_at FROM ju_mensagens m
                     WHERE m.conversa_id = so.conversa_id AND m.origem IN ('CLIENTE', 'HUMANO', 'JU') AND m.tipo <> 'BOTAO'
                     ORDER BY m.created_at DESC LIMIT 1) u ON true
     WHERE so.status = 'ABERTA' AND so.created_at < now() - interval '24 hours'
       AND u.origem = 'HUMANO' AND u.created_at < now() - interval '24 hours' AND u.created_at > so.created_at
     LIMIT 20
  LOOP
    r := fn_ju_concluir(s.id, NULL, NULL, 'automático: equipe respondeu e a família não voltou em 24 h');
    IF (r ->> 'ok')::boolean AND NOT coalesce((r ->> 'ja_concluido')::boolean, false) THEN
      n := n + 1;
      IF nullif(r ->> 'aviso_msg_id', '') IS NOT NULL THEN
        INSERT INTO ju_grupo_apagar (msg_id, wa_chatid, etiqueta, origem)
        VALUES (r ->> 'aviso_msg_id', r ->> 'wa_chatid',
                CASE WHEN (r ->> 'tirar_etiqueta')::boolean THEN r ->> 'etiqueta' END, 'pedido:' || s.id);
      END IF;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_ju_pedidos_parados_concluir() FROM anon, authenticated, public;

DO $do$
DECLARE d text := pg_get_functiondef('public.fn_lista_espera_tick'::regproc);
BEGIN
  IF position($a$'cadastro_sem_consulta', public.fn_ju_cadastro_sem_consulta());$a$ IN d) = 0 THEN
    RAISE EXCEPTION 'fn_lista_espera_tick: trecho não encontrado';
  END IF;
  EXECUTE replace(d, $a$'cadastro_sem_consulta', public.fn_ju_cadastro_sem_consulta());$a$,
    $a$'cadastro_sem_consulta', public.fn_ju_cadastro_sem_consulta(),
                            'pedidos_parados', public.fn_ju_pedidos_parados_concluir());$a$);
END $do$;
