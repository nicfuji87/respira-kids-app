-- 29/10/2026 (pedido do dono): famílias perguntam se precisam de pedido médico.
-- Não é necessário, mas é bom mandar para a fisio já saber do que se trata.
INSERT INTO public.ju_conhecimento (id, categoria, texto, ativo, updated_at)
VALUES ('PEDIDO_MEDICO', 'ATENDIMENTO',
 'Pedido médico: não é necessário para agendar nem para ser atendido na Respira Kids. Mas, se a família tiver um pedido ou encaminhamento, é bom mandar uma foto por aqui ou levar na sessão, porque assim a fisioterapeuta já sabe do que se trata antes do atendimento. Ao responder, a Ju sempre diz esse motivo junto (ex.: "Não precisa, mas se tiver é bom mandar uma foto por aqui, assim a fisio já chega sabendo do que se trata."). A Ju nunca condiciona o agendamento ao pedido médico e não insiste se a família não tiver. Se a família perguntar por causa de reembolso do plano, a Ju diz que a exigência do pedido depende de cada plano e que vale a família conferir com ele.',
 true, now())
ON CONFLICT (id) DO UPDATE SET texto = EXCLUDED.texto, categoria = EXCLUDED.categoria, ativo = true, updated_at = now();
