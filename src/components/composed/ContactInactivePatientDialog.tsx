// AI dev note: Dialog para registrar RETORNO do contato com paciente inativo
// Fluxo: secretária clica em "Contatar" no card → este dialog abre com botão wa.me
// que abre a conversa no WhatsApp do device. Depois ela volta aqui e registra o retorno
// (não respondeu, marcou consulta, tudo bem, etc) — não há envio automático por webhook.
// v2 (set/2026): mensagem por perfil (reativacao-mensagens.ts), editável antes de
// abrir o WhatsApp; o registro vai pela RPC, que decide se conta para a meta.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
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
import {
  Loader2,
  MessageCircle,
  ExternalLink,
  CheckCircle2,
  PhoneOff,
  CalendarCheck,
  Smile,
  Ban,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildWhatsAppLink,
  registrarContatoReativacao,
} from '@/lib/inatividade-api';
import { montarMensagemReativacao } from '@/lib/reativacao-mensagens';
import { useAuth } from '@/hooks/useAuth';
import type {
  MetodoContato,
  ReativacaoPaciente,
  ResultadoContato,
} from '@/types/inatividade';

export interface ContactInactivePatientDialogProps {
  isOpen: boolean;
  onClose: () => void;
  patient: ReativacaoPaciente | null;
  onSuccess?: () => void;
}

interface ResultadoOption {
  value: ResultadoContato;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}

const RESULTADO_OPTIONS: ResultadoOption[] = [
  {
    value: 'marcou_consulta',
    label: 'Marcou nova consulta',
    icon: CalendarCheck,
    variant: 'default',
  },
  {
    value: 'tudo_bem',
    label: 'Tudo bem com o paciente',
    icon: Smile,
    variant: 'secondary',
  },
  {
    value: 'retornar_depois',
    label: 'Pediu para retornar depois',
    icon: Clock,
    variant: 'secondary',
  },
  {
    value: 'nao_respondeu',
    label: 'Não respondeu',
    icon: PhoneOff,
    variant: 'outline',
  },
  {
    value: 'sem_interesse',
    label: 'Sem interesse no momento',
    icon: Ban,
    variant: 'outline',
  },
  {
    value: 'nao_contatar',
    label: 'Pediu para não contatar mais',
    icon: Ban,
    variant: 'destructive',
  },
];

export const ContactInactivePatientDialog: React.FC<
  ContactInactivePatientDialogProps
