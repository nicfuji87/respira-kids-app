import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { toast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { fetchProfissionais } from '@/lib/calendar-services';
import {
  listarPrecosProfissionalDoServico,
  salvarPrecoProfissional,
} from '@/lib/preco-servico';
import type { TipoServico } from '@/types/system-config';

// AI dev note: Preço do serviço por profissional. Campo vazio = a profissional
// cobra o preço padrão do serviço. Vale só para agendamentos novos (o valor
// fica gravado em cada agendamento na criação).

interface PrecosProfissionalDialogProps {
  servico: TipoServico | null;
  onClose: () => void;
  onSaved?: () => void;
}

const formatBRL = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    valor
  );

export const PrecosProfissionalDialog: React.FC<
  PrecosProfissionalDialogProps
> = ({ servico, onClose, onSaved }) => {
  const { user } = useAuth();
  const [profissionais, setProfissionais] = useState<
    Array<{ id: string; nome: string }>
  >([]);
  // Valor digitado por profissional ('' = preço padrão)
  const [valores, setValores] = useState<Record<string, string>>({});
  const [originais, setOriginais] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!servico) return;
    let cancelado = false;
    const carregar = async () => {
      setLoading(true);
      try {
        const [lista, precos] = await Promise.all([
          fetchProfissionais(),
          listarPrecosProfissionalDoServico(servico.id),
        ]);
        if (cancelado) return;
        const iniciais: Record<string, string> = {};
        for (const p of precos) {
          if (p.valor !== null) iniciais[p.profissionalId] = String(p.valor);
        }
        setProfissionais(lista.map((p) => ({ id: p.id, nome: p.nome })));
        setValores(iniciais);
        setOriginais(iniciais);
      } catch {
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar os preços por profissional',
          variant: 'destructive',
        });
      } finally {
        if (!cancelado) setLoading(false);
      }
    };
    carregar();
    return () => {
      cancelado = true;
    };
  }, [servico]);

  const padrao = Number(servico?.valor || 0);

  const handleSalvar = async () => {
    if (!servico) return;
    const alterados = profissionais.filter(
      (p) => (valores[p.id] ?? '') !== (originais[p.id] ?? '')
    );

    for (const p of alterados) {
      const texto = (valores[p.id] ?? '').trim();
      if (texto !== '' && (isNaN(Number(texto)) || Number(texto) < 0)) {
        toast({
          title: 'Valor inválido',
          description: `Confira o valor de ${p.nome}.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setSaving(true);
    try {
      for (const p of alterados) {
        const texto = (valores[p.id] ?? '').trim();
        // Igual ao padrão não precisa de exceção
        const valor =
          texto === '' || Number(texto) === padrao ? null : Number(texto);
        await salvarPrecoProfissional(
          servico.id,
          p.id,
          valor,
          user?.pessoa?.id
        );
      }
      toast({
        title: 'Preços salvos',
        description: 'Valem para os próximos agendamentos.',
      });
      onSaved?.();
      onClose();
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar os preços',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!servico} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Preço por profissional</DialogTitle>
          <DialogDescription>
            {servico?.nome?.replace(/\s+/g, ' ').trim()} — preço padrão{' '}
            {formatBRL(padrao)}. Deixe em branco para a profissional cobrar o
            padrão. Vale para os próximos agendamentos.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {profissionais.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <Label htmlFor={`preco-${p.id}`} className="flex-1 font-normal">
                  {p.nome}
                </Label>
                <Input
                  id={`preco-${p.id}`}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder={String(padrao)}
                  value={valores[p.id] ?? ''}
                  onChange={(e) =>
                    setValores((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                  className="w-28 text-right"
                />
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
