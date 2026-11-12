-- 12/11/2026 (caso Tamara, número russo): a conversa nascia com telefone nulo quando o número não era brasileiro,
-- então a Ju nunca achava o cadastro e as confirmações não saíam. Se o telefone vier nulo e o wa_chatid for um número
-- (E.164 sem +), o banco preenche '+dígitos', no mesmo formato das conversas brasileiras.
CREATE OR REPLACE FUNCTION public.fn_ju_conversas_telefone_padrao()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.telefone IS NULL AND NEW.wa_chatid ~ '^[0-9]{8,15}@s\.whatsapp\.net$' THEN
    NEW.telefone := '+' || split_part(NEW.wa_chatid, '@', 1);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ju_conversas_telefone_padrao ON public.ju_conversas;
CREATE TRIGGER trg_ju_conversas_telefone_padrao
  BEFORE INSERT OR UPDATE OF telefone, wa_chatid ON public.ju_conversas
  FOR EACH ROW EXECUTE FUNCTION public.fn_ju_conversas_telefone_padrao();

UPDATE public.ju_conversas SET telefone = '+' || split_part(wa_chatid, '@', 1)
 WHERE telefone IS NULL AND wa_chatid ~ '^[0-9]{8,15}@s\.whatsapp\.net$';
