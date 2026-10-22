-- PDF com senha (fatura da Claro: 5 primeiros dígitos do CNPJ do titular, 22/10/2026).
-- A edge email-boletos tenta a senha do cadastro e, sem ela, os padrões comuns com o CNPJ
-- das nossas empresas (4, 5, 6 e 8 primeiros dígitos e o CNPJ inteiro). A que abrir fica
-- gravada no remetente; a página do boleto mostra a senha para quem for abrir o PDF.
-- Não é segredo forte (é derivada do CNPJ), mas só admin lê (RLS da tabela).

ALTER TABLE public.email_boleto_remetentes ADD COLUMN IF NOT EXISTS senha_pdf text;

CREATE OR REPLACE FUNCTION public.fn_boleto_solicitacao_obter(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.fn_rls_admin_aprovado_ativo() THEN
    RAISE EXCEPTION 'Apenas admin';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'id', b.id, 'status', b.status, 'valor', b.valor, 'valor_pagar', b.valor_pagar, 'vencimento', b.vencimento,
      'linha_digitavel', b.linha_digitavel, 'banco_codigo', b.banco_codigo,
      'beneficiario_nome', b.beneficiario_nome, 'beneficiario_doc', b.beneficiario_doc,
      'descricao', b.descricao, 'alertas', b.alertas, 'anexo_path', b.anexo_path,
      'remetente_email', b.remetente_email, 'created_at', b.created_at,
      'data_pagamento', b.data_pagamento, 'concluido_em', b.concluido_em, 'erro', b.erro,
      'lancamento_id', b.lancamento_id,
      'fornecedor_nome', coalesce(nullif(f.nome_fantasia, ''), f.nome_razao_social),
      'fornecedor_cnpj', f.cpf_cnpj,
      'assunto', m.assunto, 'caixa', c.email,
      'debito_automatico', coalesce(er.debito_automatico, false),
      'conta_debito', (SELECT cb.banco_nome FROM public.contas_bancarias cb WHERE cb.id = er.conta_bancaria_id),
      'senha_pdf', er.senha_pdf,
      'aprovado_por', (SELECT p.nome FROM public.pessoas p WHERE p.id = b.aprovado_por))
    FROM public.boleto_solicitacoes b
    LEFT JOIN public.fornecedores f ON f.id = b.fornecedor_id
    LEFT JOIN public.email_mensagens m ON m.id = b.mensagem_id
    LEFT JOIN public.email_caixas c ON c.id = m.caixa_id
    LEFT JOIN public.email_boleto_remetentes er ON er.id = b.remetente_id
    WHERE b.id = p_id
  );
END;
$$;
