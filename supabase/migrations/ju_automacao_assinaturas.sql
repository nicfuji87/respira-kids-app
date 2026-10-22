-- =====================================================================
-- Ju: automação reconhecida pelo TEXTO (substitui a regra do id 3EB0)
-- =====================================================================
-- AI dev note: o QuePasa (e a Evolution) mandam pelo mesmo número da clínica,
-- e essas mensagens chegam na uazapi sem wasSentByApi, como se a Lolô tivesse
-- digitado. A regra anterior (ju_quepasa_por_id.sql) usava o formato do id
-- (3EB0 + 18 hex), mas o WhatsApp Web, que a Lolô usa às vezes, gera o mesmo
-- formato: ela deixaria de pausar a Ju. Na dúvida, é melhor pausar à toa
-- (custa 15 min) do que a Ju falar por cima da Lolô.
-- Regra agora: mensagem da clínica, fora da API, cujo texto bate com uma
-- assinatura de template automático = AUTOMACAO. Os padrões são os mesmos que
-- a análise da noite usa (classificarAutomatica, scripts/n8n/whatsapp-
-- conversas-code3.js) mais os vistos na observação de 16-17/10/2026.
-- Template novo: inserir uma linha (regex POSIX, sem diferenciar maiúscula).
-- O registro manual (ju_envios_automaticos) continua valendo como reforço.
-- =====================================================================
CREATE TABLE public.ju_assinaturas_automacao (
  id         int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  padrao     text NOT NULL UNIQUE,
  descricao  text NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ju_assinaturas_automacao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_assinaturas_automacao FROM anon, authenticated;

INSERT INTO public.ju_assinaturas_automacao (padrao, descricao) VALUES
  ('mensagem autom[aá]tica',                                        'rodapé "Essa/Esta é uma mensagem automática"'),
  ('^\*?\[lembrete de consulta\]',                                  'lembrete de consulta'),
  ('^\[pagamento recebido\]',                                       'pagamento recebido (Asaas)'),
  ('^segue a nota fiscal referente',                                'nota fiscal enviada'),
  ('segue o link da fatura',                                        'link da fatura (Asaas)'),
  ('estamos escrevendo apenas para lembrar',                        'lembrete de fatura em aberto'),
  ('sua fatura referente aos atendimentos abaixo j[aá] est[aá] dispon', 'pré-cobrança (link do app)'),
  ('sua compra na respira kids est[aá] separada',                   'cobrança da loja'),
  ('^✅ ?consulta confirmada\.',                                     'resposta ao botão Confirmar'),
  ('^❌+ ?\*consulta cancelada\*',                                   'aviso de cancelamento (botão)'),
  ('sua consulta foi \*?cancelada',                                 'aviso de cancelamento ao cliente'),
  ('como previsto em nosso contrato na cl[aá]usula',                'cláusula 4a (cancelamento em cima da hora)'),
  ('^🔸 ?\*nova consulta\*',                                         'aviso de nova consulta'),
  ('n[aã]o identificamos a assinatura do contrato',                 'aviso de contrato não assinado'),
  ('^✅? ?contrato assinado com sucesso',                            'contrato assinado'),
  ('muito obrigada pela sua avalia[cç][aã]o',                       'agradecimento da pesquisa (NPS)'),
  ('^📌 ?\*follow-ups necess[aá]rios\*',                             'resumo de follow-ups (desligado em 17/10/2026)'),
  ('^\[(nativeflow|buttons|list|template|interactive)message\]$',  'mensagem com botões ou lista (não sai do WhatsApp comum)');


CREATE OR REPLACE FUNCTION public.fn_ju_receber(
  p_wa_message_id text, p_wa_chatid text, p_telefone text,
  p_from_me boolean, p_via_api boolean, p_tipo text, p_conteudo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c        public.ju_conversas;
  v_origem text := CASE WHEN NOT p_from_me THEN 'CLIENTE'
                        WHEN p_via_api THEN 'AUTOMACAO'
                        ELSE 'HUMANO' END;
  v_tipo   text := CASE WHEN upper(p_tipo) IN ('TEXT','AUDIO','IMAGE','DOCUMENT','VIDEO','BOTAO')
                        THEN upper(p_tipo) ELSE 'OUTRO' END;
  v_conta  boolean;
  v_msg    bigint;
  v_env    bigint;
BEGIN
  INSERT INTO public.ju_conversas (wa_chatid, telefone)
  VALUES (p_wa_chatid, public.fn_ju_telefone(p_telefone))
  ON CONFLICT (wa_chatid) DO NOTHING;
  SELECT * INTO c FROM public.ju_conversas WHERE wa_chatid = p_wa_chatid FOR UPDATE;

  IF v_origem = 'AUTOMACAO' AND c.resposta_pendente IS NOT NULL
     AND c.resposta_pendente_em > now() - interval '5 minutes'
     AND btrim(coalesce(p_conteudo, '')) = c.resposta_pendente THEN
    v_origem := 'JU';
    UPDATE public.ju_conversas SET resposta_pendente = NULL, resposta_pendente_em = NULL WHERE id = c.id;
  END IF;

  -- template automático enviado fora da API (QuePasa/Evolution): não é a Lolô
  IF v_origem = 'HUMANO' AND EXISTS (
       SELECT 1 FROM public.ju_assinaturas_automacao a
        WHERE a.ativo AND btrim(coalesce(p_conteudo, '')) ~* a.padrao) THEN
    v_origem := 'AUTOMACAO';
  END IF;

  -- reforço: envio automático registrado antes de sair (ju_envios_automaticos)
  IF v_origem = 'HUMANO' THEN
    SELECT e.id INTO v_env FROM public.ju_envios_automaticos e
     WHERE e.telefone = coalesce(c.telefone, public.fn_ju_telefone(p_telefone))
       AND e.usado_em IS NULL AND e.created_at > now() - interval '5 minutes'
       AND e.texto = btrim(coalesce(p_conteudo, ''))
     ORDER BY e.created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF v_env IS NOT NULL THEN
      v_origem := 'AUTOMACAO';
      UPDATE public.ju_envios_automaticos SET usado_em = now() WHERE id = v_env;
    END IF;
  END IF;

  v_conta := v_origem = 'CLIENTE' AND v_tipo <> 'BOTAO';

  INSERT INTO public.ju_mensagens (conversa_id, wa_message_id, origem, tipo, conteudo, versao)
  VALUES (c.id, p_wa_message_id, v_origem, v_tipo, nullif(btrim(p_conteudo), ''),
          CASE WHEN v_conta THEN c.message_version + 1 END)
  ON CONFLICT (wa_message_id) DO NOTHING
  RETURNING id INTO v_msg;
  IF v_msg IS NULL THEN
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'DUPLICADA');
  END IF;

  IF v_origem = 'HUMANO' THEN
    UPDATE public.ju_conversas
       SET status = CASE WHEN status = 'AGUARDANDO_EQUIPE' THEN status ELSE 'PAUSADA' END,
           pause_until = CASE WHEN status = 'AGUARDANDO_EQUIPE' THEN NULL ELSE now() + interval '15 minutes' END,
           ultima_mensagem_humano = now(), updated_at = now()
     WHERE id = c.id;
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', 'HUMANO', 'conversa_id', c.id);
  ELSIF NOT v_conta THEN
    RETURN jsonb_build_object('acao', 'NADA', 'motivo', v_origem || ':' || v_tipo, 'conversa_id', c.id);
  END IF;

  UPDATE public.ju_conversas
     SET message_version = message_version + 1,
         telefone = coalesce(public.fn_ju_telefone(p_telefone), telefone),
         ultima_mensagem_cliente = now(),
         status = CASE WHEN status = 'PAUSADA' AND pause_until <= now() THEN 'ATIVA' ELSE status END,
         pause_until = CASE WHEN status = 'PAUSADA' AND pause_until <= now() THEN NULL ELSE pause_until END,
         updated_at = now()
   WHERE id = c.id
  RETURNING * INTO c;

  RETURN jsonb_build_object(
    'acao', CASE c.status WHEN 'ATIVA' THEN 'PROCESSAR'
                          WHEN 'AGUARDANDO_EQUIPE' THEN 'ANOTAR'
                          ELSE 'AGUARDAR' END,
    'motivo', c.status,
    'conversa_id', c.id,
    'versao', c.message_version,
    'midia', v_tipo IN ('AUDIO','IMAGE','DOCUMENT'));
END;
$$;
