-- AI dev note: Registra o evento 'venda_produto_criada' na allow-list do webhook padrão
-- (webhooks.eventos). Sem isso, process_webhooks_simple() marca a fila como 'erro'
-- ("Nenhum webhook configurado para o evento"). O payload enviado é o padrão do sistema
-- ({tipo, timestamp, webhook_id, data}). Idempotente.

update public.webhooks
set eventos = array_append(eventos, 'venda_produto_criada'),
    updated_at = now()
where ativo = true
  and not ('venda_produto_criada' = any (eventos));
