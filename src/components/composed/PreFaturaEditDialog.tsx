import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Calendar, User, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Checkbox } from '@/components/primitives/checkbox';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  fetchAgendamentosElegiveisParaPreFatura,
  editarPreFatura,
  type PreFaturaResumo,
  type PreFaturaAgendamento,
} from '@/lib/payment-links-api';

// AI dev note: Edita os ITENS de uma pré-fatura (pagamento_links não gerado no
// Asaas). Lista as consultas elegíveis (mesmo responsável + empresa), pré-marca
// as que já estão na pré-fatura, e ao salvar recalcula valor/descrição via
// editarPreFatura (sem tocar no Asaas). O total exibido é a soma dos selecionados.

export interface PreFaturaEditDialogProps {
  preFatura: PreFaturaResumo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSaved: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

const formatDateHora = (dateString: string) => {
  if (!dateString) return '--/--/----';
  return new Date(dateString).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const PreFaturaEditDialog: React.FC<PreFaturaEditDialogProps> = ({
  preFatura,
  open,
  onOpenChange,
  userId,
  onSaved,
}) => {
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elegiveis, setElegiveis] = useState<PreFaturaAgendamento[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [originais, setOriginais] = useState<string[]>([]);

  const carregar = useCallback(async () => {
    if (!preFatura) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchAgendamentosElegiveisParaPreFatura(
        preFatura.responsavel_cobranca_id,
        preFatura.empresa_id,
        preFatura.id
      );

      if (!result.success || !result.data) {
        setError(result.error || 'Erro ao carregar consultas elegíveis');
        setElegiveis([]);
        return;
      }

      // AI dev note: Garante que as consultas já vinculadas à pré-fatura apareçam
      // na lista mesmo que a query de elegíveis (por algum filtro) não as traga.
      const mapa = new Map<string, PreFaturaAgendamento>();
      [...result.data, ...preFatura.agendamentos].forEach((a) =>
        mapa.set(a.id, a)
      );
      const lista = Array.from(mapa.values()).sort(
        (a, b) =>
          new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()
      );

      const atuais = preFatura.agendamentos.map((a) => a.id);
      setElegiveis(lista);
      setSelecionados(atuais);
      setOriginais(atuais);
    } catch (e) {
      console.error('Erro ao carregar elegíveis da pré-fatura:', e);
      setError('Erro inesperado ao carregar consultas');
    } finally {
      setIsLoading(false);
    }
  }, [preFatura]);

  useEffect(() => {
    if (open && preFatura) {
      carregar();
    } else if (!open) {
      setElegiveis([]);
      setSelecionados([]);
      setOriginais([]);
      setError(null);
    }
  }, [open, preFatura, carregar]);

  const toggle = (id: string) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const total = elegiveis
    .filter((a) => selecionados.includes(a.id))
    .reduce((sum, a) => sum + a.valor_servico, 0);

  const semMudanca =
    selecionados.length === originais.length &&
    selecionados.every((id) => originais.includes(id));

  const handleSalvar = async () => {
    if (!preFatura) return;
    if (selecionados.length === 0) {
      toast({
        title: 'Selecione ao menos uma consulta',
        description: 'Para apagar a pré-fatura use o botão "Excluir".',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const agendamentosParaAdicionar = selecionados.filter(
        (id) => !originais.includes(id)
      );
      const agendamentosParaRemover = originais.filter(
        (id) => !selecionados.includes(id)
      );

      const result = await editarPreFatura(
        preFatura.id,
        { agendamentosParaAdicionar, agendamentosParaRemover },
        userId
      );

      if (result.success) {
        toast({
          title: preFatura.expirado
            ? 'Pré-fatura reativada'
            : 'Pré-fatura atualizada',
          description: `${
            preFatura.expirado ? 'Reativada e recalculada' : 'Agora'
          } com ${selecionados.length} consulta${
            selecionados.length !== 1 ? 's' : ''
          } — ${formatCurrency(total)}.`,
        });
        onSaved();
        onOpenChange(false);
      } else {
        toast({
          title: 'Erro ao atualizar pré-fatura',
          description: result.error || 'Erro desconhecido',
          variant: 'destructive',
        });
      }
    } catch (e) {
      console.error('Erro ao salvar pré-fatura:', e);
      toast({
        title: 'Erro ao atualizar pré-fatura',
        description: 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar itens da pré-fatura</DialogTitle>
          <DialogDescription>
            {preFatura ? (
              <>
                {preFatura.paciente_nome} · {preFatura.empresa_nome}. Marque as
                consultas que devem entrar nesta cobrança. Nada é enviado ao
                Asaas — o valor e a descrição são recalculados automaticamente.
              </>
            ) : (
              'Carregando...'
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))
          ) : elegiveis.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma consulta elegível encontrada para este responsável.
            </div>
          ) : (
            elegiveis.map((a) => {
              const checked = selecionados.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                    checked
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(a.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {a.servico_nome}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDateHora(a.data_hora)}
                      </span>
                      <span className="flex items-center gap-1 truncate">
                        <User className="h-3 w-3" />
                        {a.profissional_nome}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm font-semibold whitespace-nowrap">
                    {formatCurrency(a.valor_servico)}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            {selecionados.length} selecionada
            {selecionados.length !== 1 ? 's' : ''}
          </span>
          <span className="text-lg font-bold text-primary">
            {formatCurrency(total)}
          </span>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={isSaving || isLoading || semMudanca}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
