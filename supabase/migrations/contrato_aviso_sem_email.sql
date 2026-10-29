-- 29/10/2026 (dono): o contrato vai só pelo WhatsApp (Assinafy). O aviso e a Ju não falam mais em e-mail.
-- Texto dos nós n8n editori (Agendamento "Paciente sem contrato", Lembrete "Envia Notificação"/"Envia Notificação1"):
--   "Oi, [resp]! [frase] Posso reenviar para este WhatsApp? 😊"
UPDATE public.ju_conhecimento
   SET texto = replace(replace(texto,
         'o aviso pergunta "Posso reenviar para este WhatsApp e para o e-mail ...?"',
         'o aviso pergunta "Posso reenviar para este WhatsApp?"'),
         'Se a família disser que algum dado está errado (e-mail, WhatsApp, nome)',
         'O contrato chega só pelo WhatsApp: a Ju não fala em e-mail. Se a família disser que algum dado está errado (WhatsApp ou nome)'),
       updated_at = now()
 WHERE id = 'CONTRATO_ASSINATURA';
