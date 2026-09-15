// AI dev note: Uma venda da loja na aba Vendas de Produtos — quem comprou, quando,
// o que levou e como pagou, com o link da cobrança (ou da fatura, em venda antiga
// do Asaas). Só leitura: vender, reenviar e cancelar ficam no detalhe do paciente.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import { formatBRL, linkPagamentoProduto } from '@/lib/produtos-api';
import {
  CATEGORIA_LABELS,
  STATUS_VENDA_BADGE_CLASSES,
  STATUS_VENDA_LABELS,
  type VendaHistorico,
  type VendaHistoricoItem,
} from '@/types/produtos';

const DATA_CLINICA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const HORA_CLINICA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDataHora(valor: string | Date): string {
  const d = new Date(valor);
  return `${DATA_CLINICA.format(d)} às ${HORA_CLINICA.format(d)}`;
}

// billingType do Asaas — só existe em venda antiga, anterior ao Pix do Inter
const FORMA_ASAAS: Record<string, string> = {
  PIX: 'Pix',
  CREDIT_CARD: 'cartão de crédito',
  DEBIT_CARD: 'cartão de débito',
  BOLETO: 'boleto',
};

const juntar = (partes: (string | false | null | undefined)[]) =>
  partes.filter(Boolean).join(' · ') || null;

interface ResumoPagamento {
  icone: LucideIcon;
  cor: string;
  titulo: string;
  detalhe: string | null;
}

function descreverPagamento(v: VendaHistorico, agora: number): ResumoPagamento {
  const pagoEm = v.pago_em ? formatDataHora(v.pago_em) : null;
  const formaAsaas = v.fatura?.forma ? FORMA_ASAAS[v.fatura.forma] : undefined;
  const ondePagou =
    v.canal === 'pix_inter'
      ? 'no Pix (Banco Inter)'
      : v.canal === 'asaas'
        ? `pelo Asaas${formaAsaas ? ` (${formaAsaas})` : ''}`
        : null;

  switch (v.status) {
    case 'pago': {
      const recebeuOutroValor =
        v.pago_valor !== null && Math.abs(v.pago_valor - v.valor_total) >= 0.01;
      return {
        icone: CheckCircle2,
        cor: 'text-verde-pipa',
        titulo: ondePagou ? `Pago ${ondePagou}` : 'Marcado como pago',
        detalhe: juntar([
          pagoEm && `em ${pagoEm}`,
          recebeuOutroValor && `valor recebido ${formatBRL(v.pago_valor)}`,
        ]),
      };
    }
    case 'aguardando_pagamento': {
      const expira = v.pix_expira_em ? new Date(v.pix_expira_em) : null;
      return {
        icone: Clock,
        cor: 'text-amarelo-pipa',
        titulo:
          v.canal === 'asaas'
            ? 'Fatura do Asaas em aberto'
            : 'Pix gerado, aguardando pagamento',
        detalhe: expira
          ? expira.getTime() < agora
            ? `o Pix expirou em ${DATA_CLINICA.format(expira)}`
            : `o Pix vale até ${formatDataHora(expira)}`
          : null,
      };
    }
    case 'cancelado':
      return {
        icone: Ban,
        cor: 'text-muted-foreground',
        titulo: v.cancelado_em
          ? `Cancelada em ${formatDataHora(v.cancelado_em)}`
          : 'Cancelada',
        detalhe: juntar([
          v.motivo_cancelamento,
          v.foi_paga &&
            `tinha sido paga${ondePagou ? ` ${ondePagou}` : ''}${pagoEm ? ` em ${pagoEm}` : ''}`,
          v.estorno_valor !== null
            ? `Pix devolvido: ${formatBRL(v.estorno_valor)}`
            : v.foi_paga && 'o dinheiro não foi devolvido pelo sistema',
        ]),
      };
    default:
      return {
        icone: Clock,
        cor: 'text-muted-foreground',
        titulo: 'Cobrança ainda não foi gerada',
        detalhe: 'Dá para gerar pelo detalhe do paciente.',
      };
  }
}

export interface VendaHistoricoCardProps {
  venda: VendaHistorico;
  // referência de "agora" para dizer se o Pix já expirou (a página renova a cada carga)
  agora: number;
  // com filtro de categoria/produto, os itens que casam ficam em destaque
  destacarItem?: (item: VendaHistoricoItem) => boolean;
}

