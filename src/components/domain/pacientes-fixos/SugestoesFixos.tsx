// AI dev note: Pacientes motores com 3+ sessões em 90 dias que ainda não são
// fixos. A frequência sugerida vem da última evolução motora; sem ela, do
// ritmo das sessões. Nada vira fixo sozinho: a secretaria confirma (um a um
// ou todos de uma vez).

import React, { useState } from 'react';
import { ChevronDown, Loader2, Sparkles } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  FREQUENCIAS_FIXO,
  rotuloSessao,
  salvarPacienteFixo,
  type FrequenciaFixo,
  type SugestaoFixo,
} from '@/lib/pacientes-fixos-api';

interface SugestoesFixosProps {
  sugestoes: SugestaoFixo[];
  onChanged: () => void;
  onAbrirPaciente: (id: string) => void;
}

export const SugestoesFixos: React.FC<SugestoesFixosProps> = ({
  sugestoes,
  onChanged,
  onAbrirPaciente,
}) => {
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [escolha, setEscolha] = useState<Record<string, FrequenciaFixo>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  if (sugestoes.length === 0) return null;

  const freqDe = (s: SugestaoFixo) =>
    escolha[s.paciente_id] ?? s.frequencia_sugerida;

  const tornarFixos = async (lista: SugestaoFixo[], chave: string) => {
    setSalvando(chave);
    let ok = 0;
    const erros: string[] = [];
    for (const s of lista) {
      try {
        await salvarPacienteFixo({
          pacienteId: s.paciente_id,
          frequencia: freqDe(s),
          origem: 'lista',
        });
        ok++;
      } catch (e) {
        erros.push(
          `${s.paciente_nome}: ${e instanceof Error ? e.message : 'erro'}`
        );
      }
    }
    setSalvando(null);
    if (ok)
      toast({
        title:
          ok === 1
            ? 'Paciente agora é fixo'
            : `${ok} pacientes agora são fixos`,
      });
    if (erros.length)
      toast({
        title: 'Alguns não foram salvos',
        description: erros.join(' · '),
        variant: 'destructive',
      });
    onChanged();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Sugestões ({sugestoes.length})
            </CardTitle>
            <CardDescription className="mt-1">
              Pacientes motores com 3 ou mais sessões nos últimos 90 dias que
              ainda não são fixos.
            </CardDescription>
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
              aberto && 'rotate-180'
            )}
          />
        </button>
      </CardHeader>

      {aberto && (
        <CardContent className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={!!salvando}
              onClick={() => tornarFixos(sugestoes, 'todos')}
            >
              {salvando === 'todos' && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Tornar todos fixos
            </Button>
          </div>
          <ul className="divide-y rounded-md border">
            {sugestoes.map((s) => (
              <li
                key={s.paciente_id}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onAbrirPaciente(s.paciente_id)}
                    className="truncate font-medium hover:underline"
                  >
                    {s.paciente_nome}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {s.sessoes_90d} sessões em 90 dias · última{' '}
                    {rotuloSessao(s.ultima_sessao)}
                    {s.profissional_nome
                      ? ` · ${s.profissional_nome.split(' ')[0]}`
                      : ''}
                    {s.frequencia_evolucao ? ' · frequência da evolução' : ''}
                    {s.divide &&
                      ` · divide: ${(s.historico_profissionais ?? [])
                        .map((h) => `${h.nome.split(' ')[0]} ${h.sessoes}`)
                        .join(', ')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={freqDe(s)}
                    onValueChange={(v) =>
                      setEscolha((p) => ({
                        ...p,
                        [s.paciente_id]: v as FrequenciaFixo,
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIAS_FIXO.map((f) => (
                        <SelectItem key={f.valor} value={f.valor}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!!salvando}
                    onClick={() => tornarFixos([s], s.paciente_id)}
                  >
                    {salvando === s.paciente_id && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Tornar fixo
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
};
