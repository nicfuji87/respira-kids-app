import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Banknote, Loader2 } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Alert, AlertDescription } from '@/components/primitives/alert';
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
import { generateChargeDescription } from '@/lib/charge-description';
import type { ConsultationData } from '@/lib/charge-description';
import { registrarRecebidoEmDinheiro } from '@/lib/payment-links-api';

// AI dev note (07/11/2026): "Recebido em dinheiro" para família que paga em espécie.
// Gera a cobrança no Asaas e já dá como recebida, sem nota fiscal (decisão do dono)
// e sem mandar nada para a família. Uma família e uma empresa por vez: é o mesmo
// agrupamento da cobrança normal (a conta do Asaas é por empresa).

export interface ConsultaParaDinheiro {
  id: string;
  data_hora: string;
  servico_nome: string;
  valor_servico: number;
  profissional_id: string;
  profissional_nome: string;
  paciente_id: string;
  paciente_nome: string;
  tipo_servico_id?: string;
  empresa_fatura_id?: string;
  empresa_fatura_razao_social?: string;
}

export interface RecebidoEmDinheiroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultas: ConsultaParaDinheiro[];
  userId: string;
  onConcluido: () => void;
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const RecebidoEmDinheiroDialog: React.FC<
  RecebidoEmDinheiroDialogProps
> = ({ open, onOpenChange, consultas, userId, onConcluido }) => {
  const { toast } = useToast();
  const hoje = format(new Date(), 'yyyy-MM-dd');
  const [data, setData] = useState(hoje);
  const [salvando, setSalvando] = useState(false);

  const resumo = useMemo(() => {
    const pacientes = new Set(consultas.map((c) => c.paciente_id));
    const empresas = new Set(consultas.map((c) => c.empresa_fatura_id || ''));
    const total = consultas.reduce((s, c) => s + (c.valor_servico || 0), 0);
    let erro: string | null = null;
    if (consultas.length === 0) erro = 'Selecione as consultas pagas.';
    else if (pacientes.size > 1)
      erro =
        'Selecione consultas de um paciente só (o recebimento é registrado por família).';
    else if (empresas.has(''))
      erro = 'Há consulta sem empresa de faturamento. Edite a consulta antes.';
    else if (empresas.size > 1)
      erro =
        'As consultas são de empresas diferentes. Registre uma empresa por vez.';
    else if (total <= 0) erro = 'O valor total precisa ser maior que zero.';
    return {
      total,
      erro,
      paciente: consultas[0]?.paciente_nome ?? '',
      empresa: consultas[0]?.empresa_fatura_razao_social ?? '',
    };
  }, [consultas]);

  const confirmar = async () => {
    if (resumo.erro || data > hoje) return;
    setSalvando(true);
    try {
      const pacienteId = consultas[0].paciente_id;
      const { data: paciente, error } = await supabase
        .from('pessoas')
        .select('id, nome, cpf_cnpj, responsavel_cobranca_id')
        .eq('id', pacienteId)
        .single();
      if (error || !paciente) throw new Error('Paciente não encontrado');
      const responsavelId = paciente.responsavel_cobranca_id || pacienteId;
      const { data: responsavel } = await supabase
        .from('pessoas')
        .select('nome, cpf_cnpj')
        .eq('id', responsavelId)
        .single();
      if (!responsavel?.cpf_cnpj) {
        throw new Error(
          `Responsável de cobrança (${responsavel?.nome ?? 'sem cadastro'}) sem CPF cadastrado`
        );
      }

      const consultationData: ConsultationData[] = consultas.map((c) => ({
        id: c.id,
        data_hora: c.data_hora,
        servico_nome: c.servico_nome,
        valor_servico: c.valor_servico,
        profissional_nome: c.profissional_nome,
        profissional_id: c.profissional_id,
        tipo_servico_id: c.tipo_servico_id,
      }));
      const descricao = await generateChargeDescription(consultationData, {
        nome: paciente.nome,
        cpf_cnpj: paciente.cpf_cnpj || '',
      });

      const r = await registrarRecebidoEmDinheiro(
        {
          agendamentoIds: consultas.map((c) => c.id),
          pacienteId,
          responsavelId,
          empresaId: consultas[0].empresa_fatura_id as string,
          valorBase: resumo.total,
          descricao,
          dataPagamento: data,
        },
        userId
      );
      if (!r.success) throw new Error(r.error);

      toast({
        title: 'Recebido em dinheiro registrado',
        description: `${brl(resumo.total)} de ${resumo.paciente}: cobrança criada e baixada no Asaas, sem nota fiscal.`,
      });
      onOpenChange(false);
      onConcluido();
    } catch (e) {
      toast({
        title: 'Não foi possível registrar',
        description: e instanceof Error ? e.message : 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !salvando && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Recebido em dinheiro
          </DialogTitle>
          <DialogDescription>
            Cria a cobrança no Asaas e já dá como recebida em dinheiro. Não
            emite nota fiscal e não manda nada para a família.
          </DialogDescription>
        </DialogHeader>

        {resumo.erro ? (
          <Alert variant="destructive">
            <AlertDescription>{resumo.erro}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <p>
                <span className="text-muted-foreground">Paciente:</span>{' '}
                {resumo.paciente}
              </p>
              {resumo.empresa && (
                <p>
                  <span className="text-muted-foreground">Empresa:</span>{' '}
                  {resumo.empresa}
                </p>
              )}
              <p>
                <span className="text-muted-foreground">Consultas:</span>{' '}
                {consultas.length} · <strong>{brl(resumo.total)}</strong>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data-recebido">Data do recebimento</Label>
              <Input
                id="data-recebido"
                type="date"
                value={data}
                max={hoje}
                onChange={(e) => setData(e.target.value)}
              />
              {data > hoje && (
                <p className="text-xs text-destructive">
                  A data não pode ser no futuro.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={salvando || !!resumo.erro || !data || data > hoje}
          >
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
