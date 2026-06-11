// AI dev note: Card de uma conversa de WhatsApp analisada.
// Reutilizado na aba "Conversas", na fila de follow-up e na lista de reclamações.
// Mostra se o contato é um cliente cadastrado e as divergências da conciliação
// (conversa x sistema). Quando handlers de follow-up são passados, exibe ações.

import React from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
  Check,
  CircleSlash,
  Clock,
  DollarSign,
  Home,
  MessageSquare,
  Phone,
  RotateCcw,
  Scale,
  Sparkles,
  Stethoscope,
  UserCheck,
  UserX,
} from 'lucide-react';
import type {
  ConciliacaoAlerta,
  WhatsAppConversaRow,
} from '@/types/whatsapp-conversas';
import {
  INTENCAO_LABELS,
  LOCAL_ATENDIMENTO_LABELS,
  RESPONSAVEL_LABELS,
  SENTIMENTO_LABELS,
  STATUS_LABELS,
  TIPO_DEMANDA_LABELS,
  TIPO_SERVICO_LABELS,
  computeConciliacao,
  labelFor,
} from '@/lib/whatsapp-conversas-api';

interface WhatsAppConversaCardProps {
  row: WhatsAppConversaRow;
  onConcluir?: (row: WhatsAppConversaRow) => void;
  onIgnorar?: (row: WhatsAppConversaRow) => void;
  onReabrir?: (row: WhatsAppConversaRow) => void;
  busy?: boolean;
  className?: string;
}

const STATUS_TONE: Record<string, string> = {
  finalizada: 'bg-verde-pipa/30 text-roxo-titulo border-verde-pipa/40',
  pendente_atendente:
    'bg-amarelo-pipa/25 text-roxo-titulo border-amarelo-pipa/50',
  aguardando_equipe:
    'bg-amarelo-pipa/25 text-roxo-titulo border-amarelo-pipa/50',
  pendente_cliente:
    'bg-azul-respira/15 text-azul-respira border-azul-respira/40',
  aguardando_data_futura:
    'bg-azul-respira/15 text-azul-respira border-azul-respira/40',
  sem_atendimento: 'bg-muted text-muted-foreground border-border',
};

const SENTIMENTO_TONE: Record<string, string> = {
  positivo: 'text-verde-pipa',
  satisfeito: 'text-verde-pipa',
  neutro: 'text-muted-foreground',
  ansioso: 'text-amarelo-pipa',
  preocupado: 'text-amarelo-pipa',
  frustrado: 'text-vermelho-kids',
  negativo: 'text-vermelho-kids',
};

const SEVERIDADE_TONE: Record<ConciliacaoAlerta['severidade'], string> = {
  alta: 'border-vermelho-kids/40 bg-vermelho-kids/5 text-vermelho-kids',
  media: 'border-amarelo-pipa/50 bg-amarelo-pipa/10 text-roxo-titulo',
  baixa: 'border-border bg-muted/40 text-muted-foreground',
};

interface FlagDef {
  key: keyof WhatsAppConversaRow;
  label: string;
}

const POSITIVE_FLAGS: FlagDef[] = [
  { key: 'lead_quente', label: 'Lead quente' },
  { key: 'cliente_novo', label: 'Cliente novo' },
  { key: 'agendamento_realizado', label: 'Agendou' },
  { key: 'confirmacao_consulta', label: 'Confirmou consulta' },
  { key: 'pagamento_confirmado', label: 'Pagou' },
  { key: 'nota_fiscal_enviada', label: 'NF enviada' },
  { key: 'resolvido_primeiro_contato', label: 'Resolvido no 1º contato' },
];

const ALERT_FLAGS: FlagDef[] = [
  { key: 'cancelamento_detectado', label: 'Cancelou' },
  { key: 'remarcacao_solicitada', label: 'Remarcação' },
  { key: 'pagamento_solicitado', label: 'Cobrança em aberto' },
];

function fmtValor(v: number | null): string | null {
  if (typeof v !== 'number' || v <= 0) return null;
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function fmt(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), "dd/MM 'às' HH:mm", { locale: ptBR });
  } catch {
    return '—';
  }
}

