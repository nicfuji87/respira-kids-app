// AI dev note: Tela Pacientes Fixos (admin + secretaria). Mostra, para a
// semana escolhida, quem falta marcar pela frequência do cadastro. Ações:
// - Enviar link: abre o WhatsApp com o link da agenda pública da profissional
//   da semana e registra o envio (pacientes_fixos_envios);
// - Marcar: Agenda Expressa a partir da última sessão (copia serviço/local/valor);
// - Adiar: tira da lista até uma semana (família viajando etc.).
// O cálculo é todo do banco (fn_pacientes_fixos_semana).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  Check,
  Copy,
  MessageCircle,
  RefreshCw,
  Repeat,
  Undo2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { useToast } from '@/components/primitives/use-toast';
import { AgendaExpressa } from '@/components/composed/AgendaExpressa';
import { PageHeader } from '@/components/composed/PageHeader';
import { cn } from '@/lib/utils';
import { buildWhatsAppUrl } from '@/lib/cobrancas-api';
import {
  adiarPacienteFixo,
  buscarSemanaFixos,
  buscarSugestoesFixos,
  dataHoraCarimbo,
  diaMes,
  linkAgendaPublica,
  mensagemLinkAgenda,
  rotuloFrequencia,
  rotuloSemana,
  rotuloSessao,
  segundaDaSemana,
  somarDias,
  registrarEnvioLink,
  type AgendaPublicaSemana,
  type PacienteFixoSemana,
  type SemanaFixos,
  type SituacaoFixo,
  type SugestaoFixo,
} from '@/lib/pacientes-fixos-api';
import { AdiarFixoDialog } from './AdiarFixoDialog';
import {
  CriarAgendasSemanaDialog,
  type ProfissionalPendente,
} from './CriarAgendasSemanaDialog';
import { SugestoesFixos } from './SugestoesFixos';

const FILTROS: { id: SituacaoFixo | 'todos'; label: string }[] = [
  { id: 'falta', label: 'Falta marcar' },
  { id: 'completo', label: 'Marcados' },
  { id: 'adiado', label: 'Adiados' },
  { id: 'fora_da_semana', label: 'Fora da vez' },
  { id: 'todos', label: 'Todos' },
];

const primeiroNome = (n?: string | null) => (n || '').split(' ')[0];

