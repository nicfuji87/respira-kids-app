-- AI dev note: 06/11/2026 (pedido do dono): o resumo de 2 em 2 h vira "RESPIRA KIDS | PENDÊNCIAS": quem espera resposta
-- + pedidos abertos no 🔔 (mesmo quando a Lolô já falou "vou ver" e a família não voltou a escrever). Campos novos:
-- pendente_desde_iso, minutos_operacionais (relógio do expediente), familia_esperando, contato_novo (do ctx: nenhuma
-- criança já atendida; fn_ju_contato_novo por linha estourava o tempo) e oportunidade_em_risco (alerta ativo).
DO $do$
DECLARE d text := pg_get_functiondef('public.fn_ju_esperando_resposta'::regproc);
  a1 text := $a$      AND (c.ultima_mensagem_cliente > now() - make_interval(hours => p_horas)
           OR r.conversa_id IS NOT NULL)$a$;
  a2 text := 'WHERE p.esperando_desde IS NOT NULL';
  a3 text := $a$           'conversa_id', p.id,$a$;
BEGIN
  IF position(a1 IN d) = 0 OR position(a2 IN d) = 0 OR position(a3 IN d) = 0 THEN RAISE EXCEPTION 'trecho não encontrado'; END IF;
  d := replace(d, a1, $a$      AND (c.ultima_mensagem_cliente > now() - make_interval(hours => p_horas)
           OR r.conversa_id IS NOT NULL
           OR EXISTS (SELECT 1 FROM ju_solicitacoes so WHERE so.conversa_id = c.id AND so.status = 'ABERTA'))$a$);
  d := replace(d, a2, $a$WHERE (p.esperando_desde IS NOT NULL
         OR EXISTS (SELECT 1 FROM ju_solicitacoes so WHERE so.conversa_id = p.id AND so.status = 'ABERTA'))$a$);
  d := replace(d, a3, $a$           'conversa_id', p.id,
           'pendente_desde_iso', coalesce(p.esperando_desde,
                                   (SELECT min(so.created_at) FROM ju_solicitacoes so WHERE so.conversa_id = p.id AND so.status = 'ABERTA')),
           'minutos_operacionais', public.fn_ju_minutos_operacionais(coalesce(p.esperando_desde,
                                   (SELECT min(so.created_at) FROM ju_solicitacoes so WHERE so.conversa_id = p.id AND so.status = 'ABERTA')), now()),
           'familia_esperando', p.esperando_desde IS NOT NULL,
           'contato_novo', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(ctx -> 'pacientes', '[]'::jsonb)) xx
                                       WHERE coalesce((xx ->> 'ja_atendido')::boolean, false)),
           'oportunidade_em_risco', EXISTS (SELECT 1 FROM ju_solicitacoes so WHERE so.conversa_id = p.id AND so.status = 'ABERTA'
                                              AND so.dados ? 'alerta_espera_em' AND NOT so.dados ? 'alerta_espera_fim'),$a$);
  EXECUTE d;
END $do$;
