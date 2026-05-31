// AI dev note: Tipos da análise conversacional de WhatsApp (Chatwoot).
// Tabela: public.whatsapp_conversas — 1 linha por conversa (chatwoot_conversa_id).
// Escrita pelo n8n (service_role); leitura/atualização pelo dashboard (admin + secretaria).
// Os enums de strings (status, intenção, etc.) são definidos no prompt da IA no n8n.

export type FollowupStatus =
  | 'pendente'
  | 'concluido'
  | 'ignorado'
  | 'nao_aplicavel';

/**
 * Linha da tabela whatsapp_conversas (mapeamento 1:1 com as colunas).
 */
export interface WhatsAppConversaRow {
  id: string;

  // Identidade / origem
  chatwoot_conversa_id: string;
  chatwoot_contato_id: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  pessoa_id: string | null;
  canal_origem: string | null;

  // Detecção de mudança / processamento
  hash_conteudo: string | null;
  total_mensagens: number;
  ultima_mensagem_em: string | null;
  ultima_mensagem_remetente: string | null;
  versao_analise: number;
  processado_em: string | null;

  // Métricas objetivas
  iniciada_em: string | null;
  encerrada_em: string | null;
  duracao_minutos: number | null;
  mensagens_cliente: number;
  mensagens_atendente: number;
  mensagens_automaticas: number;
  notas_internas: number;
  anexos: number;
  imagens: number;
  audios: number;
  videos: number;
  documentos: number;
  links: number;
  valores_monetarios_detectados: number;
  tempo_resposta_inicial_minutos: number | null;
  tempo_medio_resposta_minutos: number | null;
  maior_tempo_resposta_minutos: number | null;
  mensagens_cliente_pendentes: number;
  fora_horario_comercial: boolean | null;

  // Classificação (IA)
  resumo: string | null;
  intencao_principal: string | null;
  intencoes_secundarias: string[] | null;
  tipo_demanda: string | null;
  status_conversa: string | null;
  etapa_conversa: string | null;

  // Contexto clínico
  tem_conteudo_clinico: boolean;
  idade_paciente_mencionada: string | null;
  sintomas_mencionados: string[] | null;
  sinais_alerta_clinicos: string[] | null;
  urgencia_clinica: string | null;
  necessita_triagem_humana: boolean;

  // Contexto operacional / comercial
  lead_quente: boolean;
  cliente_novo: boolean;
  perguntou_valor: boolean;
  perguntou_disponibilidade: boolean;
  solicitacao_mesmo_dia: boolean;
  agendamento_realizado: boolean;
  confirmacao_consulta: boolean;
  remarcacao_solicitada: boolean;
  cancelamento_detectado: boolean;
  no_show_detectado: boolean;
  pagamento_solicitado: boolean;
  pagamento_confirmado: boolean;
  nota_fiscal_enviada: boolean;
  atestado_solicitado_ou_enviado: boolean;
  pesquisa_satisfacao_enviada: boolean;
  avaliacao_google_solicitada: boolean;
  profissional_mencionado: string | null;
  data_consulta_mencionada: string | null;

  // Experiência / qualidade
  sentimento_cliente: string | null;
  nivel_ansiedade_cliente: string | null;
  tom_atendimento: string | null;
  qualidade_atendimento: string | null;
  pontos_de_atrito: string[] | null;
  sugestao_melhoria: string | null;

  // Reclamação / insatisfação
  reclamacao_identificada: boolean;
  nivel_insatisfacao: string | null;
  motivo_insatisfacao: string | null;
  requer_atencao_admin: boolean;
  reclamacao_alertada_em: string | null;

  // Automação
  possui_mensagem_automatica: boolean;
  possivel_excesso_automacao: boolean;
  mensagens_automaticas_repetidas: boolean;

  // LGPD
  dados_sensiveis_detectados: boolean;
  tipos_dados_sensiveis: string[] | null;
  risco_lgpd: string | null;

  // Follow-up / próxima ação
  necessita_followup: boolean;
  acao_recomendada: string | null;
  responsavel_sugerido: string | null;
  prazo_followup: string | null;
  followup_status: FollowupStatus;
  followup_concluido_em: string | null;
  followup_concluido_por: string | null;
  followup_lembrete_enviado_em: string | null;

  // Meta
  confianca_analise: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Filtros aplicáveis no dashboard.
 */
export interface WhatsAppDashboardFilters {
  /** ISO date (YYYY-MM-DD) inclusive. */
  startDate?: string;
  /** ISO date (YYYY-MM-DD) inclusive. */
  endDate?: string;
  status?: string[];
  intencoes?: string[];
  tiposDemanda?: string[];
  sentimentos?: string[];
  canais?: string[];
  /** Busca livre (nome, telefone, resumo). */
  search?: string;
  apenasFollowup?: boolean;
  apenasReclamacoes?: boolean;
  apenasClinico?: boolean;
}

export interface DistribuicaoItem {
  value: string;
  label: string;
  count: number;
  percent: number;
}

/**
 * Estatísticas agregadas (aba Visão Geral).
 */
export interface WhatsAppConversasStats {
  totalConversas: number;
  conversasUltimos7Dias: number;
  conversasUltimos30Dias: number;
  totalMensagens: number;

  // Operacional / comercial
  leadsQuentes: number;
  clientesNovos: number;
  agendamentosRealizados: number;
  remarcacoes: number;
  cancelamentos: number;
  noShows: number;
  pagamentosSolicitados: number;
  pagamentosConfirmados: number;
  notasFiscaisEnviadas: number;
  pesquisasSatisfacao: number;
  avaliacoesGoogle: number;

  // Atendimento (SLA)
  tempoMedioPrimeiraResposta: number | null;
  tempoMedioResposta: number | null;

  // Pendências
  followupsPendentes: number;
  pendentesAtendente: number;

  // Qualidade / risco
  reclamacoes: number;
  reclamacoesAtencaoAdmin: number;
  conteudoClinico: number;
  urgenciaClinicaAlta: number;
  triagemHumana: number;
  excessoAutomacao: number;
  riscoLgpdAlto: number;

  // Distribuições
  distribuicaoStatus: DistribuicaoItem[];
  distribuicaoIntencao: DistribuicaoItem[];
  distribuicaoTipoDemanda: DistribuicaoItem[];
  distribuicaoSentimento: DistribuicaoItem[];
  distribuicaoEtapa: DistribuicaoItem[];
  distribuicaoCanal: DistribuicaoItem[];
  distribuicaoUrgenciaClinica: DistribuicaoItem[];
  distribuicaoResponsavel: DistribuicaoItem[];
  conversasPorDia: Array<{ data: string; total: number }>;
}

/**
 * Insights estratégicos (aba Insights).
 */
export interface WhatsAppConversasInsights {
  // Funil comercial
  funilPerguntouValor: number;
  funilPerguntouDisponibilidade: number;
  funilAgendou: number;
  taxaConversaoLeadAgendamento: number; // %

  // Oportunidades / perdas
  leadsQuentesSemAgendamento: number;
  leadsQuentesSemResposta: number;

  // Atrito e clínico
  topPontosAtrito: DistribuicaoItem[];
  topSintomas: DistribuicaoItem[];
  topMotivosInsatisfacao: DistribuicaoItem[];

  // Resolução
  taxaResolucao: number; // % finalizada
  taxaPendenteAtendente: number; // %

  // Qualidade por canal e demanda
  npsOperacionalPorCanal: DistribuicaoItem[]; // % finalizadas por canal

  // Sugestões da IA (texto)
  sugestoesMelhoria: string[];
}
