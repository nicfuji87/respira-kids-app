// AI dev note: Agenda pública da semana em um clique. Para cada profissional
// com fixos esperando, o banco devolve os horários livres pela grade da
// Agenda Expressa (histórico de 120 dias) e copia serviço, sala e empresa da
// última agenda pública dela. Vêm marcados os livres de segunda a sexta nos
// dias em que ela costuma atender; quem cria desmarca o que não quer abrir.
// A agenda criada é a mesma de sempre (agendas_compartilhadas).

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Checkbox } from '@/components/primitives/checkbox';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  buscarHorariosLivresSemana,
  criarAgendaDaSemana,
  diaMes,
  diaSemanaCurto,
  rotuloSemana,
  type AgendaPublicaSemana,
  type HorariosLivresSemana,
} from '@/lib/pacientes-fixos-api';

export interface ProfissionalPendente {
  id: string;
  nome: string;
  pacientes: number; // fixos que ainda faltam marcar
  sessoes: number;
}

interface CriarAgendasSemanaDialogProps {
  open: boolean;
  semana: string;
  profissionais: ProfissionalPendente[];
  agendas: AgendaPublicaSemana[];
  onClose: () => void;
  onCreated: () => void;
}

interface EstadoProf {
  incluir: boolean;
  carregando: boolean;
  erro: string | null;
  dados: HorariosLivresSemana | null;
  selecionados: Set<string>; // 'YYYY-MM-DD HH:mm'
}

const chave = (data: string, hora: string) => `${data} ${hora}`;

const selecaoPadrao = (d: HorariosLivresSemana) => {
  const s = new Set<string>();
  for (const dia of d.dias) {
    const dow = new Date(`${dia.data}T12:00:00`).getDay();
    if (!dia.historico || dia.feriado || dow === 0 || dow === 6) continue;
    for (const h of dia.horarios) if (h.livre) s.add(chave(dia.data, h.hora));
  }
  return s;
};

export const CriarAgendasSemanaDialog: React.FC<
  CriarAgendasSemanaDialogProps
