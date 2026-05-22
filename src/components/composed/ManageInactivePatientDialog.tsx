// AI dev note: Dialog para gerenciar controle de inatividade do paciente
// Permite marcar/desmarcar como "não contatar" e ver histórico de contatos

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
import { ScrollArea } from '@/components/primitives/scroll-area';
import { Loader2, ShieldOff, ShieldCheck, History } from 'lucide-react';
import {
  fetchPatientInactivityContactHistory,
  markPatientDoNotContact,
  unmarkPatientDoNotContact,
} from '@/lib/inatividade-api';
import type {
  InactivePatient,
  MotivoNaoContatar,
  PessoaEvento,
} from '@/types/inatividade';

export interface ManageInactivePatientDialogProps {
  isOpen: boolean;
  onClose: () => void;
  patient: InactivePatient | null;
  onSuccess?: () => void;
}

export const ManageInactivePatientDialog: React.FC<
  ManageInactivePatientDialogProps
> = ({ isOpen, onClose, patient, onSuccess }) => {
  const { toast } = useToast();
  const [motivo, setMotivo] = useState<MotivoNaoContatar>('solicitado');
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PessoaEvento[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!isOpen || !patient) return;
    setMotivo('solicitado');
    setObservacoes(patient.observacoes_controle || '');
    (async () => {
      setLoadingHistory(true);
      try {
        const data = await fetchPatientInactivityContactHistory(patient.id);
        setHistory(data);
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [isOpen, patient]);

  const handleMark = async () => {
    if (!patient) return;
    setSaving(true);
    try {
      await markPatientDoNotContact(patient.id, motivo, observacoes);
      toast({
        title: 'Paciente marcado',
        description: 'Paciente removido da fila de contatos.',
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast({
        title: 'Erro',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUnmark = async () => {
    if (!patient) return;
    setSaving(true);
    try {
      await unmarkPatientDoNotContact(patient.id);
      toast({
        title: 'Bloqueio removido',
        description: 'Paciente voltou para a fila de contatos.',
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      toast({
        title: 'Erro',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!patient) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Gerenciar Paciente — {patient.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!patient.nao_contatar ? (
            <div className="space-y-3 border rounded-md p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldOff className="h-4 w-4 text-destructive" />
                Marcar como "não contatar"
              </div>

              <div className="space-y-1.5">
                <Label>Motivo</Label>
                <Select
                  value={motivo}
                  onValueChange={(v) => setMotivo(v as MotivoNaoContatar)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solicitado">
                      Solicitação do responsável
                    </SelectItem>
                    <SelectItem value="fora_janela">
                      Fora da janela de tratamento
                    </SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>

              <Button
                variant="destructive"
                onClick={handleMark}
                disabled={saving}
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldOff className="h-4 w-4" />
                )}
                Marcar como não contatar
              </Button>
            </div>
          ) : (
            <div className="space-y-3 border rounded-md p-3 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                Paciente atualmente marcado como "não contatar"
              </div>
              {patient.motivo_nao_contatar && (
                <div className="text-xs text-muted-foreground">
                  Motivo:{' '}
                  <Badge variant="outline">{patient.motivo_nao_contatar}</Badge>
                </div>
              )}
              {patient.observacoes_controle && (
                <div className="text-xs text-muted-foreground">
                  Obs: {patient.observacoes_controle}
                </div>
              )}
              <Button
                variant="outline"
                onClick={handleUnmark}
                disabled={saving}
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Remover bloqueio
              </Button>
            </div>
          )}

          <div className="space-y-2 border rounded-md p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4" />
              Histórico de Contatos ({history.length})
            </div>
            <ScrollArea className="max-h-[240px] pr-2">
              {loadingHistory ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : history.length === 0 ? (
                <div className="text-xs text-muted-foreground py-3">
                  Nenhum contato registrado.
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => {
                    const dados = h.dados_evento as Record<string, unknown>;
                    const status =
                      (dados?.status as string | undefined) || 'contatado';
                    const STATUS_LABEL: Record<string, string> = {
                      marcou_consulta: 'Marcou consulta',
                      tudo_bem: 'Tudo bem',
                      retornar_depois: 'Retornar depois',
                      nao_respondeu: 'Não respondeu',
                      sem_interesse: 'Sem interesse',
                      nao_contatar: 'Não contatar',
                      contatado: 'Contatado',
                    };
                    return (
                      <div
                        key={h.id}
                        className="text-xs border-l-2 border-rosa-suave pl-2 py-1"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium">
                            {new Intl.DateTimeFormat('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            }).format(new Date(h.data_evento))}
                          </span>
                          {h.metodo && (
                            <Badge variant="outline" className="text-[10px]">
                              {h.metodo}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {STATUS_LABEL[status] || status}
                          </Badge>
                        </div>
                        {h.observacoes && (
                          <div className="text-muted-foreground mt-0.5">
                            {h.observacoes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

ManageInactivePatientDialog.displayName = 'ManageInactivePatientDialog';
