-- Espaçamento anti-ban dos lembretes de pré-cobrança (API WhatsApp não oficial)
-- --------------------------------------------------------------------------
-- Evolução de pre_cobranca_lembretes_auto_renovacao.sql. Como o WhatsApp usa API
-- NÃO oficial, disparar todos os lembretes juntos arrisca ban do número. Solução:
-- a função passa a enfileirar UM evento POR cobrança (em vez de 1 evento com todas
-- no array), cada um com `proximo_retry = agora + atraso acumulado randômico de
-- 5–9 min`. O process_webhooks_simple() (cron 1min) já respeita `proximo_retry <=
-- now()`, então a fila entrega um de cada vez, espaçado — sem execução longa no n8n
-- e sem alteração no ramo do n8n (mantém `data.cobrancas[0]`, agora array de 1).
--
-- Precisão: o cron roda a cada 1 min, então o envio real é o proximo_retry
-- arredondado pro próximo minuto (±1 min). Espaçamento efetivo ~5–9 min.

CREATE OR REPLACE FUNCTION public.fn_enqueue_lembretes_pre_cobranca()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec record;
  v_delay interval := interval '0';   -- atraso acumulado (1º sai na hora)
  v_last uuid;
  v_item jsonb;
BEGIN
  FOR v_rec IN
    SELECT pl.id, pl.token, pl.responsavel_cobranca_id, r.nome AS r_nome,
           r.telefone AS r_tel, pl.paciente_id, pac.nome AS p_nome, pl.empresa_id,
           COALESCE(emp.nome_fantasia, emp.razao_social) AS e_nome,
           pl.valor_base, pl.descricao, pl.vencimento,
           (CURRENT_DATE - pl.vencimento) AS dias,
           COALESCE(pl.lembretes_enviados, 0) + 1 AS aviso
    FROM public.pagamento_links pl
    LEFT JOIN public.pessoas r ON r.id = pl.responsavel_cobranca_id
    LEFT JOIN public.pessoas pac ON pac.id = pl.paciente_id
    LEFT JOIN public.pessoa_empresas emp ON emp.id = pl.empresa_id
    WHERE pl.ativo = true
      AND pl.status IN ('pendente', 'expirado')
      AND pl.id_asaas IS NULL
      AND pl.fatura_id IS NULL
      AND pl.vencimento < CURRENT_DATE
      AND (pl.ultimo_lembrete_em IS NULL OR pl.ultimo_lembrete_em < CURRENT_DATE)
      AND EXISTS (
        SELECT 1 FROM public.agendamentos a
        WHERE a.pagamento_link_id = pl.id AND a.ativo = true AND a.fatura_id IS NULL
      )
    ORDER BY pl.vencimento ASC
    LIMIT 200
  LOOP
    v_item := jsonb_build_object(
      'pagamento_link_id', v_rec.id,
      'token', v_rec.token,
      'url', 'https://app.respirakidsbrasilia.com.br/#/pagamento/' || v_rec.token,
      'responsavel_cobranca_id', v_rec.responsavel_cobranca_id,
      'responsavel_nome', v_rec.r_nome,
      'responsavel_telefone', v_rec.r_tel,
      'paciente_id', v_rec.paciente_id,
      'paciente_nome', v_rec.p_nome,
      'empresa_id', v_rec.empresa_id,
      'empresa_nome', v_rec.e_nome,
      'valor_base', v_rec.valor_base,
      'descricao', v_rec.descricao,
      'vencimento', v_rec.vencimento,
      'dias_em_atraso', v_rec.dias,
      'aviso_numero', v_rec.aviso
    );

    INSERT INTO public.webhook_queue (evento, payload, status, tentativas, max_tentativas, proximo_retry)
    VALUES (
      'pre_cobranca_inadimplente',
      jsonb_build_object(
        'tipo', 'pre_cobranca_inadimplente',
        'timestamp', now(),
        'webhook_id', gen_random_uuid(),
        'data', jsonb_build_object('total', 1, 'cobrancas', jsonb_build_array(v_item))
      ),
      'pendente', 0, 3,
      now() + v_delay
    )
    RETURNING id INTO v_last;

    UPDATE public.pagamento_links
    SET lembretes_enviados = COALESCE(lembretes_enviados, 0) + 1,
        ultimo_lembrete_em = now(),
        status = 'pendente',
        expira_em = now() + interval '30 days',
        atualizado_em = now()
    WHERE id = v_rec.id;

    -- Próximo envio: +5 a 9 minutos (300–540s randômico)
    v_delay := v_delay + make_interval(secs => (300 + random() * 240)::int);
  END LOOP;

  RETURN v_last;
END;
$function$;
