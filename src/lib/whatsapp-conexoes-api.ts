// AI dev note: chamadas da aba Configurações > Integrações > WhatsApp.
// Tudo passa pela edge `whatsapp-conexoes`; os tokens da uazapi e do QuePasa
// ficam no Vault e nunca chegam ao navegador.

import { supabase } from './supabase';

export type InstanciaWhatsApp = 'uazapi' | 'chatwoot';

export interface StatusConexaoWhatsApp {
  instancia: InstanciaWhatsApp;
  conectado: boolean;
  estado: 'conectado' | 'conectando' | 'desconectado' | 'indisponivel';
  numero: string | null;
  perfil: string | null;
  ultima_queda: string | null;
  motivo_queda: string | null;
  qrcode: string | null;
  erro: string | null;
}

// "Failed to send a request to the Edge Function" = a chamada nem saiu do aparelho
// (celular sem internet, recém-reiniciado ou voltando de outro app). Acontece
// bastante aqui, porque o checklist manda reiniciar o celular da recepção.
const ERRO_REDE = 'FunctionsFetchError';
const TENTATIVAS = 3;

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  let resposta = await supabase.functions.invoke('whatsapp-conexoes', {
    body,
  });
  for (let i = 1; i < TENTATIVAS && resposta.error?.name === ERRO_REDE; i++) {
    await new Promise((r) => setTimeout(r, 1500 * i));
    resposta = await supabase.functions.invoke('whatsapp-conexoes', { body });
  }
  const { data, error } = resposta;
  if (error?.name === ERRO_REDE) {
    throw new Error(
      'Sem conexão com o servidor. Confira a internet deste aparelho e tente de novo.'
    );
  }
  if (error) {
    let msg = error.message;
    if ('context' in error) {
      try {
        const corpo = (await (error.context as Response).json()) as {
          error?: string;
        };
        if (corpo.error) msg = corpo.error;
      } catch {
        // corpo não era JSON
      }
    }
    throw new Error(msg);
  }
  return data as T;
}

export async function buscarStatusWhatsApp(): Promise<StatusConexaoWhatsApp[]> {
  const r = await chamar<{ conexoes: StatusConexaoWhatsApp[] }>({
    acao: 'status',
  });
  return r.conexoes ?? [];
}

export async function gerarQrWhatsApp(
  instancia: InstanciaWhatsApp
): Promise<string> {
  const r = await chamar<{ ok: boolean; qrcode?: string; erro?: string }>({
    acao: 'qr',
    instancia,
  });
  if (!r.ok || !r.qrcode)
    throw new Error(r.erro || 'Não foi possível gerar o QR');
  return r.qrcode;
}

export async function reiniciarChatwootWhatsApp(): Promise<void> {
  const r = await chamar<{ ok: boolean; erro?: string }>({
    acao: 'reiniciar',
    instancia: 'chatwoot',
  });
  if (!r.ok) throw new Error(r.erro || 'Não foi possível reiniciar');
}
