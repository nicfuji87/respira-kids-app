// AI dev note: Dialog para registrar contato ou envio de evolução para pediatra

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import { Badge } from '@/components/primitives/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { useToast } from '@/components/primitives/use-toast';
import { Loader2, Send } from 'lucide-react';
import { registerPediatraEvent } from '@/lib/pediatra-relacionamento-api';
import type {
  PediatraRelacionamento,
  TipoContatoPediatra,
} from '@/types/pediatra-relacionamento';
import type { MetodoContato } from '@/types/inatividade';

export interface RegisterPediatraContactDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pediatra: PediatraRelacionamento | null;
  defaultTipo?: TipoContatoPediatra;
  onSuccess?: () => void;
}

export const RegisterPediatraContactDialog: React.FC<
  RegisterPediatraContactDialogProps
> = ({
  isOpen,
  onClose,
  pediatra,
  defaultTipo = 'contato_pediatra',
  onSuccess,
}) => {
  const { toast } = useToast();
  const [tipo, setTipo] = useState<TipoContatoPediatra>(defaultTipo);
  const [metodo, setMetodo] = useState<MetodoContato>('whatsapp');
  const [motivo, setMotivo] = useState('');
  const [evolucaoResumo, setEvolucaoResumo] = useState('');
  const [pacienteNome, setPacienteNome] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [proximoContato, setProximoContato] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTipo(defaultTipo);
    setMetodo('whatsapp');
    setMotivo('');
    setEvolucaoResumo('');
    setPacienteNome('');
    setObservacoes('');
    setProximoContato('');
  }, [isOpen, defaultTipo]);

  if (!pediatra) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await registerPediatraEvent(pediatra.pediatra_id, tipo, {
        metodo,
        dadosEvento: {
          motivo: motivo || undefined,
          evolucao_resumo:
            tipo === 'envio_evolucao_pediatra'
              ? evolucaoResumo || undefined
              : undefined,
          paciente_nome: pacienteNome || undefined,
          proximo_contato: proximoContato || undefined,
        },
        observacoes: observacoes || undefined,
      });

      toast({
        title:
          tipo === 'envio_evolucao_pediatra'
            ? 'Envio de evolução registrado'
            : 'Contato registrado',
        description: 'Registro salvo com sucesso.',
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast({
        title: 'Erro ao registrar',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            Registrar{' '}
            {tipo === 'envio_evolucao_pediatra'
              ? 'Envio de Evolução'
              : 'Contato'}{' '}
            — {pediatra.pediatra_nome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {pediatra.crm && (
              <Badge variant="outline">CRM {pediatra.crm}</Badge>
            )}
            <Badge variant="secondary">
              {pediatra.total_pacientes_vinculados} paciente(s)
            </Badge>
            <Badge variant="outline">{pediatra.status_relacionamento}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={tipo}
                onValueChange={(v) => setTipo(v as TipoContatoPediatra)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contato_pediatra">
                    Contato geral
                  </SelectItem>
                  <SelectItem value="envio_evolucao_pediatra">
                    Envio de evolução clínica
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Método</Label>
              <Select
                value={metodo}
                onValueChange={(v) => setMetodo(v as MetodoContato)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="presencial">Presencial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Paciente (opcional)</Label>
            <Textarea
              rows={1}
              value={pacienteNome}
              onChange={(e) => setPacienteNome(e.target.value)}
              placeholder="Nome do paciente associado ao contato/evolução"
            />
          </div>

          {tipo === 'envio_evolucao_pediatra' ? (
            <div className="space-y-1.5">
              <Label>Resumo da evolução enviada</Label>
              <Textarea
                rows={4}
                value={evolucaoResumo}
                onChange={(e) => setEvolucaoResumo(e.target.value)}
                placeholder="Resumo da evolução clínica enviada ao pediatra"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Motivo do contato</Label>
              <Textarea
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: Atualização sobre paciente, agradecimento por indicação, retomada de relacionamento"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Próximo contato (opcional)</Label>
              <input
                type="date"
                value={proximoContato}
                onChange={(e) => setProximoContato(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Registrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

RegisterPediatraContactDialog.displayName = 'RegisterPediatraContactDialog';
