// AI dev note: Diálogo de movimentação de estoque (entrada / ajuste / perda).
// Saída por venda NÃO é feita aqui — é gerada automaticamente pelo trigger quando a
// venda é paga. A quantidade é convertida para delta com sinal antes de gravar.

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/primitives/dialog';
import { Input } from '@/components/primitives/input';
import { CurrencyInput } from '@/components/primitives/currency-input';
import { Label } from '@/components/primitives/label';
import { Button } from '@/components/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { useToast } from '@/components/primitives/use-toast';
import { Loader2 } from 'lucide-react';
import { registrarMovimento } from '@/lib/produtos-api';
import type { Produto, TipoMovimento } from '@/types/produtos';

type TipoManual = 'entrada' | 'ajuste' | 'perda';

interface EstoqueMovimentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produto: Produto | null;
  userId: string;
  onSaved: () => void;
}

export const EstoqueMovimentoDialog: React.FC<EstoqueMovimentoDialogProps> = ({
  open,
  onOpenChange,
  produto,
  userId,
  onSaved,
}) => {
  const { toast } = useToast();
  const [tipo, setTipo] = useState<TipoManual>('entrada');
  const [ajusteSentido, setAjusteSentido] = useState<'add' | 'rem'>('add');
  const [quantidadeStr, setQuantidadeStr] = useState('');
  const [custo, setCusto] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo('entrada');
      setAjusteSentido('add');
      setQuantidadeStr('');
      setCusto(null);
      setMotivo('');
    }
  }, [open]);

  const handleSave = async () => {
    if (!produto) return;
    const qtd = Number(quantidadeStr.replace(',', '.'));
    if (!qtd || Number.isNaN(qtd) || qtd <= 0) {
      toast({ title: 'Informe uma quantidade válida', variant: 'destructive' });
      return;
    }

    // converte para delta com sinal
    let delta = qtd;
    if (tipo === 'perda') delta = -qtd;
    if (tipo === 'ajuste') delta = ajusteSentido === 'add' ? qtd : -qtd;

    const custoFinal = tipo === 'entrada' ? custo : null;

    setSaving(true);
    try {
      await registrarMovimento(
        {
          produto_id: produto.id,
          tipo: tipo as TipoMovimento,
          quantidade: delta,
          motivo: motivo.trim() || null,
          custo_unitario: custoFinal,
        },
        userId
      );
      toast({ title: 'Movimento registrado' });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Erro ao registrar movimento',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Movimentar estoque</DialogTitle>
          <DialogDescription>{produto?.nome}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={tipo}
              onValueChange={(v) => setTipo(v as TipoManual)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">
                  Entrada (compra/reposição)
                </SelectItem>
                <SelectItem value="ajuste">Ajuste de inventário</SelectItem>
                <SelectItem value="perda">Perda / descarte</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipo === 'ajuste' && (
            <div className="space-y-1.5">
              <Label>Sentido do ajuste</Label>
              <Select
                value={ajusteSentido}
                onValueChange={(v) => setAjusteSentido(v as 'add' | 'rem')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Adicionar ao estoque</SelectItem>
                  <SelectItem value="rem">Remover do estoque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mov-qtd">Quantidade</Label>
              <Input
                id="mov-qtd"
                inputMode="numeric"
                value={quantidadeStr}
                onChange={(e) => setQuantidadeStr(e.target.value)}
                placeholder="0"
              />
            </div>
            {tipo === 'entrada' && (
              <div className="space-y-1.5">
                <Label htmlFor="mov-custo">Custo unit.</Label>
                <CurrencyInput
                  id="mov-custo"
                  value={custo}
                  onChange={setCusto}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mov-motivo">Motivo (opcional)</Label>
            <Input
              id="mov-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
