-- 27/10/2026 (ok do dono), três ajustes de mensagens automáticas:
-- 1) Aviso de reajuste (1º/11) sai uma vez só por família. O n8n "[RK] Webhook Agendamento" mandava o aviso
--    depois de toda confirmação de agendamento: uma família recebeu 5 vezes, quatro no mesmo minuto.
-- 2) Lembrete de pré-cobrança vencida sai num envio só por responsável, com todas as faturas e o total.
--    Antes era um evento por cobrança: a Nair recebeu 4 mensagens em 30 minutos.
-- 3) Follow-up: contato novo que só agradeceu depois da resposta ("obrigada", "perfeito, agradeço") também entra.

------------------------------------------------------------------------------------------------
-- 1) Reajuste: reserva por telefone (o n8n pergunta antes de mandar)
------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aviso_reajuste_enviados (
  telefone_chave text PRIMARY KEY,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  origem text
);
ALTER TABLE public.aviso_reajuste_enviados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aviso_reajuste_enviados FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_aviso_reajuste_reservar(p_telefone text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v_chave text := public.fn_atrib_tel_chave(p_telefone); v_ok boolean;
BEGIN
  IF v_chave IS NULL THEN RETURN jsonb_build_object('enviar', false, 'motivo', 'sem_telefone'); END IF;
  INSERT INTO public.aviso_reajuste_enviados (telefone_chave, origem) VALUES (v_chave, 'n8n')
  ON CONFLICT (telefone_chave) DO NOTHING
  RETURNING true INTO v_ok;
  RETURN jsonb_build_object('enviar', coalesce(v_ok, false));
END $f$;
REVOKE ALL ON FUNCTION public.fn_aviso_reajuste_reservar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aviso_reajuste_reservar(text) TO service_role;

-- quem já recebeu não recebe de novo
INSERT INTO public.aviso_reajuste_enviados (telefone_chave, enviado_em, origem)
SELECT public.fn_atrib_tel_chave(c.telefone), min(m.created_at), 'historico'
  FROM public.ju_mensagens m
  JOIN public.ju_conversas c ON c.id = m.conversa_id
 WHERE m.origem = 'AUTOMACAO' AND m.conteudo ILIKE '%passarão por um reajuste%'
   AND public.fn_atrib_tel_chave(c.telefone) IS NOT NULL
 GROUP BY 1
ON CONFLICT (telefone_chave) DO NOTHING;

------------------------------------------------------------------------------------------------
-- 2) Pré-cobrança vencida: um evento por responsável
------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_brl(p numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $f$
  SELECT 'R$ ' || translate(to_char(round(coalesce(p, 0), 2), 'FM999,999,990.00'), ',.', '.,')
$f$;

CREATE OR REPLACE FUNCTION public.fn_enqueue_lembretes_pre_cobranca()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_grp record;
  v_delay interval := interval '0';   -- atraso acumulado (1º sai na hora)
  v_last uuid;
  v_it jsonb;
  v_i int;
  v_nome text;
  v_txt text;
  v_html text;
  v_dias int;
  v_rodape text := E'Caso já tenha efetuado o pagamento, por favor, desconsidere este lembrete. No entanto, se ainda não teve a chance de realizar o pagamento, gostaríamos de pedir que o realize assim que possível. Entendemos que imprevistos acontecem e estamos aqui para ajudar!\n\nAtenciosamente,\n\nEquipe Respira Kids\n\n_Essa é uma mensagem automática._';
BEGIN
  -- 27/10/2026: UM evento POR RESPONSÁVEL, com todas as cobranças dele, espaçados 5–9 min (randômico)
  -- via proximo_retry (API não oficial). O banco monta o texto do WhatsApp (texto_whatsapp) e o trecho
  -- do e-mail (html_itens); o n8n só envia. Mesma elegibilidade + auto-renovação de antes.
  FOR v_grp IN
    WITH eleg AS (
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
    )
    SELECT coalesce(e.responsavel_cobranca_id::text, e.id::text) AS chave,
           max(e.r_nome) AS r_nome,
           count(*) AS n,
           sum(e.valor_base) AS total,
           array_agg(e.id) AS ids,
           jsonb_agg(jsonb_build_object(
             'pagamento_link_id', e.id,
             'token', e.token,
             'url', 'https://app.respirakidsbrasilia.com.br/#/pagamento/' || e.token,
             'responsavel_cobranca_id', e.responsavel_cobranca_id,
             'responsavel_nome', e.r_nome,
             'responsavel_telefone', e.r_tel,
             'paciente_id', e.paciente_id,
             'paciente_nome', e.p_nome,
             'empresa_id', e.empresa_id,
             'empresa_nome', e.e_nome,
             'valor_base', e.valor_base,
             'descricao', e.descricao,
             'vencimento', e.vencimento,
             'dias_em_atraso', e.dias,
             'aviso_numero', e.aviso
           ) ORDER BY e.vencimento, e.id) AS itens
    FROM eleg e
    GROUP BY 1
    ORDER BY min(e.vencimento)
  LOOP
    v_nome := split_part(btrim(coalesce(v_grp.r_nome, '')), ' ', 1);

    IF v_grp.n = 1 THEN
      v_it := v_grp.itens -> 0;
      v_dias := greatest((v_it ->> 'dias_em_atraso')::int, 0);
      v_txt := 'Olá, ' || v_nome || E'\n\nEspero que esteja tudo bem com você! Estamos escrevendo apenas para lembrar gentilmente que parece haver uma fatura em aberto conosco.\n\nDetalhes da Fatura:\n\nDescrição da Fatura: *'
               || regexp_replace(coalesce(v_it ->> 'descricao', ''), '\s*\n\s*', ' ', 'g')
               || E'*\nDias Vencidos: *' || v_dias
               || E'*\nValor: *' || public.fn_brl((v_it ->> 'valor_base')::numeric)
               || E'*\nAcessar Fatura: ' || (v_it ->> 'url') || E'\n\n' || v_rodape;
      v_html := replace(replace(replace(regexp_replace(coalesce(v_it ->> 'descricao', ''), '\s*\n\s*', ' ', 'g'),
                  '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
    ELSE
      v_txt := 'Olá, ' || v_nome || E'\n\nEspero que esteja tudo bem com você! Estamos escrevendo apenas para lembrar gentilmente que há '
               || v_grp.n || ' faturas em aberto conosco, somando *' || public.fn_brl(v_grp.total) || '*.';
      v_html := '<ul style="margin:6px 0 0 18px; padding:0;">';
      v_i := 0;
      FOR v_it IN SELECT x FROM jsonb_array_elements(v_grp.itens) x LOOP
        v_i := v_i + 1;
        v_dias := greatest((v_it ->> 'dias_em_atraso')::int, 1);
        v_txt := v_txt || E'\n\n*Fatura ' || v_i || '* (' || split_part(coalesce(v_it ->> 'paciente_nome', ''), ' ', 1) || '): *'
                 || public.fn_brl((v_it ->> 'valor_base')::numeric) || '*, vencida há ' || v_dias
                 || CASE WHEN v_dias = 1 THEN ' dia' ELSE ' dias' END
                 || E'\nAcessar: ' || (v_it ->> 'url');
        v_html := v_html || '<li style="margin:0 0 8px 0;"><strong>Fatura ' || v_i || '</strong> ('
                  || replace(replace(split_part(coalesce(v_it ->> 'paciente_nome', ''), ' ', 1), '<', '&lt;'), '>', '&gt;')
                  || '): ' || public.fn_brl((v_it ->> 'valor_base')::numeric) || ', vencida há ' || v_dias
                  || CASE WHEN v_dias = 1 THEN ' dia' ELSE ' dias' END
                  || '. <a href="' || (v_it ->> 'url') || '" style="color:#27c0b3;">Pagar esta fatura</a></li>';
      END LOOP;
      v_txt := v_txt || E'\n\n' || v_rodape;
      v_html := v_html || '</ul>';
    END IF;

    INSERT INTO public.webhook_queue (evento, payload, status, tentativas, max_tentativas, proximo_retry)
    VALUES (
      'pre_cobranca_inadimplente',
      jsonb_build_object(
        'tipo', 'pre_cobranca_inadimplente',
        'timestamp', now(),
        'webhook_id', gen_random_uuid(),
        'data', jsonb_build_object('total', v_grp.n, 'valor_total', v_grp.total, 'cobrancas', v_grp.itens,
                                   'texto_whatsapp', v_txt, 'html_itens', v_html)
      ),
      'pendente', 0, 3,
      now() + v_delay
    )
    RETURNING id INTO v_last;

    -- Marca lembrada hoje + auto-renova validade (mantém vencimento original)
    UPDATE public.pagamento_links
    SET lembretes_enviados = COALESCE(lembretes_enviados, 0) + 1,
        ultimo_lembrete_em = now(),
        status = 'pendente',
        expira_em = now() + interval '30 days',
        atualizado_em = now()
    WHERE id = ANY (v_grp.ids);

    -- Próximo envio: +5 a 9 minutos (300–540s randômico)
    v_delay := v_delay + make_interval(secs => (300 + random() * 240)::int);
  END LOOP;

  RETURN v_last;
END;
$function$;

-- log do disparo para todas as cobranças do envio agrupado
CREATE OR REPLACE FUNCTION public.fn_registrar_disparo_cobranca_grupo(p_status text, p_pagamento_link_ids uuid[],
                                                                     p_tipo text DEFAULT 'lembrete', p_detalhe text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v uuid; n int := 0;
BEGIN
  FOREACH v IN ARRAY coalesce(p_pagamento_link_ids, '{}'::uuid[]) LOOP
    PERFORM public.fn_registrar_disparo_cobranca(p_status => p_status, p_pagamento_link_id => v,
                                                 p_tipo => p_tipo, p_detalhe => p_detalhe);
    n := n + 1;
  END LOOP;
  RETURN n;
END $f$;
REVOKE ALL ON FUNCTION public.fn_registrar_disparo_cobranca_grupo(text, uuid[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_registrar_disparo_cobranca_grupo(text, uuid[], text, text) TO service_role;

------------------------------------------------------------------------------------------------
-- 3) Follow-up: contato novo que só agradeceu
------------------------------------------------------------------------------------------------
DO $mig$
DECLARE d text := pg_get_functiondef('public.fn_followup_avaliar()'::regprocedure); n text;
BEGIN
  IF d LIKE '%v_agradeceu%' THEN RETURN; END IF;
  n := replace(d, $a$  n_lin int := 0;$a$,
                  $a$  n_lin int := 0;
  v_agradeceu boolean := false;
  v_re_agradece text := '^\W*((muito )?(obrigad[ao]s?|agrade[çc]o|agradecemos|grat[ao])|ok(ay|ey)?|perfeito|entendi(do)?|certo|show|valeu|blz|beleza|t[áa] (bom|[óo]timo)|combinado|maravilha|[óo]timo|legal|bacana|joia|top|beijos?|bjs?|abra[çc]os?)\M[^?]{0,40}$|^\W+$';$a$);
  n := replace(n, $a$    IF r.sem_ia THEN v_sit := 'bloqueado'; v_mot := 'sem_ia';$a$,
                  $a$    -- 27/10/2026: contato novo que só agradeceu depois da resposta não deixa a clínica devendo nada;
    -- a pausa conta a partir do agradecimento.
    v_agradeceu := v_ult = 'CLIENTE' AND r.contato_novo AND v_ult_clin IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.ju_mensagens m
                       WHERE m.conversa_id = r.conversa_id AND m.origem = 'CLIENTE' AND m.created_at > v_ult_clin
                         AND (m.tipo <> 'TEXT' OR btrim(coalesce(m.conteudo, '')) !~* v_re_agradece));
    IF v_agradeceu THEN v_ult_clin := v_ult_fam; END IF;

    IF r.sem_ia THEN v_sit := 'bloqueado'; v_mot := 'sem_ia';$a$);
  n := replace(n, $a$ELSIF v_ult = 'CLIENTE' THEN$a$, $a$ELSIF v_ult = 'CLIENTE' AND NOT v_agradeceu THEN$a$);
  IF n NOT LIKE '%v_re_agradece text%' OR n NOT LIKE '%IF v_agradeceu THEN v_ult_clin := v_ult_fam;%'
     OR n NOT LIKE '%v_ult = ''CLIENTE'' AND NOT v_agradeceu THEN%' THEN
    RAISE EXCEPTION 'fn_followup_avaliar: trecho não encontrado';
  END IF;
  EXECUTE n;
END
$mig$;

CREATE OR REPLACE FUNCTION public.fn_followup_ia_item(p_avaliacao_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'avaliacao_id', f.id,
    'hoje', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ', '
            || (ARRAY['segunda','terça','quarta','quinta','sexta','sábado','domingo'])
               [extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo')::int]
            || CASE WHEN public.fn_followup_dia_util((now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN '' ELSE ' (não é dia útil)' END,
    'modo', CASE WHEN f.motivo = 'pesquisa_contato_novo' THEN 'PESQUISA_CONTATO_NOVO' ELSE 'RETOMADA_AGENDAMENTO' END,
    'perguntou_convenio', f.intencao = 'Perguntou sobre convênio',
    'familia_so_agradeceu', f.ultimo_autor = 'CLIENTE' AND f.situacao = 'candidato',
    'minutos_desde_ultima_fala_da_clinica',
      CASE WHEN f.ultima_clinica_em IS NOT NULL THEN floor(extract(epoch FROM now() - f.ultima_clinica_em) / 60)::int END,
    'dias_uteis_desde_ultima_fala_da_clinica',
      CASE WHEN f.ultima_clinica_em IS NOT NULL THEN public.fn_followup_dias_uteis_motor(f.ultima_clinica_em, now()) END,
    'conversa', public.fn_followup_transcricao(f.conversa_id, o.aberta_em - interval '2 days'))
    FROM public.followup_avaliacoes f
    JOIN public.atrib_oportunidades o ON o.id = f.oportunidade_id
   WHERE f.id = p_avaliacao_id
$function$;
