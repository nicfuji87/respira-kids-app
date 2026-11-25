// AI dev note: Marketing → Resumo, "O que merece atenção" (admin). Motor de REGRAS
// verificáveis, não IA: cada insight tem critério explícito, evidência com os números
// e o tamanho da amostra, uma ação e onde agir. Sem amostra mínima a regra não
// dispara. O Resumo mostra no máximo 3 (os de maior prioridade); os demais ficam na
// aba correspondente. Dados: a mesma base do Retorno por canal (fn_atrib_retorno_canais),
// do Google Ads (fn_atrib_retorno_anuncios) e da Otimização (resumoConvenio, mesma
// regra do alerta semanal fn_atrib_alerta_convenio).
// Regra nova aqui? Diga o critério no comentário dela e nunca prometa resultado.

import { brl, num, pct } from '@/lib/marketing-atribuicao';
import { somarCanais, type DadosCanais } from '@/lib/marketing-canais';
import type { ResumoConvenio } from '@/lib/marketing-otimizacao';

/** Aba do Marketing onde a ação acontece. */
export type AbaMarketing =
  | 'resumo'
  | 'canais'
  | 'google'
  | 'oportunidades'
  | 'qualidade';

/** Recorte que um insight pede ao abrir a aba (ex.: só pacientes a conferir). */
export type FocoMarketing = 'a_conferir' | 'sem_origem';

export interface Insight {
  id: string;
  /** O que foi identificado. */
  titulo: string;
  /** Os números que sustentam, com o tamanho da amostra. */
  evidencia: string;
  /** O que fazer. */
  acao: string;
  /** Onde agir. foco = recorte que a aba abre já aplicado. */
  onde: { aba: AbaMarketing; rotulo: string; foco?: FocoMarketing };
  /** Maior = mais urgente. Só ordena; não é exibido. */
  prioridade: number;
}

export const MAX_INSIGHTS_RESUMO = 3;

interface Entrada {
  canais: DadosCanais | null;
  convenio: ResumoConvenio | null;
}

/** Pediram horário e não marcaram. Critério: ≥ 3 conversas de contato novo em
 *  "pediu horário" sem sessão marcada (recorte sem filtro de serviço). */
function pediramHorario(d: DadosCanais): Insight | null {
  const t = somarCanais(d.canais);
  if (t.pediram_horario == null || t.conversas == null) return null;
  if (t.pediram_horario < 3) return null;
  return {
    id: 'pediram_horario',
    titulo: `${num(t.pediram_horario)} contatos pediram horário e ainda não agendaram`,
    evidencia: `${num(t.pediram_horario)} das ${num(t.conversas)} conversas de contato novo do período pediram para agendar e não têm sessão marcada.`,
    acao: 'Separe quem ainda é recuperável e ofereça horários reais (dia e hora), não só o valor.',
    onde: { aba: 'oportunidades', rotulo: 'Ver oportunidades' },
    prioridade: t.pediram_horario * 3,
  };
}

/** Sessões sem baixa. Critério: ≥ 3 sessões que já passaram e seguem "Agendado" ou
 *  "Confirmado" entre as pacientes do recorte. Aponta o serviço quando ≥ 70% das
 *  pacientes a conferir são dele. */
function semBaixa(d: DadosCanais): Insight | null {
  const t = somarCanais(d.canais);
  const sessoes = t.sessoes_provaveis + t.sessoes_pendentes;
  if (sessoes < 3) return null;
  const aConferir = d.pacientes.filter(
    (p) => p.presenca === 'provavel' || p.presenca === 'pendente'
  );
  const porServico = new Map<string, number>();
  aConferir.forEach((p) => {
    const s = p.servico ?? 'sem serviço';
    porServico.set(s, (porServico.get(s) ?? 0) + 1);
  });
  const [servico, qt] = [...porServico.entries()].sort(
    (a, b) => b[1] - a[1]
  )[0] ?? ['', 0];
  const concentrado =
    aConferir.length >= 3 && qt / aConferir.length >= 0.7
      ? ` ${num(qt)} de ${num(aConferir.length)} são de ${servico}.`
      : '';
  return {
    id: 'sem_baixa',
    titulo: `${num(sessoes)} sessões precisam de conferência na agenda`,
    evidencia: `Já passaram e seguem "Agendado" ou "Confirmado": ${num(aConferir.length)} paciente(s) ficam fora de "atendidas" e ${brl(t.receita_a_conferir)} fora da receita realizada.${concentrado}`,
    acao: 'Dê baixa nessas sessões (Finalizado ou Faltou). Pagamento não confirma presença, porque a falta também é cobrada.',
    onde: {
      aba: 'canais',
      rotulo: 'Ver pacientes a conferir',
      foco: 'a_conferir',
    },
    prioridade: aConferir.length * 3 + sessoes,
  };
}

