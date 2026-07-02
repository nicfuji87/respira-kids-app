// AI dev note: RefazerContratoDialog - permite admin/secretária refazer o contrato
// de um paciente. O contrato é uma PROJEÇÃO dos dados do cadastro; aqui deixamos
// editáveis apenas as 3 autorizações (o campo que mais motiva o refazer). Ao
// confirmar: salva as autorizações, cancela o contrato atual, gera um novo a
// partir dos dados atuais e reenvia para assinatura. Tudo registrado em auditoria.

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { useToast } from '@/components/primitives/use-toast';
import { Loader2, Check, AlertCircle, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { refazerContrato } from '@/lib/contract-api';

interface RefazerContratoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  onDone?: () => void;
}

type SimNao = boolean | null;

const SimNaoToggle: React.FC<{
  label: string;
  descricao: string;
  value: SimNao;
  onChange: (v: boolean) => void;
}> = ({ label, descricao, value, onChange }) => (
  <div className="p-3 rounded-lg border-2 border-border space-y-2">
    <Label className="font-semibold text-sm">
      {label} <span className="text-destructive">*</span>
    </Label>
    <p className="text-xs text-muted-foreground">{descricao}</p>
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          'flex-1 py-1.5 px-3 rounded-md border-2 transition-all text-sm font-medium',
          value === true
            ? 'bg-green-50 dark:bg-green-950/20 border-green-500 text-green-700 dark:text-green-300'
            : 'border-border hover:bg-accent'
        )}
      >
        {value === true && <Check className="inline w-3.5 h-3.5 mr-1" />}
        Sim
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          'flex-1 py-1.5 px-3 rounded-md border-2 transition-all text-sm font-medium',
          value === false
            ? 'bg-gray-100 dark:bg-gray-900 border-gray-400 text-gray-700 dark:text-gray-300'
            : 'border-border hover:bg-accent'
        )}
      >
        {value === false && <Check className="inline w-3.5 h-3.5 mr-1" />}
        Não
      </button>
    </div>
  </div>
);

export const RefazerContratoDialog = React.memo<RefazerContratoDialogProps>(
  ({ isOpen, onClose, patientId, onDone }) => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [cientifico, setCientifico] = useState<SimNao>(null);
    const [redes, setRedes] = useState<SimNao>(null);
    const [nome, setNome] = useState<SimNao>(null);
    const [motivo, setMotivo] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Carregar autorizações atuais do paciente ao abrir
    useEffect(() => {
      if (!isOpen) return;
      let cancelled = false;
      const load = async () => {
        setLoading(true);
        setError(null);
        setMotivo('');
        const { data, error: err } = await supabase
          .from('pessoas')
          .select(
            'autorizacao_uso_cientifico, autorizacao_uso_redes_sociais, autorizacao_uso_do_nome'
          )
          .eq('id', patientId)
          .single();
        if (cancelled) return;
        if (err) {
          setError('Não foi possível carregar as autorizações do paciente.');
        } else {
          setCientifico(data?.autorizacao_uso_cientifico ?? null);
          setRedes(data?.autorizacao_uso_redes_sociais ?? null);
          setNome(data?.autorizacao_uso_do_nome ?? null);
        }
        setLoading(false);
      };
      load();
      return () => {
        cancelled = true;
      };
    }, [isOpen, patientId]);

    const allAnswered = cientifico !== null && redes !== null && nome !== null;
    const canSubmit = allAnswered && motivo.trim().length >= 3 && !submitting;

    const handleConfirm = useCallback(async () => {
      if (!allAnswered) {
        setError('Responda todas as autorizações (Sim ou Não).');
        return;
      }
      if (motivo.trim().length < 3) {
        setError('Informe o motivo do refazer (mínimo 3 caracteres).');
        return;
      }

      setSubmitting(true);
      setError(null);
      try {
        // Resolver quem está refazendo (pessoas.id do usuário logado) para auditoria.
        const {
          data: { user },
        } = await supabase.auth.getUser();
        let refeitoPor: string | null = null;
        if (user) {
          const { data: pessoa } = await supabase
            .from('pessoas')
            .select('id')
            .eq('auth_user_id', user.id)
            .maybeSingle();
          refeitoPor = pessoa?.id ?? null;
        }

        const novo = await refazerContrato({
          patientId,
          autorizacoes: {
            usoCientifico: cientifico!,
            usoRedesSociais: redes!,
            usoNome: nome!,
          },
          motivo: motivo.trim(),
          refeitoPor,
        });

        // Reenviar para assinatura (mesmo webhook da geração/reenvio).
        const { data: webhookResult, error: webhookError } =
          await supabase.functions.invoke('send-contract-webhook', {
            body: { contractId: novo.id, reenvio: false },
          });

        if (webhookError || !webhookResult?.success) {
          toast({
            title: 'Contrato refeito com aviso',
            description:
              'O novo contrato foi gerado, mas o envio automático falhou. Use "Reenviar contrato" para tentar novamente.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Contrato refeito com sucesso!',
            description:
              'O responsável receberá o novo contrato por e-mail para assinatura.',
          });
        }

        onDone?.();
        onClose();
      } catch (err) {
        console.error('Erro ao refazer contrato:', err);
        setError(
          err instanceof Error ? err.message : 'Erro ao refazer o contrato'
        );
      } finally {
        setSubmitting(false);
      }
    }, [
      allAnswered,
      motivo,
      patientId,
      cientifico,
      redes,
      nome,
      toast,
      onDone,
      onClose,
    ]);

    return (
      <Dialog
        open={isOpen}
        onOpenChange={(o) => !o && !submitting && onClose()}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCw className="h-5 w-5" />
              Refazer Contrato
            </DialogTitle>
            <DialogDescription>
              Ajuste as autorizações abaixo (se necessário) e informe o motivo.
              O contrato atual será cancelado e um novo será gerado a partir dos
              dados atuais e reenviado para assinatura.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              <SimNaoToggle
                label="Autorização para uso científico"
                descricao="Uso de informações do tratamento para fins científicos, estudos e pesquisas (dados anonimizados)."
                value={cientifico}
                onChange={setCientifico}
              />
              <SimNaoToggle
                label="Autorização para uso em redes sociais"
                descricao="Uso de imagens e vídeos em redes sociais e materiais de divulgação da clínica."
                value={redes}
                onChange={setRedes}
              />
              <SimNaoToggle
                label="Autorização para uso do nome"
                descricao="Uso do nome do paciente em publicações, depoimentos e materiais de divulgação."
                value={nome}
                onChange={setNome}
              />

              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">
                  Para alterar responsável, endereço ou valores, edite o
                  cadastro do paciente — o refazer usa sempre os dados atuais.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="motivo-refazer"
                  className="text-sm font-semibold"
                >
                  Motivo do refazer <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="motivo-refazer"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: correção da cláusula de uso de imagem"
                  rows={2}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={!canSubmit || loading}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Refazendo...
                </>
              ) : (
                <>
                  <RotateCw className="h-4 w-4 mr-2" />
                  Refazer e reenviar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

RefazerContratoDialog.displayName = 'RefazerContratoDialog';
