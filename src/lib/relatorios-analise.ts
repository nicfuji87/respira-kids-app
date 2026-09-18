// AI dev note: Cálculos dos RELATÓRIOS (tradicionais + insights) em cima da base
// compacta de fn_relatorios_base (uma linha por agendamento, IDs viram índices,
// nenhum nome de paciente). Funções puras: dá para rodar em node contra a base
// real para conferir os números (foi assim que os insights foram validados).
//
// Definições (as mesmas das metas, ver supabase/migrations/metas_reativacao_v2.sql):
// - Sessão realizada: não cancelada/reagendada/erro/faltou e já aconteceu.
// - data_hora é hora de parede: comparar com "agora" local, nunca com UTC.
// - Retorno: sessão realizada 60+ dias depois da sessão anterior do paciente.
// - Pool parado: pacientes cuja última sessão foi há 60–365 dias.

export type SessaoRow = [
  string, // data_hora parede 'YYYY-MM-DDTHH:MM'
  number, // paciente_ix
  number | null, // profissional_ix
  number | null, // servico_ix
  string, // status (codigo)
  number | null, // valor
  number | null, // horas até a primeira evolução (null = sem evolução)
];

export type ContatoRow = [string, number, boolean, string | null];

export interface RelatoriosBase {
  gerado_em: string;
  hoje: string;
  pacientes: (string | null)[];
  profissionais: string[];
  servicos: { nome: string; grupo: 'respiratoria' | 'motora' | 'outro' }[];
  sessoes: SessaoRow[];
  contatos: ContatoRow[];
}

export type Grupo = 'respiratoria' | 'motora' | 'outro';

export interface Sessao {
  quando: string;
  dia: string;
  mes: string;
  paciente: number;
  profissional: number | null;
  servico: number | null;
  grupo: Grupo;
  status: string;
  valor: number;
  evolucaoHoras: number | null;
  realizada: boolean;
  futura: boolean;
}

const NAO_REALIZADA = new Set(['cancelado', 'reagendado', 'erro', 'faltou']);

export const DIA_MS = 864e5;
export const diasEntre = (a: string, b: string) =>
  Math.round(
    (Date.parse(b.slice(0, 10) + 'T00:00:00Z') -
      Date.parse(a.slice(0, 10) + 'T00:00:00Z')) /
      DIA_MS
  );

export const addMeses = (mes: string, n: number): string => {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export const addDias = (dia: string, n: number): string =>
  new Date(Date.parse(dia + 'T00:00:00Z') + n * DIA_MS)
    .toISOString()
    .slice(0, 10);

export const mesesEntre = (de: string, ate: string): string[] => {
  const out: string[] = [];
  for (let m = de; m <= ate; m = addMeses(m, 1)) out.push(m);
  return out;
};

const mediana = (v: number[]): number => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
const media = (v: number[]) =>
  v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
const pct = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0);

// ---------------------------------------------------------------------------
// Preparação
// ---------------------------------------------------------------------------

export interface Dataset {
  base: RelatoriosBase;
  agora: string; // 'YYYY-MM-DDTHH:MM' parede
  hoje: string;
  mesAtual: string;
  sessoes: Sessao[];
  /** sessões realizadas por paciente, em ordem */
  porPaciente: Map<number, Sessao[]>;
  contatos: {
    dia: string;
    paciente: number;
    valido: boolean;
    resultado: string | null;
  }[];
}

export function prepararDataset(base: RelatoriosBase, agora?: string): Dataset {
  const agoraParede =
    agora ??
    (() => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    })();
  const sessoes: Sessao[] = base.sessoes.map((r) => {
    const futura = r[0] > agoraParede;
    const grupo: Grupo =
      r[3] != null ? (base.servicos[r[3]]?.grupo ?? 'outro') : 'outro';
    return {
      quando: r[0],
      dia: r[0].slice(0, 10),
      mes: r[0].slice(0, 7),
      paciente: r[1],
      profissional: r[2],
      servico: r[3],
      grupo,
      status: r[4],
      valor: Number(r[5] ?? 0),
      evolucaoHoras: r[6] == null ? null : Number(r[6]),
      realizada: !futura && !NAO_REALIZADA.has(r[4]),
      futura,
    };
  });
  const porPaciente = new Map<number, Sessao[]>();
  for (const s of sessoes) {
    if (!s.realizada) continue;
    const arr = porPaciente.get(s.paciente);
    if (arr) arr.push(s);
    else porPaciente.set(s.paciente, [s]);
  }
  for (const arr of porPaciente.values())
    arr.sort((a, b) => (a.quando < b.quando ? -1 : 1));
  return {
    base,
    agora: agoraParede,
    hoje: agoraParede.slice(0, 10),
    mesAtual: agoraParede.slice(0, 7),
    sessoes,
    porPaciente,
    contatos: base.contatos.map((c) => ({
      dia: c[0].slice(0, 10),
      paciente: c[1],
      valido: c[2],
      resultado: c[3],
    })),
  };
}

