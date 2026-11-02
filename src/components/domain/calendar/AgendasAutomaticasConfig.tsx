// AI dev note: Configuração das agendas públicas automáticas (admin +
// secretaria). Para cada profissional marcada o banco mantém N semanas de
// agenda pública abertas (padrão 4): todo dia às 6h a semana que passou
// expira e a que falta é criada, com os dias/horas que ela costuma abrir.
// Hoje: Bruna, Flávia e Beatriz (decisão do dono, 02/11/2026).

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarSync, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Checkbox } from '@/components/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { useToast } from '@/components/primitives/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { fetchProfissionaisForUser } from '@/lib/calendar-services';
import {
  garantirAgendasPublicas,
  listarAgendaAuto,
  salvarAgendaAuto,
  type AgendaAutoConfig,
} from '@/lib/agenda-publica-auto-api';

interface AgendasAutomaticasConfigProps {
  onChanged?: () => void;
  className?: string;
}

export const AgendasAutomaticasConfig: React.FC<
  AgendasAutomaticasConfigProps
> = ({ onChanged, className }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const role = user?.pessoa?.role as
    | 'admin'
    | 'profissional'
    | 'secretaria'
    | undefined;
  const podeEditar = role === 'admin' || role === 'secretaria';

  const [aberto, setAberto] = useState(false);
  const [config, setConfig] = useState<AgendaAutoConfig[]>([]);
  const [profs, setProfs] = useState<{ id: string; nome: string }[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setConfig(await listarAgendaAuto());
    } catch {
      setConfig([]);
    }
  }, []);

  useEffect(() => {
    if (podeEditar) carregar();
  }, [carregar, podeEditar]);

  useEffect(() => {
    if (!aberto || profs.length || !user?.pessoa?.id || !role) return;
    fetchProfissionaisForUser(user.pessoa.id, role)
      .then((lista) =>
        setProfs(
          lista
            .filter((p) => p.ativo !== false)
            .map((p) => ({ id: p.id, nome: p.nome }))
        )
      )
      .catch(() => setProfs([]));
  }, [aberto, profs.length, user?.pessoa?.id, role]);

  if (!podeEditar) return null;

  const ativos = config.filter((c) => c.ativo);
  const nomeDe = (id: string) =>
    profs.find((p) => p.id === id)?.nome.split(' ')[0];
  const semanasDe = (id: string) =>
    config.find((c) => c.profissional_id === id)?.semanas ?? 4;
  const ativoDe = (id: string) =>
    !!config.find((c) => c.profissional_id === id)?.ativo;

  const salvar = async (id: string, ativo: boolean, semanas: number) => {
    setSalvando(id);
    try {
      await salvarAgendaAuto(id, ativo, semanas);
      await carregar();
    } catch (e) {
      toast({
        title: 'Não foi possível salvar',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSalvando(null);
    }
  };

  const criarAgora = async () => {
    setCriando(true);
    try {
      const r = await garantirAgendasPublicas();
      toast({
        title: r.criadas.length
          ? `${r.criadas.length} agenda${r.criadas.length === 1 ? '' : 's'} criada${r.criadas.length === 1 ? '' : 's'}`
          : 'Nenhuma agenda faltando',
        description:
          [
            r.criadas.map((c) => `${c.titulo} (${c.slots})`).join(' · '),
            r.puladas.length
              ? `Sem agenda: ${r.puladas
                  .map(
                    (p) =>
                      `${p.profissional.split(' ')[0]} ${p.semana.slice(8, 10)}/${p.semana.slice(5, 7)} (${p.motivo})`
                  )
                  .join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
      });
      onChanged?.();
    } catch (e) {
      toast({
        title: 'Não foi possível criar as agendas',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setCriando(false);
    }
  };

  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <CalendarSync className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Agendas automáticas</p>
          <p className="truncate text-xs text-muted-foreground">
            {ativos.length
              ? `${ativos.length} profissiona${ativos.length === 1 ? 'l' : 'is'} com agenda aberta para as próximas semanas, renovada todo dia às 6h`
              : 'Nenhuma profissional com agenda automática'}
          </p>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            aberto && 'rotate-180'
          )}
        />
      </button>

      {aberto && (
        <div className="space-y-3 border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Para cada profissional marcada fica sempre aberta a agenda pública
            das próximas semanas. A semana que passou expira e a nova é criada
            sozinha, com os dias e horários que ela costuma abrir. Semana que já
            tem agenda (ou que foi desativada à mão) não ganha outra.
          </p>
          <ul className="divide-y rounded-md border">
            {profs.length === 0 && (
              <li className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando
                profissionais…
              </li>
            )}
            {profs.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 px-3 py-2"
              >
                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={ativoDe(p.id)}
                    disabled={salvando === p.id}
                    onCheckedChange={(c) => salvar(p.id, !!c, semanasDe(p.id))}
                  />
                  {p.nome}
                </label>
                {ativoDe(p.id) && (
                  <Select
                    value={String(semanasDe(p.id))}
                    onValueChange={(v) => salvar(p.id, true, Number(v))}
                  >
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 3, 4, 5, 6, 8].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} semanas
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {salvando === p.id && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {ativos.length > 0 &&
                `Marcadas: ${ativos
                  .map((c) => nomeDe(c.profissional_id) ?? '…')
                  .join(', ')}`}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={criarAgora}
              disabled={criando || ativos.length === 0}
            >
              {criando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar as semanas que faltam agora
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

AgendasAutomaticasConfig.displayName = 'AgendasAutomaticasConfig';
