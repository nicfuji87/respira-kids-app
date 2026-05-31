// AI dev note: Tipos da análise conversacional de WhatsApp (Chatwoot).
// Tabela: public.whatsapp_conversas — 1 linha por conversa (chatwoot_conversa_id).
// Escrita pelo n8n (service_role); leitura/atualização pelo dashboard (admin + secretaria).
// AI dev note: Os enums abaixo são a fonte única de verdade do dashboard e DEVEM
// espelhar exatamente os CHECK constraints da tabela e os valores do prompt da IA (n8n).
// Não adicione valores aqui sem atualizar o CHECK correspondente (migração) e o prompt.

export type FollowupStatus =
  | 'pendente'
  | 'concluido'
  | 'ignorado'
  | 'nao_aplicavel';

export type IntencaoConversa =
  | 'agendamento'
  | 'confirmacao'
  | 'remarcacao'
  | 'cancelamento'
  | 'duvida_valor'
  | 'duvida_clinica'
  | 'financeiro'
  | 'documento'
  | 'nota_fiscal'
  | 'avaliacao'
  | 'pos_consulta'
  | 'sem_atendimento'
  | 'outros';

export type TipoDemanda =
  | 'clinica'
  | 'administrativa'
  | 'financeira'
  | 'comercial'
  | 'relacionamento'
  | 'mista'
  | 'outros';

export type StatusConversa =
  | 'finalizada'
  | 'pendente_atendente'
  | 'pendente_cliente'
  | 'aguardando_equipe'
  | 'aguardando_data_futura'
  | 'sem_atendimento';

export type EtapaConversa =
  | 'novo_lead'
  | 'paciente_ativo'
  | 'pos_consulta'
  | 'cobranca'
  | 'recorrente'
  | 'suporte'
  | 'outros';

export type UrgenciaClinica = 'baixa' | 'media' | 'alta' | 'nao_aplicavel';

export type SentimentoCliente =
  | 'positivo'
  | 'satisfeito'
  | 'neutro'
  | 'ansioso'
  | 'preocupado'
  | 'frustrado'
  | 'negativo';

export type QualidadeAtendimento = 'otimo' | 'bom' | 'regular' | 'ruim';

export type NivelEnum = 'nenhum' | 'baixo' | 'medio' | 'alto';

export type ResponsavelSugerido =
  | 'recepcao'
  | 'fisioterapeuta'
  | 'financeiro'
  | 'gestao'
  | 'medico_ou_triagem'
  | 'nao_aplicavel';

export type PrazoFollowup =
  | 'hoje'
  | '24h'
  | '48h'
  | 'esta_semana'
  | 'antes_da_consulta'
  | 'sem_prazo';

export type TipoServico =
  | 'respiratoria'
  | 'motora'
  | 'avaliacao'
  | 'multiplos'
  | 'nao_informado';

export type LocalAtendimento = 'clinica' | 'domiciliar' | 'nao_informado';

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
  intencao_principal: IntencaoConversa | null;
  intencoes_secundarias: IntencaoConversa[] | null;
  tipo_demanda: TipoDemanda | null;
  status_conversa: StatusConversa | null;
  etapa_conversa: EtapaConversa | null;

  // Contexto clínico
  tem_conteudo_clinico: boolean;
  idade_paciente_mencionada: string | null;
  sintomas_mencionados: string[] | null;
  sinais_alerta_clinicos: string[] | null;
  urgencia_clinica: UrgenciaClinica | null;
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
  pagamento_solicitado: boolean;
  pagamento_confirmado: boolean;
  nota_fiscal_enviada: boolean;
  pesquisa_satisfacao_enviada: boolean;
  profissional_mencionado: string[] | null;
  data_consulta_mencionada: string[] | null;

  // Serviço / atendimento (novos)
  tipo_servico_mencionado: TipoServico | null;
  local_atendimento: LocalAtendimento | null;
  valor_mencionado: number | null;
  indicacao_pediatra_mencionada: boolean;
  solicitou_encaixe: boolean;
  resolvido_primeiro_contato: boolean;

  // Experiência / qualidade
  sentimento_cliente: SentimentoCliente | null;
  qualidade_atendimento: QualidadeAtendimento | null;
  pontos_de_atrito: string[] | null;
  sugestao_melhoria: string | null;

  // Reclamação / insatisfação
  reclamacao_identificada: boolean;
  nivel_insatisfacao: NivelEnum | null;
  motivo_insatisfacao: string | null;
  requer_atencao_admin: boolean;
  reclamacao_alertada_em: string | null;

  // LGPD
  dados_sensiveis_detectados: boolean;
  tipos_dados_sensiveis: string[] | null;
  risco_lgpd: NivelEnum | null;

  // Follow-up / próxima ação
  necessita_followup: boolean;
  acao_recomendada: string | null;
  responsavel_sugerido: ResponsavelSugerido | null;
  prazo_followup: PrazoFollowup | null;
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
  tiposServico?: string[];
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
  pagamentosSolicitados: number;
  pagamentosConfirmados: number;
  notasFiscaisEnviadas: number;
  pesquisasSatisfacao: number;
  foraHorarioComercial: number;

  // Serviço / atendimento (novos)
  atendimentosDomiciliares: number;
  indicacoesPediatra: number;
  resolvidosPrimeiroContato: number;
  encaixesSolicitados: number;
  valorMencionadoTotal: number;

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
  conversasComAutomacao: number;
  riscoLgpdAlto: number;

  // Distribuições
  distribuicaoStatus: DistribuicaoItem[];
  distribuicaoIntencao: DistribuicaoItem[];
  distribuicaoTipoDemanda: DistribuicaoItem[];
  distribuicaoSentimento: DistribuicaoItem[];
  distribuicaoEtapa: DistribuicaoItem[];
  distribuicaoTipoServico: DistribuicaoItem[];
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
  topProfissionais: DistribuicaoItem[];

  // Resolução
  taxaResolucao: number; // % finalizada
  taxaPendenteAtendente: number; // %

  // Resolução por tipo de serviço (% finalizadas)
  resolucaoPorTipoServico: DistribuicaoItem[];

  // Sugestões da IA (texto)
  sugestoesMelhoria: string[];
}
