// AI dev note: Marketing → Oportunidades, "Precisam de ação" (admin). Dados de
// fn_atrib_oportunidades_acao (supabase/migrations/atribuicao_v2_p2_oportunidades_acao.sql):
// oportunidades COMERCIAIS de contato novo que pedem um passo da equipe, uma ação por
// oportunidade (a mais urgente). Não resolve nada aqui: só abre a conversa (WhatsApp /
// Chatwoot) e a jornada. A fila do dia de todas as conversas, com "resolver", é
// Conversas → Hoje (fn_conversas_hoje) — não duplicar regras de lá.

import { supabase } from '@/lib/supabase';

export type TipoAcao =
  | 'familia_esperando'
  | 'sem_horario'
  | 'confirmar_primeira'
  | 'familia_parou';

export interface AcaoOportunidade {
  oportunidade_id: number;
  conversa_id: number;
  tipo: TipoAcao;
  /** Crianças ligadas, ou o nome do WhatsApp quando ainda não há cadastro. */
  nome: string | null;
  responsavel: string | null;
  telefone: string | null;
  chatwoot_id: string | null;
  canal: string;
  etapa: string | null;
  aberta_em: string;
  /** Última mensagem de gente (família, Ju ou equipe), ISO. */
  desde: string;
  ultima_origem: 'CLIENTE' | 'JU' | 'HUMANO' | null;
  /** Hora de parede "AAAA-MM-DDTHH:MM". */
  proxima_sessao: string | null;
}

export interface DadosAcoes {
  gerado_em: string;
  dias: number;
  /** Oportunidades comerciais de contato novo abertas ou agendadas na janela. */
  abertas: number;
  /** Sem sessão e paradas há mais de 10 dias: perda, não fila. */
  paradas_10d: number;
  itens: AcaoOportunidade[];
}

export async function carregarAcoes(dias = 30): Promise<DadosAcoes> {
  const { data, error } = await supabase.rpc('fn_atrib_oportunidades_acao', {
    p_dias: dias,
  });
  if (error) throw new Error(error.message);
  const d = data as DadosAcoes;
  return {
    ...d,
    abertas: Number(d.abertas ?? 0),
    paradas_10d: Number(d.paradas_10d ?? 0),
    itens: d.itens ?? [],
  };
}

/** O que cada tipo significa e o que fazer. Ordem = urgência. */
export const ACAO: Record<
  TipoAcao,
  {
    rotulo: string;
    criterio: string;
    fazer: string;
    variante: 'attention' | 'warning' | 'muted';
  }
> = {
  familia_esperando: {
    rotulo: 'Família esperando resposta',
    criterio:
      'A última mensagem é da família, há mais de 30 min (e menos de 3 dias), e não é só um agradecimento.',
    fazer: 'Responder agora.',
    variante: 'attention',
  },
  sem_horario: {
    rotulo: 'Pediu horário, sem dia e hora',
    criterio:
      'Pediu para agendar e nenhuma mensagem da equipe ou da Ju trouxe dia ou hora (leitura do texto: pode haver oferta escrita de outro jeito).',
    fazer: 'Oferecer horários reais (dia e hora).',
    variante: 'attention',
  },
  confirmar_primeira: {
    rotulo: '1ª sessão a confirmar',
    criterio:
      'A primeira sessão é nas próximas 48 h e segue "Agendado" na agenda.',
    fazer: 'Confirmar com a família e marcar "Confirmado".',
    variante: 'warning',
  },
  familia_parou: {
    rotulo: 'Família parou de responder',
    criterio:
      'A equipe ou a Ju falou por último, há 2 a 10 dias, e não há sessão marcada. O follow-up automático pode já ter escrito.',
    fazer: 'Ver se ainda é recuperável e retomar com uma proposta concreta.',
    variante: 'muted',
  },
};

export const TIPOS_ACAO = Object.keys(ACAO) as TipoAcao[];
