import React from 'react';
import { format, parseISO } from 'date-fns';
import { Loader2, Wand2, CalendarClock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Label,
  CurrencyInput,
  Alert,
  AlertDescription,
} from '@/components/primitives';
import { DatePicker } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Preenche o valor real de uma conta fixa de valor variável.
// Conta como condomínio, energia e imposto nasce como PREVISÃO (R$ 0,00,
// status pre_lancamento) porque o valor só se conhece quando o boleto chega.
// Enquanto ninguém preenche, não é dívida — é lembrete de vencimento.
// A RPC promove a previsão a conta a pagar de verdade (pre_lancamento →
// validado) e sincroniza lançamento, item e parcela numa transação só.

export interface PrevisaoParaPreencher {
  id: string;
  descricao: string;
  data_vencimento: string;
  fornecedor?: string | null;
  categoria?: string | null;
  /** Último valor real lançado para a mesma regra recorrente. */
  valor_ultimo_real?: number | null;
  competencia_ultimo_real?: string | null;
}

interface PrevisaoValorDialogProps {
  previsao: PrevisaoParaPreencher;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const moeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v);

export const PrevisaoValorDialog = React.memo<PrevisaoValorDialogProps>(
  ({ previsao, onSuccess, onCancel }) => {
    const [valor, setValor] = React.useState<number | null>(null);
    const [vencimento, setVencimento] = React.useState<string>(
      previsao.data_vencimento
    );
    const [documento, setDocumento] = React.useState('');
    const [isSaving, setIsSaving] = React.useState(false);
    const { toast } = useToast();

    const sugestao = previsao.valor_ultimo_real ?? null;

    const handleSalvar = async () => {
      if (!valor || valor <= 0) {
        toast({
          variant: 'destructive',
          title: 'Informe o valor',
          description: 'O valor precisa ser maior que zero.',
        });
        return;
      }

      setIsSaving(true);
      try {
        const { error } = await supabase.rpc(
          'fn_financeiro_definir_valor_previsao',
          {
            p_conta_pagar_id: previsao.id,
            p_valor: valor,
            p_data_vencimento: vencimento || null,
            p_numero_documento: documento.trim() || null,
            p_observacoes: null,
          }
        );

        if (error) throw error;

        toast({
          title: 'Previsão virou conta a pagar',
          description: `${previsao.descricao} — ${moeda(valor)}`,
        });
        onSuccess?.();
      } catch (error) {
        console.error('Erro ao preencher previsão:', error);
        toast({
          variant: 'destructive',
          title: 'Não foi possível salvar',
          description:
            error instanceof Error
              ? error.message
              : 'Erro ao preencher o valor da previsão.',
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
              <CalendarClock className="h-5 w-5" />
              Preencher valor da conta
            </DialogTitle>
            <DialogDescription>{previsao.descricao}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {(previsao.fornecedor || previsao.categoria) && (
              <p className="text-sm text-muted-foreground">
                {[previsao.fornecedor, previsao.categoria]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}

            {sugestao !== null && sugestao > 0 && (
              <Alert>
                <Wand2 className="h-4 w-4" />
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  <span>
                    Último valor real: <strong>{moeda(sugestao)}</strong>
                    {previsao.competencia_ultimo_real && (
                      <span className="text-muted-foreground">
                        {' '}
                        (
                        {format(
                          parseISO(previsao.competencia_ultimo_real),
                          'MM/yyyy'
                        )}
                        )
                      </span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setValor(sugestao)}
                  >
                    Usar este valor
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="previsao-valor">Valor da conta *</Label>
              <CurrencyInput
                id="previsao-valor"
                value={valor}
                onChange={setValor}
                placeholder="R$ 0,00"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="previsao-vencimento">Vencimento</Label>
              <DatePicker
                value={vencimento}
                onChange={setVencimento}
                placeholder="dd/mm/aaaa"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="previsao-documento">
                Número do documento{' '}
                <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="previsao-documento"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="Nº do boleto, nota ou DARF"
                maxLength={50}
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
            <Button type="button" onClick={handleSalvar} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar valor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

PrevisaoValorDialog.displayName = 'PrevisaoValorDialog';
