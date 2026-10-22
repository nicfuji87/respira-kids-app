-- =====================================================================
-- Ju: etiqueta "🚫 SEM IA" (uazapi id 28) = bloqueio manual e permanente
-- =====================================================================
-- AI dev note: só a equipe aplica ou tira a etiqueta (no celular/WhatsApp
-- Web). Nenhum fluxo automático mexe na 28 (Ju e análise da noite só tocam
-- 22-27, 5 e 6). O evento chat_labels sincroniza ju_conversas.sem_ia (cria a
-- conversa se ainda não existir) e registra em ju_bloqueio_log.
-- Com sem_ia a Ju não responde, não chama a equipe, não executa ação, não
-- manda transcrição nem nota. O bloqueio é conferido em 4 pontos:
--   fn_ju_receber (liberado/sombra = false), fn_ju_turno (SEM_IA),
--   fn_ju_modo_conversa / fn_ju_chamar_secretaria (antes de ferramentas) e
--   fn_ju_responder (antes de enviar).
-- A Lolô continua conversando normalmente; lembretes e cobranças dos outros
-- fluxos não são afetados. O id da etiqueta fica em ju_config.etiqueta_sem_ia
-- (conferir pelo id, não pelo nome).
-- =====================================================================

ALTER TABLE public.ju_config ADD COLUMN etiqueta_sem_ia text NOT NULL DEFAULT '28';
ALTER TABLE public.ju_conversas ADD COLUMN sem_ia boolean NOT NULL DEFAULT false;
ALTER TABLE public.ju_conversas ADD COLUMN sem_ia_em timestamptz;

CREATE TABLE public.ju_bloqueio_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversa_id bigint REFERENCES public.ju_conversas(id) ON DELETE SET NULL,
  wa_chatid   text NOT NULL,
  acao        text NOT NULL CHECK (acao IN ('APLICADA', 'REMOVIDA')),
  origem      text NOT NULL DEFAULT 'etiqueta',
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ju_bloqueio_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ju_bloqueio_log FROM anon, authenticated;


CREATE FUNCTION public.fn_ju_sem_ia_sync(p_wa_chatid text, p_etiquetas text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_et   text := (SELECT k.etiqueta_sem_ia FROM public.ju_config k WHERE k.id = 1);
  v_novo boolean := coalesce(v_et = ANY (p_etiquetas), false);
  c      public.ju_conversas;
BEGIN
  IF p_wa_chatid IS NULL OR p_wa_chatid !~ '@(s\.whatsapp\.net|lid)$' THEN RETURN NULL; END IF;
  INSERT INTO public.ju_conversas (wa_chatid, telefone)
  VALUES (p_wa_chatid, CASE WHEN p_wa_chatid LIKE '%@s.whatsapp.net'
                            THEN public.fn_ju_telefone(split_part(p_wa_chatid, '@', 1)) END)
  ON CONFLICT (wa_chatid) DO NOTHING;
  SELECT * INTO c FROM public.ju_conversas WHERE wa_chatid = p_wa_chatid FOR UPDATE;
  IF c.sem_ia IS DISTINCT FROM v_novo THEN
    UPDATE public.ju_conversas SET sem_ia = v_novo, sem_ia_em = now(), updated_at = now() WHERE id = c.id;
    INSERT INTO public.ju_bloqueio_log (conversa_id, wa_chatid, acao)
    VALUES (c.id, p_wa_chatid, CASE WHEN v_novo THEN 'APLICADA' ELSE 'REMOVIDA' END);
  END IF;
  RETURN v_novo;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_ju_sem_ia_sync(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ju_sem_ia_sync(text, text[]) TO service_role;


DO $do$
DECLARE d text; n text;
BEGIN
  -- sincroniza junto com a conferência de etiquetas (evento chat_labels)
  d := pg_get_functiondef('public.fn_ju_etiquetas_atuais'::regproc);
  n := replace(d, $a$BEGIN
  UPDATE public.ju_solicitacoes s$a$, $b$BEGIN
  PERFORM public.fn_ju_sem_ia_sync(p_wa_chatid, v_et);
  UPDATE public.ju_solicitacoes s$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_etiquetas_atuais: início não encontrado'; END IF;
  EXECUTE n;

  -- entrada: conversa SEM IA não chama a Ju nem recebe transcrição
  d := pg_get_functiondef('public.fn_ju_receber'::regproc);
  n := replace(d, $a$'liberado', public.fn_ju_liberado(c.telefone),
    'sombra', public.fn_ju_sombra(c.telefone));$a$,
                  $b$'liberado', public.fn_ju_liberado(c.telefone) AND NOT c.sem_ia,
    'sombra', public.fn_ju_sombra(c.telefone) AND NOT c.sem_ia,
    'sem_ia', c.sem_ia);$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_receber: retorno não encontrado'; END IF;
  EXECUTE n;

  -- turno: SEM IA antes de tudo
  d := pg_get_functiondef('public.fn_ju_turno'::regproc);
  n := replace(d, $a$WHEN public.fn_ju_eh_equipe(c.telefone) THEN 'EQUIPE'$a$,
                  $b$WHEN c.sem_ia THEN 'SEM_IA'
    WHEN public.fn_ju_eh_equipe(c.telefone) THEN 'EQUIPE'$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_turno: gate não encontrado'; END IF;
  EXECUTE n;

  -- envio: última conferência
  d := pg_get_functiondef('public.fn_ju_responder'::regproc);
  n := replace(d, $a$    RETURN jsonb_build_object('pode', false, 'motivo', 'MENSAGEM_NOVA_OU_RESPONDIDA');
  END IF;$a$, $b$    RETURN jsonb_build_object('pode', false, 'motivo', 'MENSAGEM_NOVA_OU_RESPONDIDA');
  END IF;
  IF c.sem_ia THEN
    RETURN jsonb_build_object('pode', false, 'motivo', 'SEM_IA');
  END IF;$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_responder: trecho não encontrado'; END IF;
  EXECUTE n;

  -- ferramentas: pedido para a equipe
  d := pg_get_functiondef('public.fn_ju_chamar_secretaria'::regproc);
  n := replace(d, $a$  -- a família escreveu de novo enquanto a IA pensava: o turno novo decide$a$,
                  $b$  IF c.sem_ia THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'SEM_IA');
  END IF;
  -- a família escreveu de novo enquanto a IA pensava: o turno novo decide$b$);
  IF n = d THEN RAISE EXCEPTION 'fn_ju_chamar_secretaria: trecho não encontrado'; END IF;
  EXECUTE n;
END
$do$;

-- ferramentas: o fluxo de Ações consulta antes de qualquer ação
CREATE OR REPLACE FUNCTION public.fn_ju_modo_conversa(p_conversa_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'sombra', coalesce(public.fn_ju_sombra(c.telefone), false),
    'sem_ia', c.sem_ia,
    'alerta_simulado', (SELECT k.sombra_alerta FROM public.ju_config k WHERE k.id = 1))
  FROM public.ju_conversas c WHERE c.id = p_conversa_id;
$$;
