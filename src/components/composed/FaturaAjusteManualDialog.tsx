import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Wrench, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import { Checkbox } from '@/components/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { useToast } from '@/components/primitives/use-toast';
import {
  ajustarFaturaManual,
  ressincronizarFaturaAsaas,
  type AjusteManualFaturaInput,
} from '@/lib/faturas-api';
import type { FaturaComDetalhes } from '@/types/faturas';

// AI dev note: Diálogo de "Ajuste manual" de fatura. Resolve o cenário em que o
// webhook ASAAS -> n8n -> Supabase falhou e os parâmetros locais ficaram
// dessincronizados. Fluxo "os dois": ao abrir, tenta RE-SINCRONIZAR automaticamente
// com o ASAAS (fonte da verdade); se falhar (ou se ainda precisar corrigir algo), o
// formulário de edição manual fica disponível como fallback. NENHUMA ação aqui
// cria/edita cobrança no ASAAS — apenas lê (re-sync) ou grava local (manual).

type StatusFatura = NonNullable<AjusteManualFaturaInput['status']>;

const STATUS_OPTIONS: { value: StatusFatura; label: string }[] = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'atrasado', label: 'Atrasado' },
  { value: 'pago', label: 'Pago' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'estornado', label: 'Estornado' },
];

export interface FaturaAjusteManualDialogProps {
  fatura: FaturaComDetalhes | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSaved: () => void;
}

export const FaturaAjusteManualDialog: React.FC<
  FaturaAjusteManualDialogProps
