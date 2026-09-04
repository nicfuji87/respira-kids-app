import React from 'react';
import { format } from 'date-fns';
import { Loader2, CreditCard, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertDescription,
} from '@/components/primitives';
import { DatePicker } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Baixa em lote de contas a pagar.
// Chama fn_financeiro_baixar_contas, que só baixa parcelas ainda 'pendente'
// e checa o papel do usuário no servidor — a seleção da tela é conveniência,
// não é a trava. A RPC devolve quantas foram efetivamente baixadas, por isso
// mostramos esse número (e não o tamanho da seleção) no aviso de sucesso.

interface FormaPagamento {
  id: string;
  nome: string;
  requer_conta_bancaria: boolean;
}

interface ContaBancaria {
  id: string;
  nome_conta: string;
  banco_nome: string;
}

interface BaixaLoteDialogProps {
  contaIds: string[];
  valorTotal: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const moeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v);

export const BaixaLoteDialog = React.memo<BaixaLoteDialogProps>(
  ({ contaIds, valorTotal, onSuccess, onCancel }) => {
    const [dataPagamento, setDataPagamento] = React.useState(
      format(new Date(), 'yyyy-MM-dd')
    );
    const [formaPagamentoId, setFormaPagamentoId] = React.useState<string>('');
    const [contaBancariaId, setContaBancariaId] = React.useState<string>('');
    const [observacao, setObservacao] = React.useState('');
    const [formas, setFormas] = React.useState<FormaPagamento[]>([]);
    const [contasBancarias, setContasBancarias] = React.useState<
      ContaBancaria[]
    >([]);
    const [isSaving, setIsSaving] = React.useState(false);
    const { toast } = useToast();

    React.useEffect(() => {
      const carregar = async () => {
        const [formasRes, contasRes] = await Promise.all([
          supabase
            .from('formas_pagamento')
            .select('id, nome, requer_conta_bancaria')
            .eq('ativo', true)
            .order('nome'),
          supabase
            .from('contas_bancarias')
            .select('id, nome_conta, banco_nome')
            .eq('ativo', true)
            .order('nome_conta'),
        ]);
        setFormas(formasRes.data || []);
        setContasBancarias(contasRes.data || []);
      };
      void carregar();
    }, []);

    const formaSelecionada = formas.find((f) => f.id === formaPagamentoId);
    const exigeConta = formaSelecionada?.requer_conta_bancaria ?? false;

    const handleConfirmar = async () => {
      if (!dataPagamento) {
        toast({
          variant: 'destructive',
          title: 'Informe a data',
          description: 'A data de pagamento é obrigatória.',
        });
        return;
      }
      if (exigeConta && !contaBancariaId) {
        toast({
          variant: 'destructive',
          title: 'Informe a conta bancária',
          description: `${formaSelecionada?.nome} exige conta bancária.`,
        });
        return;
      }

      setIsSaving(true);
      try {
        const { data, error } = await supabase.rpc(
          'fn_financeiro_baixar_contas',
          {
            p_ids: contaIds,
            p_data_pagamento: dataPagamento,
            p_forma_pagamento_id: formaPagamentoId || null,
            p_conta_bancaria_id: contaBancariaId || null,
            p_observacao: observacao.trim() || null,
          }
        );

        if (error) throw error;

        const resultado = data as { baixadas: number; total: number } | null;
        const baixadas = resultado?.baixadas ?? 0;

        if (baixadas === 0) {
          toast({
            variant: 'destructive',
            title: 'Nenhuma conta foi baixada',
            description:
              'As parcelas selecionadas já haviam sido pagas ou canceladas.',
          });
        } else {
          toast({
            title: `${baixadas} conta${baixadas !== 1 ? 's' : ''} baixada${baixadas !== 1 ? 's' : ''}`,
            description: `Total de ${moeda(resultado?.total ?? 0)}.`,
          });
        }
        onSuccess?.();
      } catch (error) {
        console.error('Erro na baixa em lote:', error);
        toast({
          variant: 'destructive',
          title: 'Não foi possível dar baixa',
          description:
            error instanceof Error
              ? error.message
              : 'Erro ao registrar os pagamentos.',
        });
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <Dialog
        open
        onOpenChange={(aberto) => {
          if (!aberto && !isSaving) onCancel?.();
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Dar baixa em {contaIds.length} conta
              {contaIds.length !== 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              Total selecionado: <strong>{moeda(valorTotal)}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Registre a baixa só do que foi realmente pago. Conta em atraso
                continua em aberto até o pagamento acontecer.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="baixa-data">Data do pagamento *</Label>
              <DatePicker
                value={dataPagamento}
                onChange={setDataPagamento}
                placeholder="dd/mm/aaaa"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baixa-forma">Forma de pagamento</Label>
              <Select
                value={formaPagamentoId}
                onValueChange={setFormaPagamentoId}
              >
                <SelectTrigger id="baixa-forma">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {formas.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="baixa-conta">
                Conta bancária {exigeConta ? '*' : ''}
              </Label>
              <Select
                value={contaBancariaId}
                onValueChange={setContaBancariaId}
              >
                <SelectTrigger id="baixa-conta">
                  <SelectValue
                    placeholder={
                      exigeConta ? 'Obrigatória' : 'Selecione (opcional)'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {contasBancarias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome_conta} — {c.banco_nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="baixa-obs">
                Observação{' '}
                <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Textarea
                id="baixa-obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: pago em lote pelo Inter em 31/08"
                maxLength={500}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleConfirmar} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar baixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

BaixaLoteDialog.displayName = 'BaixaLoteDialog';
