import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  User,
  Pencil,
  Trash2,
  Copy,
  FileClock,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/primitives/alert-dialog';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchPreFaturas,
  excluirPreFatura,
  type PreFaturaResumo,
} from '@/lib/payment-links-api';
import { PreFaturaEditDialog } from './PreFaturaEditDialog';

// AI dev note: Lista das PRÉ-FATURAS (pagamento_links pendentes, ainda NÃO gerados
// no Asaas). Fica no topo da aba "Faturas", visualmente distinta (âmbar/tracejado)
// para não confundir com as faturas reais do Asaas. Permite editar os itens,
// excluir e copiar o link — resolve o caso de correção antes do cliente pagar.

interface FinancialPreFaturasListProps {
  className?: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'Não definido';
  const [datePart] = dateString.split('T');
  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
};

const formatDataConsulta = (dateString: string) =>
  new Date(dateString).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  });

export const FinancialPreFaturasList: React.FC<
  FinancialPreFaturasListProps
> = ({ className }) => {
  const { toast } = useToast();
  const { user } = useAuth();

  const [preFaturas, setPreFaturas] = useState<PreFaturaResumo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<PreFaturaResumo | null>(null);
  const [toDelete, setToDelete] = useState<PreFaturaResumo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const carregar = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchPreFaturas();
      if (result.success && result.data) {
        setPreFaturas(result.data);
      } else {
        setError(result.error || 'Erro ao carregar pré-faturas');
      }
    } catch (e) {
      console.error('Erro ao carregar pré-faturas:', e);
      setError('Erro inesperado ao carregar pré-faturas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleCopyLink = async (preFatura: PreFaturaResumo) => {
    try {
      await navigator.clipboard.writeText(preFatura.url);
      toast({
        title: 'Link copiado',
        description:
          'O link de pagamento foi copiado para a área de transferência.',
      });
    } catch {
      toast({
        title: 'Não foi possível copiar',
        description: preFatura.url,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      const result = await excluirPreFatura(
        toDelete.id,
        user?.pessoa?.id || 'system'
      );
      if (result.success) {
        toast({
          title: 'Pré-fatura excluída',
          description:
            'As consultas foram liberadas e voltaram para "pendente".',
        });
        setToDelete(null);
        carregar();
      } else {
        toast({
          title: 'Erro ao excluir',
          description: result.error || 'Erro desconhecido',
          variant: 'destructive',
        });
      }
    } catch (e) {
      console.error('Erro ao excluir pré-fatura:', e);
      toast({
        title: 'Erro ao excluir',
        description: 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Não renderiza a seção quando não há pré-faturas (mantém a aba limpa)
  if (!isLoading && !error && preFaturas.length === 0) {
    return null;
  }

  return (
    <>
      <Card
        className={cn(
          'border-amber-300 border-dashed bg-amber-50/40',
          className
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-amber-900">
              <FileClock className="h-5 w-5" />
              Pré-faturas — não geradas no Asaas
            </span>
            <Badge
              variant="outline"
              className="border-amber-400 text-amber-700"
            >
              {preFaturas.length}
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Cobranças aguardando o cliente escolher a forma de pagamento (ou já
            expiradas). Ainda não existe cobrança no Asaas — dá para editar os
            itens, reativar as expiradas ou excluir livremente.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            preFaturas.map((pf) => (
              <div
                key={pf.id}
                className={cn(
                  'rounded-lg border bg-card p-4',
                  pf.expirado ? 'border-red-200' : 'border-amber-200'
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {pf.expirado ? (
                        <Badge className="bg-red-100 text-red-800 border-red-300 hover:bg-red-100">
                          Pré-fatura · expirada
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
                          Pré-fatura · aguardando cliente
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        #{pf.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span className="truncate">{pf.responsavel_nome}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Paciente: {pf.paciente_nome} · {pf.empresa_nome}
                    </div>
                  </div>
                  <div className="text-right ml-3">
                    <div className="text-lg font-bold text-primary">
                      {formatCurrency(pf.valor_base)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {pf.qtd_consultas} consulta
                      {pf.qtd_consultas !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                {/* Consultas + vencimento */}
                <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                  <div>
                    <div className="text-muted-foreground mb-1">Consultas</div>
                    <div className="flex flex-wrap gap-1">
                      {pf.agendamentos.map((a) => (
                        <Badge
                          key={a.id}
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          {formatDataConsulta(a.data_hora)} ·{' '}
                          {formatCurrency(a.valor_servico)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Vencimento</div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      {formatDate(pf.vencimento)}
                    </div>
                  </div>
                </div>

                {/* Aviso de expiração */}
                {pf.expirado && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2 mb-3">
                    Link expirado — o cliente não consegue mais pagar por ele.
                    Use <strong>Editar itens</strong> e salve para reativar
                    (estende o prazo em 30 dias) e reenviar.
                  </div>
                )}

                {/* Ações */}
                <div className="flex items-center gap-2 pt-3 border-t flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(pf)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    {pf.expirado ? 'Editar / reativar' : 'Editar itens'}
                  </Button>
                  {!pf.expirado && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyLink(pf)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar link
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setToDelete(pf)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Diálogo de edição de itens */}
      <PreFaturaEditDialog
        preFatura={editing}
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        userId={user?.pessoa?.id || 'system'}
        onSaved={carregar}
      />

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pré-fatura?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Esta pré-fatura ainda <strong>não foi gerada no Asaas</strong>
                  , então nada é cancelado lá. As {toDelete?.qtd_consultas || 0}{' '}
                  consulta
                  {toDelete?.qtd_consultas !== 1 ? 's' : ''} voltam para
                  "pendente" e ficam livres para uma nova cobrança.
                </p>
                {toDelete && (
                  <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                    {toDelete.responsavel_nome} ·{' '}
                    {formatCurrency(toDelete.valor_base)}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir pré-fatura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