> = ({ fatura, open, onOpenChange, userId, onSaved }) => {
  const { toast } = useToast();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [syncResult, setSyncResult] = useState<
    { ok: true; message: string } | { ok: false; message: string } | null
  >(null);

  // Campos do formulário manual
  const [status, setStatus] = useState<StatusFatura>('pendente');
  const [valorTotal, setValorTotal] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [descricao, setDescricao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [desvincular, setDesvincular] = useState(false);

  const prefillFromFatura = useCallback((f: FaturaComDetalhes) => {
    setStatus((f.status as StatusFatura) || 'pendente');
    setValorTotal(
      f.valor_total !== undefined && f.valor_total !== null
        ? String(f.valor_total)
        : ''
    );
    setVencimento((f.vencimento || '').split('T')[0]);
    setDescricao(f.descricao || '');
    setObservacoes('');
    setDesvincular(false);
  }, []);

  // AI dev note: Ao abrir, tenta re-sincronizar com o ASAAS automaticamente e
  // pré-preenche o formulário com o estado resultante.
  const runResync = useCallback(
    async (f: FaturaComDetalhes) => {
      setIsSyncing(true);
      setSyncResult(null);
      try {
        const result = await ressincronizarFaturaAsaas(f.id, userId);
        if (result.success && result.data) {
          const { statusAnterior, statusAtual, notFound } = result.data;
          const mudou = statusAnterior !== statusAtual;
          setSyncResult({
            ok: true,
            message: notFound
              ? 'A cobrança não existe mais no ASAAS — fatura marcada como cancelada e consultas liberadas.'
              : mudou
                ? `Sincronizado: status atualizado de "${statusAnterior}" para "${statusAtual}".`
                : `Sincronizado: status confirmado como "${statusAtual}" (nenhuma mudança).`,
          });
          // Atualiza o form com os valores sincronizados
          setStatus((statusAtual as StatusFatura) || 'pendente');
          if (result.data.asaas?.value !== undefined)
            setValorTotal(String(result.data.asaas.value));
          if (result.data.asaas?.dueDate)
            setVencimento(result.data.asaas.dueDate.split('T')[0]);
          if (result.data.asaas?.description)
            setDescricao(result.data.asaas.description);
          onSaved();
        } else {
          setSyncResult({
            ok: false,
            message:
              result.error ||
              'Não foi possível sincronizar com o ASAAS. Ajuste os parâmetros manualmente abaixo.',
          });
        }
      } catch {
        setSyncResult({
          ok: false,
          message:
            'Erro ao sincronizar com o ASAAS. Ajuste os parâmetros manualmente abaixo.',
        });
      } finally {
        setIsSyncing(false);
      }
    },
    [userId, onSaved]
  );

  useEffect(() => {
    if (open && fatura) {
      prefillFromFatura(fatura);
      void runResync(fatura);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fatura?.id]);

  const handleSaveManual = async () => {
    if (!fatura) return;
    setIsSaving(true);
    try {
      const valorNum = parseFloat(valorTotal.replace(',', '.'));
      const ajuste: AjusteManualFaturaInput = {
        status,
        valor_total: Number.isFinite(valorNum) ? valorNum : undefined,
        vencimento: vencimento || undefined,
        descricao: descricao || undefined,
        observacoes: observacoes || undefined,
        desvincularConsultas: desvincular,
      };

      const result = await ajustarFaturaManual(fatura.id, ajuste, userId);
      if (result.success) {
        toast({
          title: 'Fatura ajustada',
          description: desvincular
            ? 'Parâmetros salvos. Consultas desvinculadas e liberadas para nova cobrança.'
            : 'Os parâmetros da fatura foram atualizados manualmente.',
        });
        onSaved();
        onOpenChange(false);
      } else {
        toast({
          title: 'Erro ao ajustar fatura',
          description: result.error || 'Erro desconhecido ao ajustar fatura',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Erro ao ajustar fatura',
        description: 'Erro inesperado ao ajustar fatura',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-azul-respira" />
            Ajustar parâmetros da fatura
          </DialogTitle>
          <DialogDescription>
            Use quando o webhook do ASAAS não atualizou o sistema. Primeiro
            tentamos sincronizar automaticamente com o ASAAS; ajuste manualmente
            se necessário. Nenhuma cobrança é criada ou editada no ASAAS por
            aqui.
          </DialogDescription>
        </DialogHeader>

        {/* Resultado da re-sincronização */}
        {isSyncing ? (
          <Alert>
            <RefreshCw className="h-4 w-4 animate-spin" />
            <AlertDescription>Sincronizando com o ASAAS…</AlertDescription>
          </Alert>
        ) : syncResult ? (
          <Alert
            className={
              syncResult.ok
                ? 'border-green-500 bg-green-500/10'
                : 'border-yellow-500 bg-yellow-500/10'
            }
          >
            {syncResult.ok ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            )}
            <AlertDescription>{syncResult.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Edição manual</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fatura && runResync(fatura)}
              disabled={isSyncing || !fatura}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1 ${isSyncing ? 'animate-spin' : ''}`}
              />
              Re-sincronizar
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ajuste-status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as StatusFatura)}
              >
                <SelectTrigger id="ajuste-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ajuste-valor">Valor total (R$)</Label>
              <Input
                id="ajuste-valor"
                type="number"
                step="0.01"
                value={valorTotal}
                onChange={(e) => setValorTotal(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ajuste-vencimento">Vencimento</Label>
              <Input
                id="ajuste-vencimento"
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ajuste-descricao">Descrição</Label>
            <Textarea
              id="ajuste-descricao"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ajuste-obs">Observações (motivo do ajuste)</Label>
            <Textarea
              id="ajuste-obs"
              rows={2}
              placeholder="Ex: webhook do ASAAS não chegou; corrigindo manualmente."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border/60 p-3">
            <Checkbox
              checked={desvincular}
              onCheckedChange={(c) => setDesvincular(Boolean(c))}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">
                Desvincular consultas e reabrir para nova cobrança
              </span>
              <span className="block text-xs text-muted-foreground">
                Marca a fatura como inativa e devolve as consultas para
                "pendente". Use quando a cobrança foi cancelada no ASAAS.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Fechar
          </Button>
          <Button onClick={handleSaveManual} disabled={isSaving || isSyncing}>
            {isSaving ? 'Salvando…' : 'Salvar ajuste'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

FaturaAjusteManualDialog.displayName = 'FaturaAjusteManualDialog';
