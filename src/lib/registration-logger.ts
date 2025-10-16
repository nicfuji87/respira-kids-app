// AI dev note: Utilitários para logging do processo de cadastro público
// Anonimização de dados sensíveis para LGPD
// Funções type-safe sem uso de `any`

import { createClient } from '@supabase/supabase-js';

// Types para eventos de logging
export type RegistrationEventType =
  | 'step_started'
  | 'step_completed'
  | 'validation_error'
  | 'api_error'
  | 'success';

export type RegistrationStepName =
  | 'whatsapp'
  | 'responsible'
  | 'address'
  | 'patient'
  | 'pediatrician'
  | 'authorizations'
  | 'review'
  | 'finalization';

export interface RegistrationLogEvent {
  sessionId: string;
  eventType: RegistrationEventType;
  stepName?: RegistrationStepName;
  formData?: Record<string, unknown>;
  errorMessage?: string;
  errorStack?: string;
  userAgent?: string;
  browserInfo?: BrowserInfo;
}

export interface BrowserInfo {
  browser: string;
  screenResolution: string;
  language: string;
  timezone: string;
}

// Funções de anonimização (LGPD)
export function maskCPF(cpf: string): string {
  if (!cpf || cpf.length < 11) return cpf;
  // 225.929.381-68 -> 225.929.***-**
  return cpf.replace(/(\d{3})\.(\d{3})\.\d{3}-\d{2}/, '$1.$2.***-**');
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [localPart, domain] = email.split('@');
  // soniafujimoto@gmail.com -> s***@gmail.com
  const masked = localPart.charAt(0) + '***';
  return `${masked}@${domain}`;
}

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 8) return phone;
  // 6195033885 -> 61****3885
  const areaCode = phone.substring(0, 2);
  const lastFour = phone.substring(phone.length - 4);
  return `${areaCode}****${lastFour}`;
}

// Anonimiza dados do formulário
export function anonymizeFormData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const anonymized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      anonymized[key] = value;
      continue;
    }

    // Recursivamente anonimizar objetos nested
    if (typeof value === 'object' && !Array.isArray(value)) {
      anonymized[key] = anonymizeFormData(value as Record<string, unknown>);
      continue;
    }

    // Anonimizar campos específicos
    if (key === 'cpf' || key === 'cpf_cnpj') {
      anonymized[key] = typeof value === 'string' ? maskCPF(value) : value;
    } else if (key === 'email') {
      anonymized[key] = typeof value === 'string' ? maskEmail(value) : value;
    } else if (
      key === 'telefone' ||
      key === 'whatsapp' ||
      key === 'phoneNumber'
    ) {
      anonymized[key] = typeof value === 'string' ? maskPhone(value) : value;
    } else if (key === 'numero' || key === 'complemento') {
      // Omitir número e complemento (dados pessoais)
      anonymized[key] = '[OMITIDO]';
    } else {
      // Manter outros dados
      anonymized[key] = value;
    }
  }

  return anonymized;
}

// Coleta informações do navegador
export function getBrowserInfo(): BrowserInfo {
  return {
    browser: navigator.userAgent,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

// Gera ou recupera session ID do localStorage
export function getOrCreateSessionId(): string {
  const storageKey = 'registration_session_id';

  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return stored;
    }

    const newId = crypto.randomUUID();
    localStorage.setItem(storageKey, newId);
    return newId;
  } catch {
    // Fallback se localStorage não estiver disponível
    console.warn('localStorage não disponível, usando session ID temporário');
    return crypto.randomUUID();
  }
}

// Limpa session ID do localStorage (chamar após sucesso)
export function clearSessionId(): void {
  try {
    localStorage.removeItem('registration_session_id');
  } catch {
    // Ignorar erro silenciosamente
  }
}

// Envia log para Edge Function (não-bloqueante)
export async function sendLogEvent(event: RegistrationLogEvent): Promise<void> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn(
        'Supabase credentials não configuradas, logging desabilitado'
      );
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Chamar Edge Function de logging (fire-and-forget)
    supabase.functions
      .invoke('log-registration-event', {
        body: event,
      })
      .catch((error) => {
        // Nunca falhar - logging não deve impactar UX
        console.warn('Erro ao enviar log (ignorado):', error);
      });
  } catch (error) {
    // Nunca falhar - logging não deve impactar UX
    console.warn('Erro ao enviar log (ignorado):', error);
  }
}
