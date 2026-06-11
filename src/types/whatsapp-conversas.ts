// AI dev note: Tipos da análise conversacional de WhatsApp (Chatwoot).
// Tabela base: public.whatsapp_conversas — 1 linha por conversa (chatwoot_conversa_id).
// Leitura no dashboard: VIEW public.vw_whatsapp_conversas_enriquecidas (telefone -> pessoa +
// agendamentos/faturas do sistema, para a conciliação). Escrita (follow-up) na tabela base.
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

export type SentimentoCliente =
  | 'positivo'
  | 'satisfeito'
  | 'neutro'
  | 'ansioso'
  | 'preocupado'
  | 'frustrado'
  | 'negativo';

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
  tipo_demanda: TipoDemanda | null;
  status_conversa: StatusConversa | null;

  // Contexto clínico (flag leve)
  tem_conteudo_clinico: boolean;

  // Contexto operacional / comercial
  lead_quente: boolean;
  cliente_novo: boolean;
  perguntou_valor: boolean;
  perguntou_disponibilidade: boolean;
  agendamento_realizado: boolean;
  confirmacao_consulta: boolean;
  remarcacao_solicitada: boolean;
  cancelamento_detectado: boolean;
  pagamento_solicitado: boolean;
  pagamento_confirmado: boolean;
  nota_fiscal_enviada: boolean;
  profissional_mencionado: string[] | null;
  /** Datas mencionadas na conversa em ISO (YYYY-MM-DD) — base da conciliação. */
  data_consulta_mencionada: string[] | null;

  // Serviço / atendimento
  tipo_servico_mencionado: TipoServico | null;
  local_atendimento: LocalAtendimento | null;
  valor_mencionado: number | null;
  resolvido_primeiro_contato: boolean;

  // Experiência / qualidade
  sentimento_cliente: SentimentoCliente | null;
  pontos_de_atrito: string[] | null;
  sugestao_melhoria: string | null;

  // Reclamação / insatisfação
  reclamacao_identificada: boolean;
  nivel_insatisfacao: NivelEnum | null;
  motivo_insatisfacao: string | null;
  requer_atencao_admin: boolean;
  reclamacao_alertada_em: string | null;

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
  created_at: string;
  updated_at: string;

  // ===== Enriquecimento (view vw_whatsapp_conversas_enriquecidas) =====
  pessoa_vinculada_id: string | null;
  pessoa_vinculada_nome: string | null;
  cliente_cadastrado: boolean;
  pacientes_vinculados: PacienteVinculado[];
  agendamentos_sistema: AgendamentoSistema[];
  faturas_sistema: FaturaSistema[];
}

export interface PacienteVinculado {
  id: string;
  nome: string | null;
}

export interface AgendamentoSistema {
  id: string;
  data_hora: string;
  paciente_nome: string | null;
  status_consulta: string | null;
  status_pagamento: string | null;
  valor: number | null;
  tem_nfe: boolean;
  fatura_id: string | null;
}

export interface FaturaSistema {
  id: string;
  status: string | null;
  status_nfe: string | null;
  tem_nfe: boolean;
  vencimento: string | null;
  valor: number | null;
}

// ===== Conciliação (estilo conciliação bancária) =====

export type ConciliacaoTrilha = 'agendamento' | 'nota_fiscal' | 'cobranca';
/** conversa: a conversa afirma algo que o sistema não confirma. sistema: o
 * sistema tem algo que a conversa não menciona. */
export type ConciliacaoDirecao =
  | 'conversa_sem_sistema'
  | 'sistema_sem_conversa';
export type ConciliacaoSeveridade = 'alta' | 'media' | 'baixa';

export interface ConciliacaoAlerta {
  trilha: ConciliacaoTrilha;
  direcao: ConciliacaoDirecao;
  severidade: ConciliacaoSeveridade;
  mensagem: string;
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
  /** 'cadastrados' | 'nao_cadastrados' (undefined = todos). */
  cadastro?: 'cadastrados' | 'nao_cadastrados';
  /** Apenas conversas com divergência na conciliação. */
  apenasDivergencias?: boolean;
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

  // Cadastro
  clientesCadastrados: number;
  clientesNaoCadastrados: number;

  // Operacional / comercial
  leadsQuentes: number;
  clientesNovos: number;
  agendamentosRealizados: number;
  remarcacoes: number;
  cancelamentos: number;
  pagamentosSolicitados: number;
  pagamentosConfirmados: number;
  notasFiscaisEnviadas: number;
  foraHorarioComercial: number;

  // Serviço / atendimento
  atendimentosDomiciliares: number;
  resolvidosPrimeiroContato: number;
  valorMencionadoTotal: number;

  // Conciliação
  conversasComDivergencia: number;
  divergenciasAgendamento: number;
  divergenciasNotaFiscal: number;
  divergenciasCobranca: number;

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
  conversasComAutomacao: number;

  // Distribuições
  distribuicaoStatus: DistribuicaoItem[];
  distribuicaoIntencao: DistribuicaoItem[];
  distribuicaoTipoDemanda: DistribuicaoItem[];
  distribuicaoSentimento: DistribuicaoItem[];
  distribuicaoTipoServico: DistribuicaoItem[];
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
