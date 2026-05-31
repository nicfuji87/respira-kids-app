// AI dev note: Card de uma conversa de WhatsApp analisada.
// Reutilizado na aba "Conversas", na fila de follow-up e na lista de reclamações.
// Quando handlers de follow-up são passados, exibe ações (Concluir / Ignorar / Reabrir).

import React from 'react';
import { Card, CardContent } from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  Baby,
  Check,
  CircleSlash,
  Clock,
  MessageSquare,
  Phone,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import type { WhatsAppConversaRow } from '@/types/whatsapp-conversas';
import {
  INTENCAO_LABELS,
  RESPONSAVEL_LABELS,
  SENTIMENTO_LABELS,
  STATUS_LABELS,
  TIPO_DEMANDA_LABELS,
  URGENCIA_LABELS,
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
  { key: 'avaliacao_google_solicitada', label: 'Avaliação Google' },
  { key: 'pesquisa_satisfacao_enviada', label: 'Pesquisa enviada' },
];

const ALERT_FLAGS: FlagDef[] = [
  { key: 'no_show_detectado', label: 'No-show' },
  { key: 'cancelamento_detectado', label: 'Cancelou' },
  { key: 'remarcacao_solicitada', label: 'Remarcação' },
  { key: 'pagamento_solicitado', label: 'Cobrança em aberto' },
  { key: 'possivel_excesso_automacao', label: 'Excesso de automação' },
];

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
                {row.idade_paciente_mencionada && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Baby className="w-3.5 h-3.5" />
                    {row.idade_paciente_mencionada}
                  </span>
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
            {row.tem_conteudo_clinico &&
              row.urgencia_clinica &&
              row.urgencia_clinica !== 'nao_aplicavel' && (
                <Badge
                  variant="outline"
                  className={cn(
                    'font-normal gap-1',
                    row.urgencia_clinica === 'alta'
                      ? 'border-vermelho-kids/50 text-vermelho-kids'
                      : 'border-amarelo-pipa/50 text-roxo-titulo'
                  )}
                >
                  <Stethoscope className="w-3 h-3" />
                  Urgência {labelFor(URGENCIA_LABELS, row.urgencia_clinica)}
                </Badge>
              )}
            {row.risco_lgpd === 'alto' && (
              <Badge
                variant="outline"
                className="font-normal gap-1 border-vermelho-kids/50 text-vermelho-kids"
              >
                <ShieldAlert className="w-3 h-3" />
                LGPD alto
              </Badge>
            )}
          </div>

          {/* Resumo */}
          {row.resumo && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {row.resumo}
            </p>
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
              {row.total_mensagens} msgs ({row.mensagens_cliente} cliente /{' '}
              {row.mensagens_atendente} equipe)
            </span>
            {typeof row.tempo_resposta_inicial_minutos === 'number' && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                1ª resposta: {row.tempo_resposta_inicial_minutos} min
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
