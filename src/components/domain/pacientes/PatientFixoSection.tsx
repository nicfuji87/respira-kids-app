// AI dev note: Paciente fixo na ficha (fisioterapia motora). Admin/secretaria
// editam; profissional só vê. A evolução motora finalizada também muda isto
// (gatilho no banco): a frequência da conduta vira a do cadastro e "Manter
// fisioterapia = não" tira dos fixos. O histórico mostra de onde veio cada mudança.

import React, { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Repeat } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Skeleton } from '@/components/primitives/skeleton';
import { useToast } from '@/components/primitives/use-toast';
import { ProfessionalSelect } from '@/components/composed';
import { cn } from '@/lib/utils';
import {
  FREQUENCIAS_FIXO,
  buscarPacienteFixo,
  dataCarimbo,
  diaMes,
  encerrarPacienteFixo,
  rotuloFrequencia,
  salvarPacienteFixo,
  type FrequenciaFixo,
  type PacienteFixo,
  type PacienteFixoHistorico,
} from '@/lib/pacientes-fixos-api';

interface PatientFixoSectionProps {
  patientId: string;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
}

const ORIGEM: Record<string, string> = {
  cadastro: 'pelo cadastro',
  evolucao: 'pela evolução',
  lista: 'pela lista de fixos',
};

const descreverHistorico = (h: PacienteFixoHistorico): string => {
  switch (h.acao) {
    case 'criado':
      return `Virou fixo (${rotuloFrequencia(h.frequencia)})`;
    case 'frequencia':
      return `Frequência: ${rotuloFrequencia(h.frequencia_antes)} → ${rotuloFrequencia(h.frequencia)}`;
    case 'adiado':
      return h.adiado_ate
        ? `Adiado para a semana de ${diaMes(h.adiado_ate)}`
        : 'Adiado';
    case 'adiamento_removido':
      return 'Adiamento retirado';
    case 'encerrado':
      return h.origem === 'evolucao'
        ? 'Saiu dos fixos (alta na evolução)'
        : 'Saiu dos fixos';
    case 'reativado':
      return `Voltou a ser fixo (${rotuloFrequencia(h.frequencia)})`;
    default:
      return 'Dados alterados';
  }
};

export const PatientFixoSection: React.FC<PatientFixoSectionProps> = ({
  patientId,
  userRole,
}) => {
  const { toast } = useToast();
  const podeEditar = userRole === 'admin' || userRole === 'secretaria';

  const [fixo, setFixo] = useState<PacienteFixo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);

  const [frequencia, setFrequencia] = useState<FrequenciaFixo | null>(null);
  const [profissionalId, setProfissionalId] = useState<string>('');
  const [observacao, setObservacao] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setFixo(await buscarPacienteFixo(patientId));
    } catch {
      setFixo(null);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrirEdicao = () => {
    setFrequencia(fixo?.ativo ? fixo.frequencia : (fixo?.frequencia ?? null));
    setProfissionalId(fixo?.profissional_id ?? '');
    setObservacao(fixo?.observacao ?? '');
    setEditando(true);
  };

  const salvar = async () => {
    if (!frequencia) return;
    setSalvando(true);
    try {
      setFixo(
        await salvarPacienteFixo({
          pacienteId: patientId,
          frequencia,
          profissionalId: profissionalId || null,
          observacao,
        })
      );
      setEditando(false);
      toast({ title: 'Paciente fixo salvo' });
    } catch (e) {
      toast({
        title: 'Não foi possível salvar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  const encerrar = async () => {
    setSalvando(true);
    try {
      setFixo(await encerrarPacienteFixo(patientId));
      toast({ title: 'Saiu dos pacientes fixos' });
    } catch (e) {
      toast({
        title: 'Não foi possível alterar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Profissional sem fixo cadastrado: nada a mostrar
  if (!podeEditar && !fixo?.ativo) return null;

  const ativo = !!fixo?.ativo;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Repeat className="h-4 w-4 text-primary" />
          Paciente fixo
          {ativo && (
            <Badge variant="secondary" className="ml-1">
              {rotuloFrequencia(fixo!.frequencia)}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Fisioterapia motora com frequência combinada. Aparece na lista de
          Pacientes Fixos para marcar a semana.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {editando ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Frequência</Label>
              <div className="flex flex-wrap gap-2">
                {FREQUENCIAS_FIXO.map((f) => (
                  <Button
                    key={f.valor}
                    type="button"
                    size="sm"
                    variant={frequencia === f.valor ? 'default' : 'outline'}
                    onClick={() => setFrequencia(f.valor)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Profissional (opcional)</Label>
              <div className="flex gap-2">
                <ProfessionalSelect
                  value={profissionalId || undefined}
                  onValueChange={setProfissionalId}
                  placeholder="A da última sessão"
                  className="flex-1"
                />
                {profissionalId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setProfissionalId('')}
                  >
                    Limpar
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Sem profissional escolhida, vale a da última sessão.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fixo-obs">Observação (opcional)</Label>
              <Input
                id="fixo-obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: prefere de manhã"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={salvar} disabled={!frequencia || salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditando(false)}
                disabled={salvando}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : ativo ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Profissional: </span>
                {fixo!.profissional_nome ?? 'a da última sessão'}
              </div>
              {fixo!.observacao && (
                <div>
                  <span className="text-muted-foreground">Observação: </span>
                  {fixo!.observacao}
                </div>
              )}
            </div>
            {fixo!.adiado_ate && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Adiado: volta na semana de {diaMes(fixo!.adiado_ate)}
                {fixo!.adiado_motivo ? ` (${fixo!.adiado_motivo})` : ''}.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Última alteração {ORIGEM[fixo!.ultima_origem] ?? ''}
              {fixo!.atualizado_por_nome
                ? ` por ${fixo!.atualizado_por_nome}`
                : ''}{' '}
              em {dataCarimbo(fixo!.updated_at)}.
            </p>
            {podeEditar && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={abrirEdicao}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={encerrar}
                  disabled={salvando}
                >
                  Tirar dos fixos
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {fixo?.encerrado_em
                ? `Saiu dos fixos em ${dataCarimbo(fixo.encerrado_em)}${
                    fixo.encerrado_motivo === 'alta'
                      ? ' (alta registrada na evolução)'
                      : ''
                  }.`
                : 'Não é paciente fixo.'}
            </p>
            {podeEditar && (
              <Button size="sm" onClick={abrirEdicao}>
                {fixo ? 'Voltar a ser fixo' : 'Tornar paciente fixo'}
              </Button>
            )}
          </div>
        )}

        {fixo && fixo.historico.length > 0 && !editando && (
          <div>
            <button
              type="button"
              onClick={() => setVerHistorico((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <History className="h-3.5 w-3.5" />
              {verHistorico ? 'Esconder histórico' : 'Ver histórico'}
            </button>
            {verHistorico && (
              <ul className="mt-2 space-y-1.5 border-l pl-3 text-xs">
                {fixo.historico.map((h, i) => (
                  <li key={i} className={cn(i > 0 && 'text-muted-foreground')}>
                    {descreverHistorico(h)}{' '}
                    <span className="text-muted-foreground">
                      · {ORIGEM[h.origem ?? ''] ?? ''}
                      {h.feito_por_nome ? `, ${h.feito_por_nome}` : ''},{' '}
                      {dataCarimbo(h.feito_em)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

PatientFixoSection.displayName = 'PatientFixoSection';
