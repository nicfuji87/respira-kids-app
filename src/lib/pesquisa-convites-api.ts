// AI dev note: Convites da Pesquisa de Experiência (meta da secretaria, set/2026).
// Lista e registro pelo servidor (fn_pesquisa_lista / fn_registrar_convite_pesquisa):
// família com 3+ sessões em 60 dias, sem pesquisa respondida há 6 meses,
// 1 convite válido a cada 30 dias. A meta mede convite e quantidade de
// respostas, NUNCA a nota (ver memória pesquisa-experiencia-antivies).

import { supabase } from './supabase';

export interface FamiliaPesquisa {
  responsavel_id: string;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
  pacientes: string | null;
  sessoes_60d: number;
  ultima_sessao: string;
  ultimo_convite_em: string | null;
  total_convites: number;
  respondida_em: string | null;
  proxima_em: string | null;
  conta_para_meta: boolean;
}

export async function fetchPesquisaLista(): Promise<FamiliaPesquisa[]> {
  const { data, error } = await supabase.rpc('fn_pesquisa_lista');
  if (error) throw new Error(error.message);
  return (data || []) as FamiliaPesquisa[];
}

export async function registrarConvitePesquisa(
  responsavelId: string,
  mensagem?: string
): Promise<{ conta_para_meta: boolean; motivo: string | null }> {
  const { data, error } = await supabase.rpc('fn_registrar_convite_pesquisa', {
    p_responsavel_id: responsavelId,
    p_metodo: 'whatsapp',
    p_mensagem: mensagem || null,
  });
  if (error) throw new Error(error.message);
  return data as { conta_para_meta: boolean; motivo: string | null };
}

export function linkPublicoPesquisa(): string {
  return `${window.location.origin}/#/experiencia`;
}

const primeiroNome = (nome: string | null | undefined): string | null => {
  const limpo = (nome || '').trim();
  return limpo ? limpo.split(/\s+/)[0] : null;
};

// AI dev note: texto neutro de propósito. Nada de "conte o quanto gostou" nem
// "sua opinião positiva": diz que é anônima e convida a falar do que não gostou.
export function montarConvitePesquisa(d: {
  responsavelNome: string | null;
  secretariaNome: string | null;
  link: string;
}): string {
  const resp = primeiroNome(d.responsavelNome);
  const eu = primeiroNome(d.secretariaNome);
  return [
    `${resp ? `Oi, ${resp}! Tudo bem?` : 'Oi! Tudo bem?'} ${eu ? `Aqui é a ${eu}, da Respira Kids.` : 'Aqui é da Respira Kids.'}`,
    'Estamos ouvindo as famílias para melhorar o nosso atendimento. Se puder, responda esta pesquisa curta, leva uns 3 minutos:',
    d.link,
    'Ela é anônima, então fique à vontade para contar também o que não foi bom. É isso que mais nos ajuda.',
  ].join('\n\n');
}