/** Google Ads perde entre conversa e agendamento. Critério: ≥ 15 conversas do
 *  anúncio, ≥ 20 nos demais canais e taxa de agendamento do anúncio < 60% da dos
 *  demais. */
function adsConversaAgendamento(d: DadosCanais): Insight | null {
  const ads = d.canais.find((c) => c.canal === 'google_ads');
  if (!ads || ads.conversas == null || ads.conversas < 15) return null;
  const outros = somarCanais(d.canais.filter((c) => c.canal !== 'google_ads'));
  if (outros.conversas == null || outros.conversas < 20) return null;
  const tAds = ads.agendaram / ads.conversas;
  const tOutros = outros.agendaram / outros.conversas;
  if (!(tAds < 0.6 * tOutros)) return null;
  return {
    id: 'ads_conversa_agendamento',
    titulo: 'Google Ads: muitas conversas e poucos agendamentos',
    evidencia: `${num(ads.conversas)} conversas vindas do anúncio e ${num(ads.agendaram)} agendamentos (${pct(tAds)}), contra ${pct(tOutros)} nos demais canais (${num(outros.conversas)} conversas).`,
    acao: 'Leia as conversas do anúncio que não agendaram (valor, horário oferecido, convênio): a perda está entre a conversa e o agendamento, não no clique.',
    onde: { aba: 'google', rotulo: 'Ver Google Ads' },
    prioridade: (tOutros - tAds) * ads.conversas * 3,
  };
}

/** Convênio. Mesma regra do alerta semanal: ≥ 10 contatos de anúncio que citaram e
 *  agendamento < metade dos demais. Nunca recomenda negativar sem gasto em buscas
 *  com nome de operadora. */
function convenio(c: ResumoConvenio): Insight | null {
  if (
    c.recomendacao !== 'investigar_conversa' &&
    c.recomendacao !== 'revisar_termos'
  )
    return null;
  const { citou, nao } = c.pago;
  const evidencia = `${num(citou.conversas)} conversas de anúncio citaram convênio, plano ou reembolso: ${num(citou.agendaram)} agendaram (${pct(citou.taxa)}), contra ${pct(nao.taxa)} de quem não citou. Gasto em buscas com nome de operadora: ${brl(c.termos.custo)}.`;
  return {
    id: 'convenio',
    titulo: 'Quem cita convênio quase não agenda',
    evidencia,
    acao:
      c.recomendacao === 'revisar_termos'
        ? 'Revise os termos de pesquisa com nome de operadora antes de negativar: só eles justificam a negativa.'
        : 'Deixe claro no anúncio e na página que o atendimento é particular, com reembolso, e separe quem precisa usar o plano de quem só pergunta de reembolso. Não negative operadoras: não há busca paga por elas.',
    onde: { aba: 'google', rotulo: 'Ver convênio no Google Ads' },
    prioridade:
      citou.conversas * Math.max(0, (nao.taxa ?? 0) - (citou.taxa ?? 0)) * 2,
  };
}

/** Muita conversa sem origem. Critério: ≥ 30 conversas e ≥ 50% sem código RK. */
function semOrigem(d: DadosCanais): Insight | null {
  const total = d.conversas.length;
  if (total < 30) return null;
  const sem = d.conversas.filter((c) => c.canal === 'nao_atribuido').length;
  if (sem / total < 0.5) return null;
  return {
    id: 'sem_origem',
    titulo: `${pct(sem / total)} das conversas chegam sem origem identificada`,
    evidencia: `${num(sem)} de ${num(total)} conversas de contato novo chamaram direto no WhatsApp, sem o código do site (indicação, perfil do Google, contato salvo).`,
    acao: 'Não conclua que um canal rende pouco por isso. A Ju pergunta como a família conheceu: acompanhe as respostas em Canais antes de mudar verba.',
    onde: {
      aba: 'canais',
      rotulo: 'Ver o que as famílias disseram',
      foco: 'sem_origem',
    },
    prioridade: 4,
  };
}

/** Todos os insights que dispararam, do mais urgente ao menos. */
export function gerarInsights(e: Entrada): Insight[] {
  const lista: (Insight | null)[] = [];
  if (e.canais) {
    lista.push(
      pediramHorario(e.canais),
      semBaixa(e.canais),
      adsConversaAgendamento(e.canais),
      semOrigem(e.canais)
    );
  }
  if (e.convenio) lista.push(convenio(e.convenio));
  return lista
    .filter((x): x is Insight => x != null)
    .sort((a, b) => b.prioridade - a.prioridade);
}
