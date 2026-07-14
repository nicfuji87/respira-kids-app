// AI dev note: Diálogo de ajuste manual de ponto (ex.: a estagiária esqueceu de
// bater). Insere uma batida com origem='manual' e motivo obrigatório, gravando
// qual acesso fez o ajuste (registradoPor). Aparece na aba "Gestão do estágio".
// Para corrigir um horário errado: remova a batida na auditoria e adicione a certa.

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import { Label } from '@/components/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { useToast } from '@/components/primitives/use-toast';
import { registrarPontoManual, type PontoTipo } from '@/lib/estagio-pontos-api';

interface Props {
  estagiario: { id: string; nome: string } | null;
  registradoPor: string | null;
  onSaved: () => void;
  onOpenChange: (open: boolean) => void;
}

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export const AjustePontoDialog: React.FC<Props> = ({
  estagiario,
  registradoPor,
  onSaved,
  onOpenChange,
}) => {
  const { toast } = useToast();
  const [tipo, setTipo] = useState<PontoTipo>('entrada');
  const [quando, setQuando] = useState(nowLocalInput());
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!estagiario) return;
    if (!quando || !motivo.trim()) {
      toast({
        title: 'Preencha data/hora e motivo',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      await registrarPontoManual({
        candidaturaId: estagiario.id,
        tipo,
        registradoEm: new Date(quando).toISOString(),
        observacao: motivo.trim(),
        registradoPor,
      });
      toast({ title: 'Batida manual registrada' });
      onSaved();
      onOpenChange(false);
      setMotivo('');
      setTipo('entrada');
      setQuando(nowLocalInput());
    } catch {
      toast({ title: 'Falha ao registrar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!estagiario} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajuste manual de ponto — {estagiario?.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as PontoTipo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Data e hora</Label>
            <Input
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo do ajuste</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: esqueceu de bater a saída às 13h."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Registrar batida
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

AjustePontoDialog.displayName = 'AjustePontoDialog';
