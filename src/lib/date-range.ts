// AI dev note: filtro de período reutilizável entre as telas financeiras
// (lista de faturas e painel de pré-cobranças). Centraliza os rótulos e o cálculo
// do intervalo de datas para não duplicar a mesma regra em cada componente.

export type PeriodFilter =
  | 'mes_atual'
  | 'mes_anterior'
  | 'ultimos_30'
  | 'ultimos_60'
  | 'ultimos_90'
  | 'ultimo_ano'
  | 'personalizado'
  | 'todos';

export const PERIOD_LABELS: Record<PeriodFilter, string> = {
  mes_atual: 'Mês atual',
  mes_anterior: 'Mês anterior',
  ultimos_30: 'Últimos 30 dias',
  ultimos_60: 'Últimos 60 dias',
  ultimos_90: 'Últimos 90 dias',
  ultimo_ano: 'Último ano',
  personalizado: 'Período personalizado',
  todos: 'Todos os períodos',
};

// Retorna as datas (YYYY-MM-DD) de início/fim do período. Strings vazias = sem
// limite naquele lado (usado quando periodFilter === 'todos').
export function computeDateRange(
  periodFilter: PeriodFilter,
  startDate: string,
  endDate: string
): { dateStart: string; dateEnd: string } {
  const today = new Date();
  let dateStart = '';
  let dateEnd = '';
  switch (periodFilter) {
    case 'mes_atual':
      dateStart = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      dateEnd = today.toISOString().split('T')[0];
      break;
    case 'mes_anterior': {
      const firstDayLastMonth = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        1
      );
      const lastDayLastMonth = new Date(
        today.getFullYear(),
        today.getMonth(),
        0
      );
      dateStart = firstDayLastMonth.toISOString().split('T')[0];
      dateEnd = lastDayLastMonth.toISOString().split('T')[0];
      break;
    }
    case 'ultimos_30':
      dateStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      dateEnd = today.toISOString().split('T')[0];
      break;
    case 'ultimos_60':
      dateStart = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      dateEnd = today.toISOString().split('T')[0];
      break;
    case 'ultimos_90':
      dateStart = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      dateEnd = today.toISOString().split('T')[0];
      break;
    case 'ultimo_ano':
      dateStart = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      dateEnd = today.toISOString().split('T')[0];
      break;
    case 'personalizado':
      if (startDate) dateStart = startDate;
      if (endDate) dateEnd = endDate;
      break;
    case 'todos':
      break;
  }
  return { dateStart, dateEnd };
}