export const PacientesFixosManager: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const estaSemana = segundaDaSemana();
  const proximaSemana = somarDias(estaSemana, 7);
  // Seg a qua olha esta semana; de quinta em diante, a próxima (quando se
  // abre a agenda pública da semana seguinte)
  const [semana, setSemana] = useState(() =>
    new Date().getDay() >= 4 || new Date().getDay() === 0
      ? proximaSemana
      : estaSemana
  );
  const [dados, setDados] = useState<SemanaFixos | null>(null);
  const [sugestoes, setSugestoes] = useState<SugestaoFixo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<SituacaoFixo | 'todos'>('falta');
  const [profFiltro, setProfFiltro] = useState<string | null>(null);

  const [adiando, setAdiando] = useState<PacienteFixoSemana | null>(null);
  const [marcando, setMarcando] = useState<PacienteFixoSemana | null>(null);
  const [criarAgendas, setCriarAgendas] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [d, s] = await Promise.all([
        buscarSemanaFixos(semana),
        buscarSugestoesFixos(),
      ]);
      setDados(d);
      setSugestoes(s ?? []);
    } catch (e) {
      toast({
        title: 'Não foi possível carregar os pacientes fixos',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setCarregando(false);
    }
  }, [semana, toast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const pacientes = useMemo(() => dados?.pacientes ?? [], [dados]);
  const agendas = useMemo(() => dados?.agendas ?? [], [dados]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: pacientes.length };
    for (const p of pacientes) c[p.situacao] = (c[p.situacao] ?? 0) + 1;
    return c;
  }, [pacientes]);

  const sessoesFaltando = pacientes.reduce((t, p) => t + p.falta, 0);

  // Profissionais com fixos esperando (para o filtro e para criar agendas)
  const pendentesPorProf = useMemo<ProfissionalPendente[]>(() => {
    const m = new Map<string, ProfissionalPendente>();
    for (const p of pacientes) {
      if (p.situacao !== 'falta' || !p.profissional_id) continue;
      const atual = m.get(p.profissional_id) ?? {
        id: p.profissional_id,
        nome: p.profissional_nome ?? 'Sem nome',
        pacientes: 0,
        sessoes: 0,
      };
      atual.pacientes += 1;
      atual.sessoes += p.falta;
      m.set(p.profissional_id, atual);
    }
    return [...m.values()].sort((a, b) => b.pacientes - a.pacientes);
  }, [pacientes]);

  const agendaDaProf = useCallback(
    (profId: string | null): AgendaPublicaSemana | undefined =>
      profId ? agendas.find((a) => a.profissional_id === profId) : undefined,
    [agendas]
  );

  const visiveis = pacientes.filter(
    (p) =>
      (filtro === 'todos' || p.situacao === filtro) &&
      (!profFiltro || p.profissional_id === profFiltro)
  );

  const enviarLink = async (p: PacienteFixoSemana) => {
    const agenda = agendaDaProf(p.profissional_id);
    if (!agenda) return;
    const url = buildWhatsAppUrl(
      p.responsavel_telefone,
      mensagemLinkAgenda({
        responsavelNome: p.responsavel_nome,
        pacienteNome: p.paciente_nome,
        profissionalNome: agenda.profissional_nome,
        de: agenda.data_inicio,
        ate: agenda.data_fim,
        link: linkAgendaPublica(agenda.token),
      })
    );
    if (!url) {
      toast({
        title: 'Sem telefone válido',
        description: 'Confira o telefone do responsável no cadastro.',
        variant: 'destructive',
      });
      return;
    }
    // Abre a aba DENTRO do clique (senão o navegador bloqueia o pop-up)
    const aba = window.open('', '_blank');
    try {
      await registrarEnvioLink({
        pacienteId: p.paciente_id,
        semana,
        agendaId: agenda.id,
        telefone: p.responsavel_telefone,
      });
    } catch (e) {
      console.warn('Envio não registrado:', e);
    }
    if (aba) aba.location.href = url;
    else window.location.href = url;
    carregar();
  };

  const desfazerAdiamento = async (p: PacienteFixoSemana) => {
    try {
      await adiarPacienteFixo(p.paciente_id, null);
      toast({ title: 'Adiamento retirado' });
      carregar();
    } catch (e) {
      toast({
        title: 'Não foi possível desfazer',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const copiarLink = async (a: AgendaPublicaSemana) => {
    try {
      await navigator.clipboard.writeText(linkAgendaPublica(a.token));
      toast({ title: 'Link copiado', description: a.titulo });
    } catch {
      toast({ title: linkAgendaPublica(a.token) });
    }
  };

  const abrirPaciente = (id: string) => navigate(`/pacientes/${id}`);

  return (
    <div className="space-y-4">
      <PageHeader
        description="Pacientes da fisioterapia motora com frequência combinada: quem falta marcar na semana, envio do link da agenda e adiamentos."
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={carregar}
              disabled={carregando}
              aria-label="Atualizar"
            >
              <RefreshCw
                className={cn('h-4 w-4', carregando && 'animate-spin')}
              />
            </Button>
            <Button
              onClick={() => setCriarAgendas(true)}
              disabled={carregando || pendentesPorProf.length === 0}
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              Criar agendas da semana
            </Button>
          </>
        }
      />

      {/* Semana */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: estaSemana, label: 'Esta semana' },
          { id: proximaSemana, label: 'Próxima semana' },
          { id: somarDias(estaSemana, 14), label: 'Em 2 semanas' },
        ].map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={semana === s.id ? 'default' : 'outline'}
            onClick={() => setSemana(s.id)}
            className="h-auto flex-col items-start gap-0 py-1.5"
          >
            <span>{s.label}</span>
            <span
              className={cn(
                'text-[11px] font-normal',
                semana === s.id
                  ? 'text-primary-foreground/80'
                  : 'text-muted-foreground'
              )}
            >
              {rotuloSemana(s.id)}
            </span>
          </Button>
        ))}
      </div>

      {/* Saíram por alta na evolução */}
      {(dados?.altas_recentes.length ?? 0) > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Saíram dos fixos por alta na evolução:{' '}
            {dados!.altas_recentes.map((a, i) => (
              <React.Fragment key={a.paciente_id}>
                {i > 0 && ', '}
                <button
                  type="button"
                  className="font-medium underline-offset-2 hover:underline"
                  onClick={() => abrirPaciente(a.paciente_id)}
                >
                  {a.paciente_nome}
                </button>
                {a.por_nome ? ` (${primeiroNome(a.por_nome)})` : ''}
              </React.Fragment>
            ))}
            .
          </p>
        </div>
      )}

      {/* Resumo + agendas da semana */}
      {carregando && !dados ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <p className="text-sm">
              <span className="text-2xl font-semibold tabular-nums">
                {contagem.falta ?? 0}
              </span>{' '}
              paciente{contagem.falta === 1 ? '' : 's'} para marcar
              {sessoesFaltando !== (contagem.falta ?? 0) &&
                ` (${sessoesFaltando} sessões)`}{' '}
              <span className="text-muted-foreground">
                na semana de {rotuloSemana(semana)}
              </span>
            </p>
            {pendentesPorProf.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {pendentesPorProf.map((pp) => {
                  const ag = agendaDaProf(pp.id);
                  return (
                    <li
                      key={pp.id}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setProfFiltro(profFiltro === pp.id ? null : pp.id)
                        }
                        className={cn(
                          'font-medium hover:underline',
                          profFiltro === pp.id && 'text-primary underline'
                        )}
                      >
                        {primeiroNome(pp.nome)}: {pp.pacientes}
                      </button>
                      {ag ? (
                        <>
                          <span className="text-muted-foreground">
                            · {ag.titulo} ({ag.livres} livres)
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => copiarLink(ag)}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" /> Link
                          </Button>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          · sem agenda pública nesta semana
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filtro === f.id ? 'secondary' : 'ghost'}
            className="h-8"
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
            <span className="ml-1.5 tabular-nums text-muted-foreground">
              {contagem[f.id] ?? 0}
            </span>
          </Button>
        ))}
        {profFiltro && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-primary"
            onClick={() => setProfFiltro(null)}
          >
            {primeiroNome(
              pendentesPorProf.find((p) => p.id === profFiltro)?.nome
            )}{' '}
            ✕
          </Button>
        )}
      </div>

      {/* Lista */}
      {carregando && !dados ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : pacientes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Repeat className="mx-auto mb-2 h-6 w-6" />
            Ainda não há pacientes fixos. Use as sugestões abaixo, a ficha do
            paciente ou a conduta da evolução motora.
          </CardContent>
        </Card>
      ) : visiveis.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Ninguém nesta situação.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {visiveis.map((p) => {
            const agenda = agendaDaProf(p.profissional_id);
            return (
              <li
                key={p.paciente_id}
                className="flex flex-col gap-3 p-3 md:flex-row md:items-center"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => abrirPaciente(p.paciente_id)}
                      className="truncate text-left font-medium hover:underline"
                    >
                      {p.paciente_nome}
                    </button>
                    <Badge variant="secondary">
                      {rotuloFrequencia(p.frequencia)}
                    </Badge>
                    {p.atrasado && (
                      <Badge
                        variant="outline"
                        className="border-amber-400 text-amber-700 dark:text-amber-300"
                      >
                        Atrasado desde {diaMes(p.semana_prevista)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.profissional_nome
                      ? primeiroNome(p.profissional_nome)
                      : 'Sem profissional'}
                    {p.ultima_sessao &&
                      ` · última ${rotuloSessao(p.ultima_sessao)}`}
                    {p.observacao && ` · ${p.observacao}`}
                  </p>
                  {p.marcadas.length > 0 && (
                    <p className="flex flex-wrap gap-1.5 text-xs">
                      {p.marcadas.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                          <Check className="h-3 w-3" />
                          {rotuloSessao(m.data_hora)}
                          {m.status === 'faltou' && ' (faltou)'}
                        </span>
                      ))}
                      {p.situacao === 'falta' && (
                        <span className="text-muted-foreground">
                          falta {p.falta}
                        </span>
                      )}
                    </p>
                  )}
                  {p.situacao === 'adiado' && p.adiado_ate && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Volta na semana de {diaMes(p.adiado_ate)}
                      {p.adiado_motivo ? ` · ${p.adiado_motivo}` : ''}
                    </p>
                  )}
                  {p.situacao === 'fora_da_semana' && (
                    <p className="text-xs text-muted-foreground">
                      Próxima prevista na semana de {diaMes(p.semana_prevista)}
                    </p>
                  )}
                  {p.envio && (
                    <p className="text-xs text-muted-foreground">
                      Link enviado {dataHoraCarimbo(p.envio.enviado_em)}
                      {p.envio.enviado_por_nome
                        ? ` por ${primeiroNome(p.envio.enviado_por_nome)}`
                        : ''}
                      {p.envio.vezes > 1 ? ` (${p.envio.vezes}x)` : ''}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  {p.situacao === 'falta' && (
                    <>
                      <Button
                        size="sm"
                        variant={p.envio ? 'outline' : 'default'}
                        disabled={!agenda || !p.responsavel_telefone}
                        title={
                          !agenda
                            ? 'Crie a agenda da semana desta profissional'
                            : !p.responsavel_telefone
                              ? 'Responsável sem telefone'
                              : undefined
                        }
                        onClick={() => enviarLink(p)}
                      >
                        <MessageCircle className="mr-1.5 h-4 w-4" />
                        {p.envio ? 'Reenviar' : 'Enviar link'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!p.origem_agendamento_id}
                        title={
                          p.origem_agendamento_id
                            ? undefined
                            : 'Sem sessão anterior: marque pela Agenda'
                        }
                        onClick={() => setMarcando(p)}
                      >
                        <CalendarClock className="mr-1.5 h-4 w-4" />
                        Marcar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAdiando(p)}
                      >
                        Adiar
                      </Button>
                    </>
                  )}
                  {p.situacao === 'adiado' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => desfazerAdiamento(p)}
                    >
                      <Undo2 className="mr-1.5 h-4 w-4" />
                      Desfazer adiamento
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SugestoesFixos
        sugestoes={sugestoes}
        onChanged={carregar}
        onAbrirPaciente={abrirPaciente}
      />

      <AdiarFixoDialog
        paciente={adiando}
        semana={semana}
        onClose={() => setAdiando(null)}
        onDone={() => {
          setAdiando(null);
          carregar();
        }}
      />

      <CriarAgendasSemanaDialog
        open={criarAgendas}
        semana={semana}
        profissionais={pendentesPorProf}
        agendas={agendas}
        onClose={() => setCriarAgendas(false)}
        onCreated={carregar}
      />

      <Dialog
        open={!!marcando}
        onOpenChange={(o) => {
          if (!o) {
            setMarcando(null);
            carregar();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Marcar {primeiroNome(marcando?.paciente_nome)}
            </DialogTitle>
            <DialogDescription>
              Mesmo serviço, local e valor da última sessão.
            </DialogDescription>
          </DialogHeader>
          {marcando?.origem_agendamento_id && (
            <AgendaExpressa
              agendamentoId={marcando.origem_agendamento_id}
              defaultOpen
              onCreated={() => carregar()}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

PacientesFixosManager.displayName = 'PacientesFixosManager';
