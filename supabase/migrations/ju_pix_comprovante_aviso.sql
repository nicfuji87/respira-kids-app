-- Pix pago depois de um erro não era avisado no grupo: o aviso do erro marcava
-- notificado_em e a mudança para "pago" não limpava (1º Pix real, Bio Bella, 15/10/2026).
-- Agora toda mudança de situação que precisa de aviso zera notificado_em, e o
-- comprovante consultado no Inter fica guardado em inter_pagamentos.comprovante.

ALTER TABLE public.inter_pagamentos ADD COLUMN IF NOT EXISTS comprovante jsonb;

CREATE OR REPLACE FUNCTION public.fn_trg_pix_solicitacao_reaviso()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('pago', 'erro', 'expirado') THEN
    NEW.notificado_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pix_solicitacao_reaviso ON public.pix_solicitacoes;
CREATE TRIGGER trg_pix_solicitacao_reaviso
  BEFORE UPDATE OF status ON public.pix_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_pix_solicitacao_reaviso();

-- o aviso passa a levar o id do pagamento no Inter (para buscar o comprovante)
CREATE OR REPLACE FUNCTION public.fn_pix_solicitacoes_para_avisar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  s  record;
  ip record;
BEGIN
  FOR s IN SELECT * FROM public.pix_solicitacoes WHERE status = 'pagando' AND iniciado_em < now() - interval '3 minutes'
  LOOP
    SELECT * INTO ip FROM public.inter_pagamentos
    WHERE tipo = 'pix' AND chave_pix = s.chave_pix AND abs(valor - s.valor) < 0.01
      AND criado_em >= s.iniciado_em - interval '1 minute'
      AND solicitado_por IS NOT DISTINCT FROM s.aprovado_por
    ORDER BY criado_em DESC LIMIT 1;

    IF FOUND AND ip.status = 'sucesso' THEN
      PERFORM public.fn_pix_registrar_pago(s.id, ip.id);
    ELSIF FOUND AND ip.status = 'erro' THEN
      UPDATE public.pix_solicitacoes SET status = 'erro', erro = ip.erro, concluido_em = now() WHERE id = s.id;
    ELSIF NOT FOUND AND s.iniciado_em < now() - interval '10 minutes' THEN
      UPDATE public.pix_solicitacoes SET status = 'aguardando', iniciado_em = NULL, aprovado_por = NULL WHERE id = s.id;
    END IF;
  END LOOP;

  UPDATE public.pix_solicitacoes SET status = 'expirado'
  WHERE status = 'aguardando' AND expira_em < now();

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', ps.id, 'status', ps.status, 'valor', ps.valor, 'favorecido', ps.favorecido,
      'chatid', ps.chatid, 'messageid', ps.messageid, 'erro', ps.erro,
      'inter_pagamento_id', ps.inter_pagamento_id, 'chave_pix', ps.chave_pix,
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = ps.aprovado_por)))
    FROM public.pix_solicitacoes ps
    WHERE ps.status IN ('pago', 'erro', 'expirado') AND ps.notificado_em IS NULL AND ps.chatid IS NOT NULL
  ), '[]'::jsonb);
END;
$$;
