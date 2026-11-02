// AI dev note: Paciente fixo na ficha (fisioterapia motora). Admin/secretaria
// editam; profissional só vê. A evolução motora finalizada também muda isto
// (gatilho no banco): a frequência da conduta vira a do cadastro e "Manter
// fisioterapia = não" tira dos fixos. O histórico mostra de onde veio cada mudança.

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, History, Loader2, Repeat } from 'lucide-react';
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
import { useAuth } from '@/hooks/useAuth';
import { fetchProfissionaisForUser } from '@/lib/calendar-services';
import { cn } from '@/lib/utils';
import { FrequenciaEditor } from '@/components/domain/pacientes-fixos/FrequenciaEditor';
import {
  buscarPacienteFixo,
  frequenciaValida,
  type FrequenciaValor,
  dataCarimbo,
  diaMes,
  encerrarPacienteFixo,
  rotuloFrequencia,
  salvarPacienteFixo,
  type AlternanciaHistorico,
  type PacienteFixo,
  type ProfissionalRef,
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
      return `Virou fixo (${rotuloFrequencia(h.frequencia, h.intervalo_dias)})`;
    case 'frequencia':
      return `Frequência: ${rotuloFrequencia(h.frequencia_antes, h.intervalo_dias_antes)} → ${rotuloFrequencia(h.frequencia, h.intervalo_dias)}`;
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
      return `Voltou a ser fixo (${rotuloFrequencia(h.frequencia, h.intervalo_dias)})`;
    default:
      return 'Dados alterados';
  }
};

// O que o histórico mostra: quem atendeu nas últimas sessões e se divide
const AlternanciaTexto: React.FC<{ alt: AlternanciaHistorico | null }> = ({
  alt,
}) => {
  if (!alt || alt.profissionais.length === 0) return null;
  const partes = alt.profissionais
    .map((p) => `${p.nome.split(' ')[0]} ${p.sessoes}`)
    .join(', ');
  return (
    <p
      className={cn(
        'flex items-start gap-1.5 text-xs',
        alt.divide ? 'text-sky-800 dark:text-sky-300' : 'text-muted-foreground'
      )}
    >
      <ArrowLeftRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {alt.divide
        ? `O histórico mostra atendimento dividido: ${partes} nas últimas ${alt.total} sessões.`
        : `Nas últimas ${alt.total} sessões: ${partes}.`}
    </p>
  );
};

export const PatientFixoSection: React.FC<PatientFixoSectionProps> = ({
  patientId,
  userRole,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const podeEditar = userRole === 'admin' || userRole === 'secretaria';

  const [fixo, setFixo] = useState<PacienteFixo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);

  const [freq, setFreq] = useState<FrequenciaValor>({
    frequencia: null,
    intervaloDias: null,
  });
  // Profissionais escolhidas (2+ = atendimento dividido); [] = vale o histórico
  const [profissionais, setProfissionais] = useState<string[]>([]);
  const [opcoesProf, setOpcoesProf] = useState<ProfissionalRef[]>([]);
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

  // Lista de profissionais só quando abre a edição
  useEffect(() => {
    if (!editando || opcoesProf.length || !user?.pessoa?.id || !userRole)
      return;
    fetchProfissionaisForUser(user.pessoa.id, userRole)
      .then((lista) =>
        setOpcoesProf(
          lista
            .filter((p) => p.ativo !== false)
            .map((p) => ({ id: p.id, nome: p.nome }))
        )
      )
      .catch(() => setOpcoesProf([]));
  }, [editando, opcoesProf.length, user?.pessoa?.id, userRole]);

  const alternarProf = (id: string) =>
    setProfissionais((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
    );

  const abrirEdicao = () => {
    setFreq({
      frequencia: fixo?.frequencia ?? null,
      intervaloDias: fixo?.intervalo_dias ?? null,
    });
    setProfissionais((fixo?.profissionais ?? []).map((p) => p.id));
    setObservacao(fixo?.observacao ?? '');
    setEditando(true);
  };

  const salvar = async () => {
    if (!freq.frequencia || !frequenciaValida(freq)) return;
    setSalvando(true);
    try {
      setFixo(
        await salvarPacienteFixo({
          pacienteId: patientId,
          frequencia: freq.frequencia,
          intervaloDias: freq.intervaloDias,
          profissionais,
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
              {rotuloFrequencia(fixo!.frequencia, fixo!.intervalo_dias)}
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
              <FrequenciaEditor valor={freq} onChange={setFreq} />
            </div>

            <div className="space-y-2">
              <Label>Profissionais (opcional)</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  ...opcoesProf,
                  // escolhida que não está na lista desta pessoa
                  ...(fixo?.profissionais ?? []).filter(
                    (p) => !opcoesProf.some((o) => o.id === p.id)
                  ),
                ].map((p) => (
                  <Button
                    key={p.id}
                    type="button"
                    size="sm"
                    variant={
                      profissionais.includes(p.id) ? 'default' : 'outline'
                    }
                    onClick={() => alternarProf(p.id)}
                  >
                    {p.nome.split(' ')[0]}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Marque duas ou mais quando o atendimento é dividido. Sem nenhuma
                marcada, vale o histórico.
              </p>
              <AlternanciaTexto alt={fixo?.historico_profissionais ?? null} />
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
              <Button
                onClick={salvar}
                disabled={!frequenciaValida(freq) || salvando}
              >
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
                <span className="text-muted-foreground">
                  {fixo!.profissionais.length > 1
                    ? 'Dividido entre: '
                    : 'Profissional: '}
                </span>
                {fixo!.profissionais.length
                  ? fixo!.profissionais
                      .map((p) => p.nome.split(' ')[0])
                      .join(' e ')
                  : 'pelo histórico'}
              </div>
              {fixo!.observacao && (
                <div>
                  <span className="text-muted-foreground">Observação: </span>
                  {fixo!.observacao}
                </div>
              )}
            </div>
            <AlternanciaTexto alt={fixo!.historico_profissionais} />
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
            <AlternanciaTexto alt={fixo?.historico_profissionais ?? null} />
            {podeEditar && (
              <Button size="sm" onClick={abrirEdicao}>
                {fixo?.id ? 'Voltar a ser fixo' : 'Tornar paciente fixo'}
              </Button>
            )}
          </div>
        )}

        {fixo && (fixo.historico ?? []).length > 0 && !editando && (
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
