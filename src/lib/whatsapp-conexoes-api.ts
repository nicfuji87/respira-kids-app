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

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp-conexoes', {
    body,
  });
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
