-- 29/10/2026 (pedido do dono): aviso de contrato pendente curto e com pergunta ("Posso reenviar...? É só
-- responder sim"), no máximo 1 por dia por família; quando a família responde, a Ju reenvia.

-- 1) Trava de 1 aviso por dia por telefone (o n8n pergunta antes de mandar)
CREATE TABLE IF NOT EXISTS public.aviso_contrato_enviados (
  telefone_chave text NOT NULL,
  dia date NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (telefone_chave, dia)
);
ALTER TABLE public.aviso_contrato_enviados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aviso_contrato_enviados FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_aviso_contrato_reservar(p_telefone text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v_chave text := public.fn_atrib_tel_chave(p_telefone); v_ok boolean;
BEGIN
  IF v_chave IS NULL THEN RETURN jsonb_build_object('enviar', false, 'motivo', 'sem_telefone'); END IF;
  DELETE FROM public.aviso_contrato_enviados WHERE dia < current_date - 30;
  INSERT INTO public.aviso_contrato_enviados (telefone_chave, dia)
  VALUES (v_chave, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  ON CONFLICT (telefone_chave, dia) DO NOTHING
  RETURNING true INTO v_ok;
  RETURN jsonb_build_object('enviar', coalesce(v_ok, false));
END $f$;
REVOKE ALL ON FUNCTION public.fn_aviso_contrato_reservar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aviso_contrato_reservar(text) TO service_role;

-- 2) O aviso que sai pelo QuePasa chega como não-API: precisa casar com uma assinatura para virar AUTOMACAO
INSERT INTO public.ju_assinaturas_automacao (padrao, descricao, ativo)
SELECT 'o contrato de .{1,80} ainda n[aã]o foi assinado', 'aviso de contrato pendente (texto curto de 29/10/2026)', true
 WHERE NOT EXISTS (SELECT 1 FROM public.ju_assinaturas_automacao WHERE padrao = 'o contrato de .{1,80} ainda n[aã]o foi assinado');

-- 3) A Ju reenvia quando a família responde ao aviso
UPDATE public.ju_conhecimento
   SET texto = texto || ' Resposta ao aviso automático: o aviso pergunta "Posso reenviar para este WhatsApp e para o e-mail ...? É só responder sim". Quando a família responder que sim (ou "pode", "ok", "reenvia"), a Ju reenvia na hora com reenviar_contrato, sem perguntar de novo, e diz em uma frase que ele chega pela Assinafy, de um número próprio dela, e que é só assinar antes da sessão. Se a família disser que algum dado está errado (e-mail, WhatsApp, nome), a Ju corrige com corrigir_contato_contrato e depois reenvia.',
       updated_at = now()
 WHERE id = 'CONTRATO_ASSINATURA' AND texto NOT LIKE '%Resposta ao aviso automático%';
