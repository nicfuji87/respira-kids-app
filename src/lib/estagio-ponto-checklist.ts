// AI dev note: Conteúdo (editável) do fluxo de ponto do estagiário.
// - CHECKLIST_SAIDA: itens que a estagiária confirma ao bater a SAÍDA (o que fez
//   no turno). As respostas vão para estagio_pontos.checklist (jsonb).
// - LEMBRETE_ENTRADA: lembrete curto das atividades, mostrado ao bater a ENTRADA
//   (não é gravado, só orienta).
// Para mudar os itens/lembretes, edite só este arquivo.

export interface ChecklistItem {
  id: string;
  label: string;
}

export const CHECKLIST_SAIDA: ChecklistItem[] = [
  {
    id: 'agenda',
    label: 'Agenda conferida conforme os pacientes que realmente compareceram',
  },
  {
    id: 'instrumentos',
    label: 'Instrumentos (Proetz, aspirador, etc.) limpos e organizados',
  },
  {
    id: 'evolucoes',
    label: 'Evoluções clínicas do seu turno todas feitas',
  },
  {
    id: 'materiais',
    label:
      'Materiais e insumos repostos (sondas de aspiração, gazes, luvas, soro)',
  },
  {
    id: 'higienizacao',
    label:
      'Macas e superfícies higienizadas e sala organizada para o próximo turno',
  },
  {
    id: 'descarte',
    label:
      'Descarte de resíduos (perfurocortante / infectante) feito corretamente',
  },
];

export const LEMBRETE_ENTRADA: string[] = [
  'Confira a agenda do turno e prepare as salas',
  'Higienize e cheque os equipamentos antes dos atendimentos',
  'Acompanhe os atendimentos sempre sob supervisão',
  'Registre as evoluções ao longo do turno (não deixe acumular)',
];

/** Resposta do checklist gravada na batida de saída. */
export interface ChecklistData {
  items: Record<string, boolean>;
  observacao?: string;
}

/** Quantos itens foram marcados como concluídos. */
export function checklistResumo(data: ChecklistData | null | undefined): {
  feitos: number;
  total: number;
  pendentes: ChecklistItem[];
} {
  const total = CHECKLIST_SAIDA.length;
  if (!data?.items)
    return { feitos: 0, total, pendentes: [...CHECKLIST_SAIDA] };
  const pendentes = CHECKLIST_SAIDA.filter((i) => !data.items[i.id]);
  return { feitos: total - pendentes.length, total, pendentes };
}