const idadeMesesEm = (
  ds: Dataset,
  paciente: number,
  dia: string
): number | null => {
  const nasc = ds.base.pacientes[paciente];
  if (!nasc) return null;
  return diasEntre(nasc, dia) / 30.4375;
};

// ---------------------------------------------------------------------------
// RELATÓRIOS TRADICIONAIS
// ---------------------------------------------------------------------------

export interface LinhaMensal {
  mes: string;
  realizadas: number;
  respiratoria: number;
  motora: number;
  receita: number;
  pacientes: number;
  novos: number;
  retornos: number;
  ticketMedio: number;
  faltas: number;
  cancelamentos: number;
  reagendamentos: number;
}

export function relatorioMensal(
  ds: Dataset,
  de: string,
  ate: string
): LinhaMensal[] {
  const primeira = new Map<number, string>();
  const retornoMes = new Map<string, Set<number>>();
  for (const [p, arr] of ds.porPaciente) {
    primeira.set(p, arr[0].mes);
    for (let i = 1; i < arr.length; i++) {
      if (diasEntre(arr[i - 1].dia, arr[i].dia) >= 60) {
        const m = arr[i].mes;
        if (!retornoMes.has(m)) retornoMes.set(m, new Set());
        retornoMes.get(m)!.add(p);
      }
    }
  }
  const linhas = new Map<string, LinhaMensal & { _pac: Set<number> }>();
  for (const m of mesesEntre(de, ate))
    linhas.set(m, {
      mes: m,
      realizadas: 0,
      respiratoria: 0,
      motora: 0,
      receita: 0,
      pacientes: 0,
      novos: 0,
      retornos: retornoMes.get(m)?.size ?? 0,
      ticketMedio: 0,
      faltas: 0,
      cancelamentos: 0,
      reagendamentos: 0,
      _pac: new Set(),
    });
  for (const s of ds.sessoes) {
    const l = linhas.get(s.mes);
    if (!l || s.futura) continue;
    if (s.status === 'faltou') l.faltas++;
    if (s.status === 'cancelado') l.cancelamentos++;
    if (s.status === 'reagendado') l.reagendamentos++;
    if (!s.realizada) continue;
    l.realizadas++;
    if (s.grupo === 'respiratoria') l.respiratoria++;
    if (s.grupo === 'motora') l.motora++;
    l.receita += s.valor;
    l._pac.add(s.paciente);
  }
  for (const [, m] of primeira) {
    const l = linhas.get(m);
    if (l) l.novos++;
  }
  return [...linhas.values()].map(({ _pac, ...l }) => ({
    ...l,
    pacientes: _pac.size,
    ticketMedio: l.realizadas ? l.receita / l.realizadas : 0,
  }));
}

export interface LinhaProfissional {
  profissional: string;
  realizadas: number;
  pacientes: number;
  receita: number;
  comEvolucao: number; // %
  em24h: number; // %
  medianaHorasEvolucao: number | null;
}