> = ({ isOpen, onClose, patient, onSuccess }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [mensagem, setMensagem] = useState('');
  const [resultado, setResultado] = useState<ResultadoContato | null>(null);
  const [metodo, setMetodo] = useState<MetodoContato>('whatsapp');
  const [observacoes, setObservacoes] = useState('');
  const [proximoContato, setProximoContato] = useState('');
  const [whatsappAberto, setWhatsappAberto] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && patient) {
      setResultado(null);
      setMetodo('whatsapp');
      setObservacoes('');
      setProximoContato('');
      setWhatsappAberto(false);
      setMensagem(
        montarMensagemReativacao({
          perfil: patient.perfil,
          pacienteNome: patient.nome,
          responsavelNome: patient.responsavel_nome,
          secretariaNome: user?.pessoa?.nome ?? null,
          idadeMeses: patient.idade_meses,
        })
      );
    }
  }, [isOpen, patient, user?.pessoa?.nome]);

  const waLink = useMemo(() => {
    if (!patient) return null;
    return buildWhatsAppLink(patient.responsavel_telefone, mensagem);
  }, [patient, mensagem]);

  const handleOpenWhatsApp = () => {
    if (!waLink) return;
    window.open(waLink, '_blank', 'noopener,noreferrer');
    setWhatsappAberto(true);
  };

  const handleSave = async () => {
    if (!patient || !resultado) return;
    setSaving(true);
    try {
      const r = await registrarContatoReativacao({
        pacienteId: patient.id,
        metodo,
        resultado,
        proximoContato: proximoContato || undefined,
        observacoes: observacoes || undefined,
        mensagem: whatsappAberto ? mensagem : undefined,
      });

      toast({
        title: r.conta_para_meta
          ? 'Contato registrado e contando para a meta'
          : 'Contato registrado',
        description: r.conta_para_meta
          ? 'Se houver sessão em até 30 dias, conta como reativação.'
          : `Não conta para a meta: ${r.motivo ?? 'fora das regras'}.`,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Erro ao registrar contato:', err);
      toast({
        title: 'Erro ao registrar',
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
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-rosa-suave" />
            Contatar família de {patient.nome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge variant="outline">
              {patient.perfil === 'motora_alta'
                ? 'Alta da motora'
                : patient.perfil === 'motora_e_respiratoria'
                  ? 'Motora + respiratória'
                  : 'Respiratória'}
            </Badge>
            <Badge variant="secondary">
              {patient.dias_sem_sessao} dias sem sessão
            </Badge>
            {patient.responsavel_nome && (
              <Badge variant="outline">Resp: {patient.responsavel_nome}</Badge>
            )}
          </div>

          {!patient.conta_para_meta && (
            <div className="rounded-md border border-amarelo-pipa bg-amarelo-pipa/20 p-2 text-xs">
              {patient.nao_contatar
                ? 'A família pediu para não ser contatada.'
                : 'Esta família já recebeu contato nos últimos 90 dias. Pode falar de novo se fizer sentido, mas este contato não conta para a meta.'}
            </div>
          )}

          {patient.perfil === 'motora_alta' && (
            <p className="text-xs text-muted-foreground">
              Paciente teve alta da motora: pergunte do desenvolvimento e lembre
              que atendemos a parte respiratória. Não ofereça motora de novo.
            </p>
          )}

          {/* AI dev note: Passo 1 — abrir WhatsApp */}
          <div className="border rounded-md p-3 space-y-2 bg-muted/30">
            <div className="text-sm font-medium flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rosa-suave text-white text-[10px] font-bold">
                1
              </span>
              Revisar a mensagem e abrir o WhatsApp
            </div>
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={6}
              className="text-sm"
            />
            {waLink ? (
              <Button
                onClick={handleOpenWhatsApp}
                className="gap-2 w-full"
                variant={whatsappAberto ? 'outline' : 'default'}
              >
                <ExternalLink className="h-4 w-4" />
                {whatsappAberto
                  ? 'Abrir novamente o WhatsApp'
                  : 'Abrir WhatsApp do responsável'}
              </Button>
            ) : (
              <div className="text-xs text-destructive">
                Sem telefone cadastrado para o responsável legal. Atualize o
                cadastro do paciente.
              </div>
            )}
            {whatsappAberto && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                Conversa aberta. Após falar com o responsável, registre o
                retorno abaixo.
              </p>
            )}
          </div>

          {/* AI dev note: Passo 2 — registrar o retorno */}
          <div className="border rounded-md p-3 space-y-3">
            <div className="text-sm font-medium flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rosa-suave text-white text-[10px] font-bold">
                2
              </span>
              Registrar retorno do responsável
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {RESULTADO_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = resultado === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setResultado(opt.value)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors text-left',
                      active
                        ? 'border-rosa-suave bg-rosa-suave/10 text-rosa-suave font-medium'
                        : 'hover:bg-muted/50 border-input'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs">Método usado</Label>
                <Select
                  value={metodo}
                  onValueChange={(v) => setMetodo(v as MetodoContato)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="presencial">Presencial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {resultado === 'retornar_depois' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Retornar em</Label>
                  <Input
                    type="date"
                    value={proximoContato}
                    onChange={(e) => setProximoContato(e.target.value)}
                    className="h-10 w-full bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                placeholder="Algum detalhe sobre o retorno..."
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !resultado}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Salvar Retorno
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

ContactInactivePatientDialog.displayName = 'ContactInactivePatientDialog';
