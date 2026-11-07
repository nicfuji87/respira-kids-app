// AI dev note: botão "Cortesia" nos detalhes da consulta (admin e secretaria).
// Cortesia = a sessão aconteceu e não será cobrada: fica fora da cobrança em massa
// (podeGerarCobranca) e da conta de "não pagas". Marcar exige motivo e passa pela RPC
// fn_agendamento_cortesia (pagamento_sincronia_e_cortesia.sql), que recusa sessão já
// cobrada/paga ou cancelada. Quando quem marca é a secretaria, o banco avisa o grupo
// 🩺 RK · Agenda e atendimentos. O seletor comum de status não oferece "Cortesia".

import { useState } from 'react';
import { Gift, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

const PODE_MARCAR = new Set(['pendente', 'atrasado']);
const CONSULTA_PARADA = new Set(['cancelado', 'erro', 'reagendado']);

export interface CortesiaActionProps {
  agendamentoId: string;
  statusPagamentoCodigo?: string | null;
  statusConsultaCodigo?: string | null;
  userRole: 'admin' | 'profissional' | 'secretaria' | null;
  /** Recarregar a agenda depois de marcar ou desfazer. */
  onChanged?: () => void;
}

export function CortesiaAction({
  agendamentoId,
  statusPagamentoCodigo,
  statusConsultaCodigo,
  userRole,
  onChanged,
}: CortesiaActionProps) {
  const { toast } = useToast();
  const [codigo, setCodigo] = useState(statusPagamentoCodigo ?? '');
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (userRole !== 'admin' && userRole !== 'secretaria') return null;

  const ehCortesia = codigo === 'cortesia';
  const podeMarcar =
    PODE_MARCAR.has(codigo) && !CONSULTA_PARADA.has(statusConsultaCodigo ?? '');
  if (!ehCortesia && !podeMarcar) return null;

  const enviar = async (cortesia: boolean) => {
    setSalvando(true);
    try {
      const { data, error } = await supabase.rpc('fn_agendamento_cortesia', {
        p_agendamento_id: agendamentoId,
        p_cortesia: cortesia,
        p_motivo: cortesia ? motivo.trim() : null,
      });
      if (error) throw error;
      setCodigo(
        (data as { status_pagamento?: string })?.status_pagamento ?? ''
      );
      setAberto(false);
      setMotivo('');
      toast({
        title: cortesia ? 'Sessão marcada como cortesia' : 'Cortesia desfeita',
        description: cortesia
          ? 'Ela não entra mais na cobrança.' +
            (userRole === 'secretaria' ? ' O grupo da agenda foi avisado.' : '')
          : 'A sessão voltou para a cobrança.',
      });
      onChanged?.();
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : String((e as { message?: string })?.message ?? e);
      toast({
        title: 'Não foi possível salvar',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  if (ehCortesia) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
        <Gift className="h-4 w-4 text-azul-respira" aria-hidden />
        <span className="flex-1">Cortesia: esta sessão não será cobrada.</span>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5"
          disabled={salvando}
          onClick={() => void enviar(false)}
        >
          {salvando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Undo2 className="h-4 w-4" />
          )}
          Desfazer
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => setAberto(true)}
      >
        <Gift className="h-4 w-4" />
        Marcar como cortesia
      </Button>
      <Dialog open={aberto} onOpenChange={(v) => !salvando && setAberto(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como cortesia</DialogTitle>
            <DialogDescription>
              A sessão continua na agenda, mas não entra na cobrança.
              {userRole === 'secretaria' &&
                ' O grupo da agenda recebe um aviso com o motivo.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cortesia-motivo">Motivo</Label>
            <Textarea
              id="cortesia-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: encaixe de urgência sem custo combinado pela Bruna"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={salvando}
              onClick={() => setAberto(false)}
            >
              Voltar
            </Button>
            <Button
              className="gap-1.5"
              disabled={salvando || !motivo.trim()}
              onClick={() => void enviar(true)}
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Marcar cortesia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