export function relatorioPorProfissional(
  ds: Dataset,
  de: string,
  ate: string
): LinhaProfissional[] {
  const acc = new Map<
    number,
    {
      n: number;
      pac: Set<number>;
      rec: number;
      ev: number;
      e24: number;
      horas: number[];
      baseEv: number;
    }
  >();
  const limiteEv = addDias(ds.hoje, -1);
  for (const s of ds.sessoes) {
    if (!s.realizada || s.mes < de || s.mes > ate || s.profissional == null)
      continue;
    const a = acc.get(s.profissional) ?? {
      n: 0,
      pac: new Set(),
      rec: 0,
      ev: 0,
      e24: 0,
      horas: [],
      baseEv: 0,
    };
    a.n++;
    a.pac.add(s.paciente);
    a.rec += s.valor;
    if (s.dia <= limiteEv) {
      a.baseEv++;
      if (s.evolucaoHoras != null) {
        a.ev++;
        a.horas.push(s.evolucaoHoras);
        if (s.evolucaoHoras <= 24) a.e24++;
      }
    }
    acc.set(s.profissional, a);
  }
  return [...acc.entries()]
    .map(([ix, a]) => ({
      profissional: ds.base.profissionais[ix] ?? '—',
      realizadas: a.n,
      pacientes: a.pac.size,
      receita: a.rec,
      comEvolucao: pct(a.ev, a.baseEv),
      em24h: pct(a.e24, a.baseEv),
      medianaHorasEvolucao: a.horas.length ? mediana(a.horas) : null,
    }))
    .sort((a, b) => b.realizadas - a.realizadas);
}

export interface LinhaServico {
  servico: string;
  grupo: Grupo;
  realizadas: number;
  receita: number;
  participacao: number; // % das sessões
}

export function relatorioPorServico(
  ds: Dataset,
  de: string,
  ate: string
): LinhaServico[] {
  const acc = new Map<number, { n: number; rec: number }>();
  let total = 0;
  for (const s of ds.sessoes) {
    if (!s.realizada || s.mes < de || s.mes > ate || s.servico == null)
      continue;
    const a = acc.get(s.servico) ?? { n: 0, rec: 0 };
    a.n++;
    a.rec += s.valor;
    total++;
    acc.set(s.servico, a);
  }
  return [...acc.entries()]
    .map(([ix, a]) => ({
      servico: (ds.base.servicos[ix]?.nome ?? '—').replace(/\s+/g, ' '),
      grupo: ds.base.servicos[ix]?.grupo ?? 'outro',
      realizadas: a.n,
      receita: a.rec,
      participacao: pct(a.n, total),
    }))
    .sort((a, b) => b.realizadas - a.realizadas);
}

// ---------------------------------------------------------------------------
// INSIGHTS
// ---------------------------------------------------------------------------

