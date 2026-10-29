-- 29/10/2026 (pedido do dono): além do card no grupo 🔔, a profissional (Beatriz) recebe um aviso no privado.
CREATE OR REPLACE FUNCTION public.fn_ju_reserva_avisar_grupo(p_id bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE r public.ju_reservas; v_base text; v_contato text; v_req bigint; v_tok text; v_tel_prof text;
BEGIN
  SELECT * INTO r FROM public.ju_reservas WHERE id = p_id;
  IF NOT FOUND OR r.status <> 'pendente' THEN RETURN NULL; END IF;
  SELECT E'\n*Criança:* ' || btrim(p.nome)
         || coalesce(' (' || CASE WHEN p.data_nascimento > current_date - interval '24 months'
                                  THEN (extract(year FROM age(current_date, p.data_nascimento)) * 12 + extract(month FROM age(current_date, p.data_nascimento)))::int || ' meses'
                                  ELSE extract(year FROM age(current_date, p.data_nascimento))::int || ' anos' END || ')', '')
         || E'\n*Serviço:* ' || regexp_replace(btrim(ts.nome), '\s+', ' ', 'g')
         || E'\n*Quando:* ' || public.fn_ju_reserva_quando(r.data_hora),
         E'\n*Fisio:* ' || split_part(btrim(pr.nome), ' ', 1)
         || E'\n*Contato:* ' || coalesce(nullif(c.nome_whatsapp, '') || ' · ', '')
         || coalesce(regexp_replace(c.telefone, '^\+55(\d{2})(\d{4,5})(\d{4})$', '(\1) \2-\3'), c.wa_chatid),
         nullif(regexp_replace(coalesce(pr.telefone::text, ''), '\D', '', 'g'), '')
    INTO v_base, v_contato, v_tel_prof
    FROM public.pessoas p, public.tipo_servicos ts, public.pessoas pr, public.ju_conversas c
   WHERE p.id = r.paciente_id AND ts.id = r.tipo_servico_id AND pr.id = r.profissional_id AND c.id = r.conversa_id;
  v_tok := public.fn_whatsapp_conexoes_credenciais() ->> 'whatsapp_uazapi_token';
  IF v_base IS NULL OR v_tok IS NULL THEN RETURN NULL; END IF;
  v_req := net.http_post(
    url := 'https://infuse.uazapi.com/send/menu',
    body := jsonb_build_object('number', '120363433073436578@g.us', 'type', 'button',
                               'text', '📅 *Reserva de horário (Ju)*' || v_base || v_contato
                                       || E'\n\nConfira a agenda. Ao confirmar, a consulta é criada e a família recebe a confirmação.',
                               'choices', jsonb_build_array('✅ Confirmar|ju_res_ok:' || r.id, '❌ Recusar|ju_res_nao:' || r.id)),
    headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 20000);
  UPDATE public.ju_reservas SET grupo_req_id = v_req, updated_at = now() WHERE id = r.id;
  IF v_tel_prof IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://infuse.uazapi.com/send/text',
      body := jsonb_build_object('number', v_tel_prof,
                                 'text', '📅 *Reserva na sua agenda (Ju)*' || v_base
                                         || E'\n\nA recepção ainda vai confirmar. Quando confirmar, a consulta aparece na sua agenda.'),
      headers := jsonb_build_object('token', v_tok, 'Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 20000);
  END IF;
  RETURN v_req;
END $f$;
REVOKE ALL ON FUNCTION public.fn_ju_reserva_avisar_grupo(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_reserva_avisar_grupo(bigint) TO service_role;