> = ({ open, semana, profissionais, agendas, onClose, onCreated }) => {
  const { toast } = useToast();
  const [estado, setEstado] = useState<Record<string, EstadoProf>>({});
  const [criando, setCriando] = useState(false);

  const agendaDe = useMemo(() => {
    const m = new Map<string, AgendaPublicaSemana>();
    for (const a of agendas)
      if (!m.has(a.profissional_id)) m.set(a.profissional_id, a);
    return m;
  }, [agendas]);

  // Ao abrir: quem ainda não tem agenda na semana entra marcado
  useEffect(() => {
    if (!open) return;
    const inicial: Record<string, EstadoProf> = {};
    for (const p of profissionais) {
      inicial[p.id] = {
        incluir: !agendaDe.has(p.id),
        carregando: !agendaDe.has(p.id),
        erro: null,
        dados: null,
        selecionados: new Set(),
      };
    }
    setEstado(inicial);
    let cancelado = false;
    for (const p of profissionais) {
      if (agendaDe.has(p.id)) continue;
      buscarHorariosLivresSemana(p.id, semana)
        .then((d) => {
          if (cancelado) return;
          setEstado((prev) => ({
            ...prev,
            [p.id]: {
              ...prev[p.id],
              carregando: false,
              dados: d,
              erro: d.ok ? null : 'Sem permissão',
              selecionados: d.ok ? selecaoPadrao(d) : new Set(),
            },
          }));
        })
        .catch((e) => {
          if (cancelado) return;
          setEstado((prev) => ({
            ...prev,
            [p.id]: {
              ...prev[p.id],
              carregando: false,
              erro: e instanceof Error ? e.message : 'Erro ao buscar horários',
            },
          }));
        });
    }
    return () => {
      cancelado = true;
    };
  }, [open, semana, profissionais, agendaDe]);

  const alternarHorario = (profId: string, k: string) =>
    setEstado((prev) => {
      const sel = new Set(prev[profId].selecionados);
      if (sel.has(k)) sel.delete(k);
      else sel.add(k);
      return { ...prev, [profId]: { ...prev[profId], selecionados: sel } };
    });

  const alternarDia = (profId: string, data: string) =>
    setEstado((prev) => {
      const e = prev[profId];
      const livres =
        e.dados?.dias
          .find((d) => d.data === data)
          ?.horarios.filter((h) => h.livre)
          .map((h) => chave(data, h.hora)) ?? [];
      const todos = livres.every((k) => e.selecionados.has(k));
      const sel = new Set(e.selecionados);
      for (const k of livres) {
        if (todos) sel.delete(k);
        else sel.add(k);
      }
      return { ...prev, [profId]: { ...e, selecionados: sel } };
    });

  const aCriar = profissionais.filter(
    (p) =>
      estado[p.id]?.incluir &&
      !agendaDe.has(p.id) &&
      (estado[p.id]?.selecionados.size ?? 0) > 0
  );

  const criar = async () => {
    setCriando(true);
    const criadas: string[] = [];
    const falhas: string[] = [];
    for (const p of aCriar) {
      try {
        const r = await criarAgendaDaSemana({
          profissionalId: p.id,
          semana,
          horarios: [...estado[p.id].selecionados].sort(),
        });
        criadas.push(`${r.titulo} (${r.slots} horários)`);
      } catch (e) {
        falhas.push(
          `${p.nome.split(' ')[0]}: ${e instanceof Error ? e.message : 'erro'}`
        );
      }
    }
    setCriando(false);
    if (criadas.length)
      toast({
        title:
          criadas.length === 1
            ? 'Agenda criada'
            : `${criadas.length} agendas criadas`,
        description: criadas.join(' · '),
      });
    if (falhas.length)
      toast({
        title: 'Algumas agendas não foram criadas',
        description: falhas.join(' · '),
        variant: 'destructive',
      });
    if (criadas.length) onCreated();
    if (!falhas.length) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !criando && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agendas da semana de {rotuloSemana(semana)}</DialogTitle>
          <DialogDescription>
            Horários livres de cada profissional. Desmarque os que não quer
            abrir no link.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 flex-1 space-y-4 overflow-y-auto px-6">
          {profissionais.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum paciente fixo esperando nesta semana.
            </p>
          )}
          {profissionais.map((p) => {
            const e = estado[p.id];
            const existente = agendaDe.get(p.id);
            return (
              <div key={p.id} className="rounded-lg border p-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={`prof-${p.id}`}
                    checked={!!e?.incluir && !existente}
                    disabled={!!existente}
                    onCheckedChange={(c) =>
                      setEstado((prev) => ({
                        ...prev,
                        [p.id]: { ...prev[p.id], incluir: !!c },
                      }))
                    }
                    className="mt-0.5"
                  />
                  <label
                    htmlFor={`prof-${p.id}`}
                    className="flex-1 cursor-pointer"
                  >
                    <span className="font-medium">{p.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.pacientes} paciente{p.pacientes === 1 ? '' : 's'}{' '}
                      esperando ({p.sessoes} sess
                      {p.sessoes === 1 ? 'ão' : 'ões'})
                      {e && e.selecionados.size > 0 && !existente
                        ? ` · ${e.selecionados.size} horários marcados`
                        : ''}
                    </span>
                  </label>
                </div>

                {existente ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Já existe: {existente.titulo} ({existente.livres} horários
                    livres).
                  </p>
                ) : e?.incluir ? (
                  e.carregando ? (
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Buscando
                      horários livres…
                    </div>
                  ) : e.erro ? (
                    <p className="mt-2 text-sm text-destructive">{e.erro}</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {e.dados?.padrao.servicos[0] && (
                        <p className="text-xs text-muted-foreground">
                          {e.dados.padrao.servicos
                            .map((s) => s.nome)
                            .join(', ')}
                          {e.dados.padrao.locais.length
                            ? ` · ${e.dados.padrao.locais.map((l) => l.nome).join(', ')}`
                            : ''}
                          {e.dados.padrao.empresas.length
                            ? ` · ${e.dados.padrao.empresas.map((x) => x.nome).join(', ')}`
                            : ''}
                        </p>
                      )}
                      {e.dados?.dias.map((dia) => (
                        <div
                          key={dia.data}
                          className="flex flex-col gap-1.5 sm:flex-row sm:items-start"
                        >
                          <button
                            type="button"
                            onClick={() => alternarDia(p.id, dia.data)}
                            className="w-24 shrink-0 text-left text-xs font-medium hover:text-primary"
                            title="Marcar ou desmarcar o dia"
                          >
                            {diaSemanaCurto(dia.data)} {diaMes(dia.data)}
                            {dia.feriado && (
                              <span className="block font-normal text-amber-700 dark:text-amber-300">
                                {dia.feriado}
                              </span>
                            )}
                          </button>
                          <div className="flex flex-wrap gap-1">
                            {dia.horarios.map((h) => {
                              const k = chave(dia.data, h.hora);
                              const marcado = e.selecionados.has(k);
                              return (
                                <button
                                  key={h.hora}
                                  type="button"
                                  disabled={!h.livre}
                                  onClick={() => alternarHorario(p.id, k)}
                                  className={cn(
                                    'h-8 min-w-[3.25rem] rounded-md border px-2 text-xs tabular-nums transition-colors',
                                    !h.livre &&
                                      'cursor-not-allowed border-dashed text-muted-foreground/50 line-through',
                                    h.livre &&
                                      marcado &&
                                      'border-primary bg-primary text-primary-foreground',
                                    h.livre &&
                                      !marcado &&
                                      'bg-background hover:border-primary'
                                  )}
                                >
                                  {h.hora}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={criando}>
            Cancelar
          </Button>
          <Button onClick={criar} disabled={aCriar.length === 0 || criando}>
            {criando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarCheck className="mr-2 h-4 w-4" />
            )}
            {aCriar.length > 1
              ? `Criar ${aCriar.length} agendas`
              : 'Criar agenda'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
