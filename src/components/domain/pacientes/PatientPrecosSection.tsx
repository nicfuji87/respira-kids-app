// AI dev note: Preço especial do paciente (acordo: parceria, desconto
// combinado, social). Vence o preço da profissional e o padrão do serviço na
// hora de agendar — mas é só o valor sugerido: quem agenda ainda pode mudar
// o valor de cada agendamento. Admin/secretaria definem; trocar um preço
// desativa o anterior (fica de histórico em paciente_precos).

import React, { useCallback, useEffect, useState } from 'react';
import { BadgePercent, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Skeleton } from '@/components/primitives/skeleton';
import { useToast } from '@/components/primitives/use-toast';
import { ServiceTypeSelect } from '@/components/composed';
import { useAuth } from '@/hooks/useAuth';
import {
  listarPrecosPaciente,
  removerPrecoPaciente,
  salvarPrecoPaciente,
  type PrecoPacienteLinha,
} from '@/lib/preco-servico';

interface PatientPrecosSectionProps {
  patientId: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

const formatBRL = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    valor
  );

const MOTIVOS_RAPIDOS = ['Parceria', 'Desconto combinado', 'Social'];

export const PatientPrecosSection: React.FC<PatientPrecosSectionProps> = ({
  patientId,
  userRole,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const podeEditar = userRole === 'admin' || userRole === 'secretaria';

  const [precos, setPrecos] = useState<PrecoPacienteLinha[]>([]);
  const [loading, setLoading] = useState(true);
  const [adicionando, setAdicionando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const [servicoId, setServicoId] = useState('');
  const [valorPadrao, setValorPadrao] = useState<number | null>(null);
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setPrecos(await listarPrecosPaciente(patientId));
    } catch {
      setPrecos([]);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const limparForm = () => {
    setServicoId('');
    setValorPadrao(null);
    setValor('');
    setMotivo('');
    setAdicionando(false);
  };

  const handleSalvar = async () => {
    const numero = Number(valor.replace(',', '.'));
    if (!servicoId) {
      toast({ title: 'Escolha o serviço', variant: 'destructive' });
      return;
    }
    if (valor.trim() === '' || isNaN(numero) || numero < 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' });
      return;
    }
    if (!motivo.trim()) {
      toast({
        title: 'Informe o motivo',
        description: 'Ex.: parceria, desconto combinado.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      await salvarPrecoPaciente({
        pacienteId: patientId,
        tipoServicoId: servicoId,
        valor: numero,
        motivo,
        pessoaId: user?.pessoa?.id,
      });
      toast({
        title: 'Preço especial salvo',
        description: 'Vale para os próximos agendamentos deste paciente.',
      });
      limparForm();
      carregar();
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o preço especial',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemover = async (linha: PrecoPacienteLinha) => {
    setRemovendoId(linha.id);
    try {
      await removerPrecoPaciente(linha.id, user?.pessoa?.id);
      toast({
        title: 'Preço especial removido',
        description: `${linha.servicoNome} volta ao preço de tabela.`,
      });
      carregar();
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível remover o preço especial',
        variant: 'destructive',
      });
    } finally {
      setRemovendoId(null);
    }
  };

  // Profissional só vê quando existe acordo (é útil saber ao agendar)
  if (!podeEditar && (loading || precos.length === 0)) return null;

  const servicoJaTemPreco = precos.some((p) => p.tipoServicoId === servicoId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgePercent className="h-4 w-4 text-muted-foreground" />
            Preço especial
          </CardTitle>
          <CardDescription>
            Usado no lugar do preço de tabela ao agendar. O valor de cada
            agendamento ainda pode ser alterado na hora.
          </CardDescription>
        </div>
        {podeEditar && !adicionando && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1"
            onClick={() => setAdicionando(true)}
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : precos.length === 0 && !adicionando ? (
          <p className="text-sm text-muted-foreground">
            Sem preço especial: este paciente paga o preço de tabela.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {precos.map((linha) => (
              <li
                key={linha.id}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{linha.servicoNome}</p>
                  <p className="text-sm">
                    <span className="font-semibold">
                      {formatBRL(linha.valor)}
                    </span>
                    {linha.servicoValorPadrao !== linha.valor && (
                      <span className="ml-2 text-xs text-muted-foreground line-through">
                        {formatBRL(linha.servicoValorPadrao)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {linha.motivo}
                    {' · '}
                    {linha.criadoPorNome ? `${linha.criadoPorNome}, ` : ''}
                    {new Date(linha.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                {podeEditar && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemover(linha)}
                    disabled={removendoId === linha.id}
                    title="Remover preço especial"
                  >
                    {removendoId === linha.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {podeEditar && adicionando && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="space-y-1.5">
              <Label>Serviço</Label>
              <ServiceTypeSelect
                value={servicoId}
                onValueChange={(id, dados) => {
                  setServicoId(id);
                  setValorPadrao(dados ? Number(dados.valor) : null);
                }}
              />
              {servicoJaTemPreco && (
                <p className="text-xs text-muted-foreground">
                  Este serviço já tem preço especial; salvar substitui o atual.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preco-especial-valor">Valor (R$)</Label>
              <Input
                id="preco-especial-valor"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={
                  valorPadrao !== null
                    ? `Tabela: ${formatBRL(valorPadrao)}`
                    : '0,00'
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preco-especial-motivo">Motivo</Label>
              <Input
                id="preco-especial-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: parceria com a escola X"
              />
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS_RAPIDOS.map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setMotivo(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={limparForm}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSalvar} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
