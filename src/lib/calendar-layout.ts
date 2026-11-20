// AI dev note: Posicionamento dos blocos nas grades de hora (Semana e Dia).
// Regra: nada fica por cima de nada. Eventos que se cruzam no tempo formam um
// "grupo" e dividem a largura em colunas; cada bloco estica para a direita
// enquanto a coluna vizinha estiver livre naquele horário. Quando o grupo
// precisa de mais colunas do que cabe (maxColunas), as últimas viram um bloco
// "+N" que abre a lista. Antes, a Semana desenhava em cascata (85% de largura,
// um sobre o outro) e o Dia só dividia quem começava no mesmo minuto.

import type { CalendarEvent } from '@/types/calendar';
import { isCompromissoEvent } from '@/lib/agenda-bloqueios-api';

export interface BlocoPosicionado {
  event: CalendarEvent;
  coluna: number; // 0-based
  span: number; // quantas colunas ocupa
  colunas: number; // total de colunas do grupo
  estreito: boolean; // divide espaço com outro bloco
}

export interface BlocoExcedente {
  inicio: Date;
  fim: Date;
  events: CalendarEvent[];
  coluna: number;
  colunas: number;
}

export interface LayoutColunas {
  blocos: BlocoPosicionado[];
  excedentes: BlocoExcedente[];
}

const MIN_DURACAO_MS = 15 * 60 * 1000;

const fimEfetivo = (e: CalendarEvent) =>
  Math.max(e.end.getTime(), e.start.getTime() + MIN_DURACAO_MS);

const sobrepoe = (a: CalendarEvent, b: CalendarEvent) =>
  a.start.getTime() < fimEfetivo(b) && fimEfetivo(a) > b.start.getTime();

// Consulta e reserva ficam à esquerda; compromisso (almoço, exame...) à direita.
const prioridade = (e: CalendarEvent) =>
  isCompromissoEvent(e) && !e.metadata?.reserva ? 1 : 0;

export function layoutColunas(
  events: CalendarEvent[],
  maxColunas = Number.POSITIVE_INFINITY
): LayoutColunas {
  const limite = Math.max(2, maxColunas);
  const ordenados = [...events].sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      prioridade(a) - prioridade(b) ||
      fimEfetivo(b) - b.start.getTime() - (fimEfetivo(a) - a.start.getTime()) ||
      a.id.localeCompare(b.id)
  );

  // Grupos: cadeias de eventos que se cruzam (transitivo)
  const grupos: CalendarEvent[][] = [];
  let atual: CalendarEvent[] = [];
  let fimGrupo = Number.NEGATIVE_INFINITY;
  for (const e of ordenados) {
    if (atual.length > 0 && e.start.getTime() >= fimGrupo) {
      grupos.push(atual);
      atual = [];
      fimGrupo = Number.NEGATIVE_INFINITY;
    }
    atual.push(e);
    fimGrupo = Math.max(fimGrupo, fimEfetivo(e));
  }
  if (atual.length > 0) grupos.push(atual);

  const blocos: BlocoPosicionado[] = [];
  const excedentes: BlocoExcedente[] = [];

  for (const grupo of grupos) {
    // Cada evento na primeira coluna livre
    const fimColuna: number[] = [];
    const colunaDe = new Map<string, number>();
    for (const e of grupo) {
      let c = fimColuna.findIndex((fim) => fim <= e.start.getTime());
      if (c === -1) {
        c = fimColuna.length;
        fimColuna.push(0);
      }
      fimColuna[c] = fimEfetivo(e);
      colunaDe.set(e.id, c);
    }
    const total = fimColuna.length;

    const spanDe = (e: CalendarEvent, ate: number) => {
      const col = colunaDe.get(e.id)!;
      let span = 1;
      for (let k = col + 1; k < ate; k++) {
        const ocupada = grupo.some(
          (o) => colunaDe.get(o.id) === k && sobrepoe(o, e)
        );
        if (ocupada) break;
        span++;
      }
      return span;
    };

    if (total <= limite) {
      for (const e of grupo) {
        blocos.push({
          event: e,
          coluna: colunaDe.get(e.id)!,
          span: spanDe(e, total),
          colunas: total,
          estreito: total > 1 && spanDe(e, total) < total,
        });
      }
      continue;
    }

    // Não cabe: mostra (limite - 1) colunas e o resto vira "+N"
    const visiveis = limite - 1;
    const escondidos: CalendarEvent[] = [];
    for (const e of grupo) {
      const col = colunaDe.get(e.id)!;
      if (col < visiveis) {
        blocos.push({
          event: e,
          coluna: col,
          span: spanDe(e, visiveis),
          colunas: limite,
          estreito: true,
        });
      } else {
        escondidos.push(e);
      }
    }

    // Escondidos que se cruzam viram um único bloco "+N"
    let lote: CalendarEvent[] = [];
    let fimLote = Number.NEGATIVE_INFINITY;
    const fecharLote = () => {
      if (lote.length === 0) return;
      excedentes.push({
        inicio: lote[0].start,
        fim: new Date(fimLote),
        events: lote,
        coluna: visiveis,
        colunas: limite,
      });
      lote = [];
      fimLote = Number.NEGATIVE_INFINITY;
    };
    for (const e of escondidos) {
      if (lote.length > 0 && e.start.getTime() >= fimLote) fecharLote();
      lote.push(e);
      fimLote = Math.max(fimLote, fimEfetivo(e));
    }
    fecharLote();
  }

  return { blocos, excedentes };
}

// Posição vertical em px dentro da grade de horas
export function posicaoVertical(
  inicio: Date,
  fim: Date,
  startHour: number,
  endHour: number,
  hourHeight: number
): { top: number; height: number } | null {
  const minIni = (inicio.getHours() - startHour) * 60 + inicio.getMinutes();
  const minFim = (fim.getHours() - startHour) * 60 + fim.getMinutes();
  const maxMin = (endHour - startHour) * 60;
  if (minIni >= maxMin || minFim <= 0) return null;
  const ini = Math.max(0, minIni);
  const fimC = Math.min(maxMin, Math.max(minFim, ini + 15));
  return {
    top: (ini / 60) * hourHeight,
    height: Math.max(18, ((fimC - ini) / 60) * hourHeight),
  };
}

// "Maria Helena Sales Martins Isac" -> "Maria Helena" (blocos estreitos).
// Os dois primeiros nomes, e não primeiro + último: irmãos têm o mesmo
// sobrenome ("Maria Isac" ficava igual para Maria Helena e Maria Cecília).
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const segundo = partes.slice(1).find((p) => !PARTICULAS.has(p.toLowerCase()));
  return segundo ? `${partes[0]} ${segundo}` : (partes[0] ?? '');
}

// Fechamento da clínica com horário (ex.: evento 10h–14h): vira faixa de fundo
export function ehFechamentoComHorario(e: CalendarEvent): boolean {
  return isCompromissoEvent(e) && !!e.metadata?.clinicaInteira;
}