/** Última sessão realizada de cada paciente ANTES do dia `dia`. */
function ultimaAntes(arr: Sessao[], dia: string): Sessao | null {
  let lo = 0,
    hi = arr.length - 1,
    ans: Sessao | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].dia < dia) {
      ans = arr[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export interface PoolAtual {
  faixas: { faixa: string; pacientes: number }[];
  total60a365: number;
  comAgendamento: number;
}

export function poolParadoAtual(ds: Dataset): PoolAtual {
  const futuros = new Set(
    ds.sessoes
      .filter((s) => s.futura && !NAO_REALIZADA.has(s.status))
      .map((s) => s.paciente)
  );
  const faixas: Record<string, number> = {
    '60–90 dias': 0,
    '90–180 dias': 0,
    '180–365 dias': 0,
    '1 a 1,5 ano': 0,
    'mais de 1,5 ano': 0,
  };
  let comAg = 0;
  for (const [p, arr] of ds.porPaciente) {
    const g = diasEntre(arr[arr.length - 1].dia, ds.hoje);
    if (g < 60) continue;
    if (futuros.has(p)) {
      comAg++;
      continue;
    }
    const k =
      g < 90
        ? '60–90 dias'
        : g < 180
          ? '90–180 dias'
          : g <= 365
            ? '180–365 dias'
            : g <= 540
              ? '1 a 1,5 ano'
              : 'mais de 1,5 ano';
    faixas[k]++;
  }
  return {
    faixas: Object.entries(faixas).map(([faixa, pacientes]) => ({
      faixa,
      pacientes,
    })),
    total60a365:
      faixas['60–90 dias'] + faixas['90–180 dias'] + faixas['180–365 dias'],
    comAgendamento: comAg,
  };
}

export interface LinhaRetornoMensal {
  mes: string;
  pool: number;
  retornos: number;
  taxa: number;
}

/**
 * Para cada mês: quantos estavam parados há 60–365 dias no dia 1 e quantos
 * desses fizeram sessão no mês (retorno "natural" enquanto não há campanha).
 */
export function retornoMensal(
  ds: Dataset,
  de: string,
  ate: string,
  filtro?: (
    paciente: number,
    anteriores: Sessao[],
    inicioMes: string
  ) => boolean
): LinhaRetornoMensal[] {
  const out: LinhaRetornoMensal[] = [];
  for (const m of mesesEntre(de, ate)) {
    const ini = m + '-01';
    const fim = addMeses(m, 1) + '-01';
    let pool = 0,
      ret = 0;
    for (const [p, arr] of ds.porPaciente) {
      const u = ultimaAntes(arr, ini);
      if (!u) continue;
      const g = diasEntre(u.dia, ini);
      if (g < 60 || g > 365) continue;
      if (filtro) {
        const anteriores = arr.filter((s) => s.dia < ini);
        if (!filtro(p, anteriores, ini)) continue;
      }
      pool++;
      if (arr.some((s) => s.dia >= ini && s.dia < fim)) ret++;
    }
    out.push({ mes: m, pool, retornos: ret, taxa: pct(ret, pool) });
  }
  return out;
}

export interface Sazonalidade {
  porMesDoAno: { mes: number; taxa: number; amostras: number }[];
  mediaGeral: number;
  fortes: number[];
  fracos: number[];
}

export function sazonalidadeRetorno(
  linhas: LinhaRetornoMensal[]
): Sazonalidade {
  const acc = new Map<number, number[]>();
  for (const l of linhas) {
    if (l.pool < 50) continue; // meses do começo, com pool pequeno, distorcem
    const mm = Number(l.mes.slice(5, 7));
    acc.set(mm, [...(acc.get(mm) ?? []), l.taxa]);
  }
  const porMesDoAno = Array.from({ length: 12 }, (_, i) => {
    const v = acc.get(i + 1) ?? [];
    return { mes: i + 1, taxa: media(v), amostras: v.length };
  });
  const validos = porMesDoAno.filter((x) => x.amostras > 0);
  const mediaGeral = media(validos.map((x) => x.taxa));
  return {
    porMesDoAno,
    mediaGeral,
    fortes: validos.filter((x) => x.taxa >= mediaGeral * 1.2).map((x) => x.mes),
    fracos: validos.filter((x) => x.taxa <= mediaGeral * 0.8).map((x) => x.mes),
  };
}

export interface ValorRetorno {
  retornos: number;
  sessoesMedia: number;
  sessoesMediana: number;
  receitaMedia: number;
  receitaMediana: number;
}

/** O que um retorno rende nos 45 dias seguintes (só retornos com 45 dias já passados). */
export function valorDeUmRetorno(ds: Dataset): ValorRetorno {
  const limite = addDias(ds.hoje, -45);
  const ns: number[] = [],
    rs: number[] = [];
  for (const arr of ds.porPaciente.values()) {
    for (let i = 1; i < arr.length; i++) {
      if (diasEntre(arr[i - 1].dia, arr[i].dia) < 60 || arr[i].dia > limite)
        continue;
      const fim = addDias(arr[i].dia, 45);
      const ep = arr.filter((s) => s.dia >= arr[i].dia && s.dia <= fim);
      ns.push(ep.length);
      rs.push(ep.reduce((a, s) => a + s.valor, 0));
    }
  }
  return {
    retornos: ns.length,
    sessoesMedia: media(ns),
    sessoesMediana: mediana(ns),
    receitaMedia: media(rs),
    receitaMediana: mediana(rs),
  };
}

export interface MotoraParaRespiratoria {
  comecaramNaMotora: number;
  fizeramRespiratoria: number;
  percentual: number;
  medianaDias: number;
  retornoPorPerfil: { perfil: string; taxaMensal: number; poolMes: number }[];
}

export function motoraParaRespiratoria(ds: Dataset): MotoraParaRespiratoria {
  let comecaram = 0,
    fizeram = 0;
  const lags: number[] = [];
  for (const arr of ds.porPaciente.values()) {
    if (arr[0].grupo !== 'motora') continue;
    comecaram++;
    const r = arr.find((s) => s.grupo === 'respiratoria');
    if (r) {
      fizeram++;
      lags.push(diasEntre(arr[0].dia, r.dia));
    }
  }
  const de = addMeses(ds.mesAtual, -12),
    ate = addMeses(ds.mesAtual, -1);
  const perfil = (ant: Sessao[]) => {
    const r = ant.some((s) => s.grupo === 'respiratoria');
    const m = ant.some((s) => s.grupo === 'motora');
    return r && m
      ? 'Motora + respiratória'
      : m
        ? 'Só motora (alta)'
        : 'Só respiratória';
  };
  const retornoPorPerfil = [
    'Só respiratória',
    'Motora + respiratória',
    'Só motora (alta)',
  ].map((nome) => {
    const linhas = retornoMensal(
      ds,
      de,
      ate,
      (_p, ant) => perfil(ant) === nome
    );
    const pool = linhas.reduce((a, l) => a + l.pool, 0);
    const ret = linhas.reduce((a, l) => a + l.retornos, 0);
    return {
      perfil: nome,
      taxaMensal: pct(ret, pool),
      poolMes: pool / Math.max(linhas.length, 1),
    };
  });
  return {
    comecaramNaMotora: comecaram,
    fizeramRespiratoria: fizeram,
    percentual: pct(fizeram, comecaram),
    medianaDias: mediana(lags),
    retornoPorPerfil,
  };
}

export function retornoPorIdade(
  ds: Dataset
): { faixa: string; taxaMensal: number; amostras: number }[] {
  const de = addMeses(ds.mesAtual, -12),
    ate = addMeses(ds.mesAtual, -1);
  const faixas: [string, number, number][] = [
    ['Menos de 1 ano', 0, 12],
    ['1 a 3 anos', 12, 36],
    ['3 a 6 anos', 36, 72],
    ['6 anos ou mais', 72, 9999],
  ];
  return faixas.map(([nome, a, b]) => {
    const linhas = retornoMensal(ds, de, ate, (p, ant, ini) => {
      if (!ant.some((s) => s.grupo === 'respiratoria')) return false;
      const idade = idadeMesesEm(ds, p, ini);
      return idade != null && idade >= a && idade < b;
    });
    const pool = linhas.reduce((x, l) => x + l.pool, 0);
    const ret = linhas.reduce((x, l) => x + l.retornos, 0);
    return { faixa: nome, taxaMensal: pct(ret, pool), amostras: pool };
  });
}

export interface LinhaCampanha {
  mes: string;
  retornos: number;
  esperados: number;
  atribuidos: number;
  contatosValidos: number;
}

/**
 * Campanha x natural: retornos do mês (pool 60–365) contra o esperado pela
 * taxa média do mesmo mês nos anos anteriores; e quantos retornos tiveram
 * contato válido nos 30 dias antes.
 */
export function campanhaVsNatural(ds: Dataset, meses = 6): LinhaCampanha[] {
  const ate = ds.mesAtual;
  const de = addMeses(ate, -(meses - 1));
  const historico = retornoMensal(ds, addMeses(de, -36), addMeses(de, -1));
  const saz = sazonalidadeRetorno(historico);
  const linhas = retornoMensal(ds, de, ate);
  const contatosPorPaciente = new Map<number, string[]>();
  for (const c of ds.contatos) {
    if (!c.valido) continue;
    contatosPorPaciente.set(c.paciente, [
      ...(contatosPorPaciente.get(c.paciente) ?? []),
      c.dia,
    ]);
  }
  return linhas.map((l) => {
    const ini = l.mes + '-01';
    const fim = addMeses(l.mes, 1) + '-01';
    const mm = Number(l.mes.slice(5, 7));
    const taxa = saz.porMesDoAno[mm - 1].amostras
      ? saz.porMesDoAno[mm - 1].taxa
      : saz.mediaGeral;
    let atribuidos = 0;
    for (const [p, dias] of contatosPorPaciente) {
      const arr = ds.porPaciente.get(p) ?? [];
      const ok = arr.some(
        (s) =>
          s.dia >= ini &&
          s.dia < fim &&
          dias.some((d) => s.dia >= d && diasEntre(d, s.dia) <= 30)
      );
      if (ok) atribuidos++;
    }
    // Mês corrente: esperado proporcional aos dias já passados.
    const diasNoMes = diasEntre(ini, fim);
    const fracao =
      l.mes === ds.mesAtual
        ? Math.min(1, (diasEntre(ini, ds.hoje) + 1) / diasNoMes)
        : 1;
    return {
      mes: l.mes,
      retornos: l.retornos,
      esperados: ((l.pool * taxa) / 100) * fracao,
      atribuidos,
      contatosValidos: ds.contatos.filter(
        (c) => c.valido && c.dia >= ini && c.dia < fim
      ).length,
    };
  });
}

export function retencaoPrimeiraSessao(
  ds: Dataset,
  meses = 12
): { mes: string; novos: number; voltaram: number; taxa: number }[] {
  // Só meses cujos novos já tiveram 60 dias para voltar.
  const ate = addMeses(ds.mesAtual, -3);
  const de = addMeses(ate, -(meses - 1));
  const acc = new Map<string, { novos: number; voltaram: number }>();
  for (const m of mesesEntre(de, ate)) acc.set(m, { novos: 0, voltaram: 0 });
  for (const arr of ds.porPaciente.values()) {
    const a = acc.get(arr[0].mes);
    if (!a) continue;
    a.novos++;
    if (arr[1] && diasEntre(arr[0].dia, arr[1].dia) <= 60) a.voltaram++;
  }
  return [...acc.entries()].map(([mes, a]) => ({
    mes,
    ...a,
    taxa: pct(a.voltaram, a.novos),
  }));
}

export function evolucoesMensal(
  ds: Dataset,
  meses = 6
): { mes: string; cobertura: number; em24h: number; sessoes: number }[] {
  const ate = ds.mesAtual;
  const de = addMeses(ate, -(meses - 1));
  const limite = addDias(ds.hoje, -1);
  const acc = new Map<string, { n: number; ev: number; e24: number }>();
  for (const m of mesesEntre(de, ate)) acc.set(m, { n: 0, ev: 0, e24: 0 });
  for (const s of ds.sessoes) {
    const a = acc.get(s.mes);
    if (!a || !s.realizada || s.dia > limite) continue;
    a.n++;
    if (s.evolucaoHoras != null) {
      a.ev++;
      if (s.evolucaoHoras <= 24) a.e24++;
    }
  }
  return [...acc.entries()].map(([mes, a]) => ({
    mes,
    sessoes: a.n,
    cobertura: pct(a.ev, a.n),
    em24h: pct(a.e24, a.n),
  }));
}

export function qualidadeFaltas(
  ds: Dataset,
  meses = 12
): { mes: string; agendadas: number; faltas: number; taxa: number }[] {
  const ate = ds.mesAtual;
  const de = addMeses(ate, -(meses - 1));
  const acc = new Map<string, { ag: number; f: number }>();
  for (const m of mesesEntre(de, ate)) acc.set(m, { ag: 0, f: 0 });
  for (const s of ds.sessoes) {
    const a = acc.get(s.mes);
    if (
      !a ||
      s.futura ||
      s.status === 'erro' ||
      s.status === 'reagendado' ||
      s.status === 'cancelado'
    )
      continue;
    a.ag++;
    if (s.status === 'faltou') a.f++;
  }
  return [...acc.entries()].map(([mes, a]) => ({
    mes,
    agendadas: a.ag,
    faltas: a.f,
    taxa: pct(a.f, a.ag),
  }));
}

// ---------------------------------------------------------------------------
// Formatação compartilhada
// ---------------------------------------------------------------------------

const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];
const MESES_LONGOS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export const rotuloMes = (mes: string) =>
  `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
export const nomeMes = (n: number) => MESES_LONGOS[n - 1];

export const brl = (v: number, casas = 0) =>
  v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

export const num = (v: number, casas = 0) =>
  v.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

export function paraCsv(
  linhas: Record<string, unknown>[],
  colunas: { chave: string; titulo: string }[]
): string {
  const esc = (v: unknown) => {
    const s =
      v == null
        ? ''
        : typeof v === 'number'
          ? String(v).replace('.', ',')
          : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    colunas.map((c) => esc(c.titulo)).join(';'),
    ...linhas.map((l) => colunas.map((c) => esc(l[c.chave])).join(';')),
  ].join('\n');
}