export const WhatsAppConversaCard = React.memo<WhatsAppConversaCardProps>(
  ({ row, onConcluir, onIgnorar, onReabrir, busy, className }) => {
    const showFollowupActions =
      Boolean(onConcluir || onIgnorar || onReabrir) &&
      (row.necessita_followup || row.followup_status !== 'nao_aplicavel');

    const alertasConciliacao = computeConciliacao(row);

    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardContent className="p-4 space-y-3">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground truncate">
                  {row.contato_nome || 'Contato sem nome'}
                </span>
                {row.tem_conteudo_clinico && (
                  <Stethoscope
                    className="w-4 h-4 text-azul-respira shrink-0"
                    aria-label="Conteúdo clínico"
                  />
                )}
              </div>
              {row.contato_telefone && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <Phone className="w-3 h-3" />
                  {row.contato_telefone}
                </span>
              )}
            </div>
            {row.status_conversa && (
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 whitespace-nowrap',
                  STATUS_TONE[row.status_conversa] ||
                    'bg-muted text-muted-foreground'
                )}
              >
                {labelFor(STATUS_LABELS, row.status_conversa)}
              </Badge>
            )}
          </div>

          {/* Cadastro: cliente cadastrado x não cadastrado */}
          <div>
            {row.cliente_cadastrado ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-verde-pipa/40 bg-verde-pipa/15 px-2 py-1 text-xs text-roxo-titulo">
                <UserCheck className="w-3.5 h-3.5" />
                Cliente cadastrado
                {row.pessoa_vinculada_nome && (
                  <span className="font-medium">
                    · {row.pessoa_vinculada_nome}
                  </span>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                <UserX className="w-3.5 h-3.5" />
                Não cadastrado no sistema
              </span>
            )}
          </div>

          {/* Badges de classificação */}
          <div className="flex flex-wrap items-center gap-1.5">
            {row.intencao_principal && (
              <Badge variant="secondary" className="font-normal">
                {labelFor(INTENCAO_LABELS, row.intencao_principal)}
              </Badge>
            )}
            {row.tipo_demanda && (
              <Badge variant="outline" className="font-normal">
                {labelFor(TIPO_DEMANDA_LABELS, row.tipo_demanda)}
              </Badge>
            )}
            {row.tipo_servico_mencionado &&
              row.tipo_servico_mencionado !== 'nao_informado' && (
                <Badge variant="outline" className="font-normal gap-1">
                  <Activity className="w-3 h-3" />
                  {labelFor(TIPO_SERVICO_LABELS, row.tipo_servico_mencionado)}
                </Badge>
              )}
            {row.local_atendimento === 'domiciliar' && (
              <Badge variant="outline" className="font-normal gap-1">
                <Home className="w-3 h-3" />
                {labelFor(LOCAL_ATENDIMENTO_LABELS, row.local_atendimento)}
              </Badge>
            )}
            {row.sentimento_cliente && (
              <span
                className={cn(
                  'text-xs font-medium',
                  SENTIMENTO_TONE[row.sentimento_cliente] ||
                    'text-muted-foreground'
                )}
              >
                {labelFor(SENTIMENTO_LABELS, row.sentimento_cliente)}
              </span>
            )}
            {(row.mensagens_automaticas || 0) > 0 && (
              <Badge
                variant="outline"
                className="font-normal text-muted-foreground"
              >
                {row.mensagens_automaticas} msg autom.
              </Badge>
            )}
            {row.fora_horario_comercial && (
              <Badge variant="outline" className="font-normal gap-1">
                <Clock className="w-3 h-3" />
                Fora do horário
              </Badge>
            )}
          </div>

          {/* Resumo */}
          {row.resumo && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {row.resumo}
            </p>
          )}

          {/* Conciliação: divergências conversa x sistema */}
          {alertasConciliacao.length > 0 && (
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Scale className="w-3.5 h-3.5 text-azul-respira" />
                Conciliação ({alertasConciliacao.length})
              </span>
              {alertasConciliacao.map((a, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-start gap-2 rounded-md border p-2 text-xs',
                    SEVERIDADE_TONE[a.severidade]
                  )}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{a.mensagem}</span>
                </div>
              ))}
            </div>
          )}

          {/* Reclamação */}
          {row.reclamacao_identificada && (
            <div className="flex items-start gap-2 rounded-md border border-vermelho-kids/30 bg-vermelho-kids/5 p-2.5">
              <AlertTriangle className="w-4 h-4 text-vermelho-kids shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-semibold text-vermelho-kids">
                  Insatisfação
                  {row.nivel_insatisfacao ? ` (${row.nivel_insatisfacao})` : ''}
                </span>
                {row.motivo_insatisfacao && (
                  <span className="text-muted-foreground">
                    {' '}
                    — {row.motivo_insatisfacao}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Flags */}
          {(POSITIVE_FLAGS.some((f) => row[f.key]) ||
            ALERT_FLAGS.some((f) => row[f.key])) && (
            <div className="flex flex-wrap gap-1.5">
              {POSITIVE_FLAGS.filter((f) => row[f.key]).map((f) => (
                <span
                  key={String(f.key)}
                  className="inline-flex items-center rounded-full bg-verde-pipa/20 text-roxo-titulo px-2 py-0.5 text-[11px] font-medium"
                >
                  {f.label}
                </span>
              ))}
              {ALERT_FLAGS.filter((f) => row[f.key]).map((f) => (
                <span
                  key={String(f.key)}
                  className="inline-flex items-center rounded-full bg-amarelo-pipa/25 text-roxo-titulo px-2 py-0.5 text-[11px] font-medium"
                >
                  {f.label}
                </span>
              ))}
            </div>
          )}

          {/* Métricas objetivas */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-t pt-2">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              {row.total_mensagens} msgs analisadas ({row.mensagens_cliente}{' '}
              cliente / {row.mensagens_atendente} equipe)
              {row.versao_analise > 1 ? ` · v${row.versao_analise}` : ''}
            </span>
            {typeof row.tempo_resposta_inicial_minutos === 'number' && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                1ª resposta: {row.tempo_resposta_inicial_minutos} min
              </span>
            )}
            {fmtValor(row.valor_mencionado) && (
              <span className="inline-flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" />
                {fmtValor(row.valor_mencionado)}
              </span>
            )}
            <span>Última: {fmt(row.ultima_mensagem_em)}</span>
          </div>

          {/* Próxima ação / follow-up */}
          {row.acao_recomendada && (
            <div className="flex items-start gap-2 rounded-md bg-azul-respira/5 border border-azul-respira/20 p-2.5">
              <Sparkles className="w-4 h-4 text-azul-respira shrink-0 mt-0.5" />
              <div className="text-xs flex-1">
                <span className="font-semibold text-foreground">
                  Próxima ação:
                </span>{' '}
                <span className="text-muted-foreground">
                  {row.acao_recomendada}
                </span>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground/80">
                  {row.responsavel_sugerido && (
                    <span>
                      Responsável:{' '}
                      {labelFor(RESPONSAVEL_LABELS, row.responsavel_sugerido)}
                    </span>
                  )}
                  {row.prazo_followup && (
                    <span>Prazo: {row.prazo_followup}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Ações de follow-up */}
          {showFollowupActions && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {row.followup_status === 'concluido' ? (
                <>
                  <Badge className="bg-verde-pipa/30 text-roxo-titulo hover:bg-verde-pipa/30">
                    <Check className="w-3 h-3 mr-1" />
                    Follow-up concluído
                  </Badge>
                  {onReabrir && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onReabrir(row)}
                      className="h-8 gap-1 text-muted-foreground"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reabrir
                    </Button>
                  )}
                </>
              ) : row.followup_status === 'ignorado' ? (
                <>
                  <Badge variant="secondary">
                    <CircleSlash className="w-3 h-3 mr-1" />
                    Ignorado
                  </Badge>
                  {onReabrir && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onReabrir(row)}
                      className="h-8 gap-1 text-muted-foreground"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reabrir
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {onConcluir && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => onConcluir(row)}
                      className="h-8 gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Concluir follow-up
                    </Button>
                  )}
                  {onIgnorar && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => onIgnorar(row)}
                      className="h-8 gap-1"
                    >
                      <CircleSlash className="w-3.5 h-3.5" />
                      Ignorar
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

WhatsAppConversaCard.displayName = 'WhatsAppConversaCard';
