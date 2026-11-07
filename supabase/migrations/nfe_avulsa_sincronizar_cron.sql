-- AI dev note: 07/11/2026. Agenda o cron das notas avulsas (troca de tomador). A função fn_nfe_avulsa_sincronizar
-- está em ju_nota_no_nome_de.sql: confere o resultado das trocas (avisa o 🔔 se falhou) e, quando a nota avulsa é
-- autorizada, grava o link e manda o PDF à família uma vez.
SELECT cron.schedule('nfe-avulsa-sincronizar', '*/10 * * * *', 'SELECT public.fn_nfe_avulsa_sincronizar()');