export const VendaHistoricoCard = React.memo<VendaHistoricoCardProps>(
  ({ venda: v, agora, destacarItem }) => {
    const navigate = useNavigate();
    const { toast } = useToast();

    const paciente = v.paciente;
    const responsavel = v.responsavel;
    const e2eid = v.pago_e2eid;
    const pagamento = descreverPagamento(v, agora);
    const IconePagamento = pagamento.icone;

    // Pix do Inter: a mesma página que o cliente recebeu no WhatsApp (depois de
    // paga, ela mostra a confirmação). Venda cancelada não tem mais o que abrir.
    const link =
      v.canal === 'asaas'
        ? (v.fatura?.invoice_url ?? null)
        : v.canal === 'pix_inter' &&
            v.cobranca_token &&
            v.status !== 'cancelado'
          ? linkPagamentoProduto(v.cobranca_token)
          : null;

    const copiarIdPix = async (id: string) => {
      try {
        await navigator.clipboard.writeText(id);
        toast({
          title: 'ID do Pix copiado',
          description:
            'Com ele dá para achar o pagamento no extrato do Banco Inter.',
        });
      } catch {
        toast({
          title: 'Não deu para copiar',
          description: id,
          variant: 'destructive',
        });
      }
    };

    return (
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {paciente ? (
              <button
                type="button"
                onClick={() => navigate(`/pacientes/${paciente.id}`)}
                className="text-left font-semibold text-foreground transition-colors hover:text-rosa-suave hover:underline"
                title="Abrir o paciente"
              >
                {paciente.nome}
              </button>
            ) : (
              <span className="font-semibold text-foreground">
                Paciente não informado
              </span>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatDataHora(v.created_at)}
              {v.vendedor_nome
                ? ` · vendido por ${v.vendedor_nome.split(' ')[0]}`
                : ''}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 text-xs',
              STATUS_VENDA_BADGE_CLASSES[v.status]
            )}
          >
            {STATUS_VENDA_LABELS[v.status]}
          </Badge>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <User className="h-3.5 w-3.5 shrink-0" />
          <span className="shrink-0">Responsável:</span>
          {responsavel ? (
            <button
              type="button"
              onClick={() => navigate(`/pessoa/${responsavel.id}`)}
              className="min-w-0 truncate text-left text-foreground transition-colors hover:text-rosa-suave hover:underline"
              title="Abrir o responsável"
            >
              {responsavel.nome}
            </button>
          ) : (
            <span>—</span>
          )}
        </div>

        <ul className="divide-y divide-border/50 rounded-lg bg-muted/30 px-3">
          {v.itens.map((item, idx) => {
            const destacado = destacarItem ? destacarItem(item) : false;
            return (
              <li
                key={`${item.produto_id ?? item.nome}-${idx}`}
                className={cn(
                  'flex items-center gap-3 py-2 text-sm',
                  destacarItem && !destacado && 'opacity-50'
                )}
              >
                <span className="w-7 shrink-0 tabular-nums text-muted-foreground">
                  {item.quantidade}×
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-foreground',
                      destacado && 'font-semibold'
                    )}
                  >
                    {item.nome}
                  </p>
                  {(item.categoria || item.eh_kit) && (
                    <p className="text-xs text-muted-foreground">
                      {juntar([
                        item.categoria && CATEGORIA_LABELS[item.categoria],
                        item.eh_kit && 'kit',
                      ])}
                    </p>
                  )}
                </div>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatBRL(item.subtotal)}
                </span>
              </li>
            );
          })}
          {v.itens.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">Sem itens</li>
          )}
          {v.desconto > 0 && (
            <li className="flex items-center justify-between py-2 text-sm">
              <span className="text-muted-foreground">Desconto</span>
              <span className="tabular-nums text-verde-pipa">
                −{formatBRL(v.desconto)}
              </span>
            </li>
          )}
        </ul>

        {v.observacoes && (
          <p className="text-xs text-muted-foreground">Obs.: {v.observacoes}</p>
        )}

        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-t border-border/60 pt-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <IconePagamento
              className={cn('mt-0.5 h-4 w-4 shrink-0', pagamento.cor)}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {pagamento.titulo}
              </p>
              {pagamento.detalhe && (
                <p className="text-xs text-muted-foreground">
                  {pagamento.detalhe}
                </p>
              )}
            </div>
          </div>
          <span className="text-base font-bold tabular-nums text-foreground">
            {formatBRL(v.valor_total)}
          </span>
        </div>

        {(link || e2eid) && (
          <div className="flex flex-wrap gap-2">
            {link && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  {v.canal === 'asaas' ? 'Ver fatura' : 'Ver link de pagamento'}
                </a>
              </Button>
            )}
            {e2eid && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => void copiarIdPix(e2eid)}
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar ID do Pix
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }
);

VendaHistoricoCard.displayName = 'VendaHistoricoCard';
