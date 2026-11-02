// AI dev note: Tela Pacientes Fixos (admin + secretaria). Mostra, para a
// semana escolhida, quem falta marcar pela frequência do cadastro. Ações:
// - Enviar link: abre o WhatsApp com o link da agenda pública da profissional
//   da semana e registra o envio (pacientes_fixos_envios);
// - Marcar: Agenda Expressa a partir da última sessão (copia serviço/local/valor);
// - Adiar: tira da lista até uma semana (família viajando etc.);
// - Envio em massa: os selecionados entram numa fila no banco e saem sozinhos
//   pelo número da recepção (5-9 min, 8h-20h, junto com as cobranças em lote).
// Paciente dividido: escolhe de qual profissional vai o link (padrão: a da
// vez; se a agenda dela está sem horário livre, a outra).
// O cálculo é todo do banco (fn_pacientes_fixos_semana).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  CalendarPlus,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Repeat,
  Undo2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { Checkbox } from '@/components/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
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
  MINUTOS_MEDIOS_POR_ENVIO,
  adiarPacienteFixo,
  buscarEnviosSemana,
  buscarSemanaFixos,
  cancelarFilaEnvios,
  enfileirarEnvios,
  buscarSugestoesFixos,
  dataHoraCarimbo,
  diaMes,
  linkAgendaPublica,
  mensagemLembreteAgenda,
  mensagemLinkAgenda,
  rotuloFrequencia,
  rotuloSemana,
  rotuloSessao,
  segundaDaSemana,
  somarDias,
  registrarEnvioLink,
  type AgendaPublicaSemana,
  type EnvioSemana,
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

type FiltroLista = SituacaoFixo | 'todos' | 'nao_agendou';

const FILTROS: { id: FiltroLista; label: string }[] = [
  { id: 'nao_agendou', label: 'Não agendaram' },
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
  const [filtro, setFiltro] = useState<FiltroLista>('falta');
  const [profFiltro, setProfFiltro] = useState<string | null>(null);

  const [adiando, setAdiando] = useState<PacienteFixoSemana | null>(null);
  const [marcando, setMarcando] = useState<PacienteFixoSemana | null>(null);
  // Profissionais do diálogo "Criar agenda" (null = fechado)
  const [criarPara, setCriarPara] = useState<string[] | null>(null);

  // Envio: situação por paciente, escolha da profissional e seleção em massa
  const [envios, setEnvios] = useState<Record<string, EnvioSemana>>({});
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmarMassa, setConfirmarMassa] = useState(false);
  const [enfileirando, setEnfileirando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [d, s, e] = await Promise.all([
        buscarSemanaFixos(semana),
        buscarSugestoesFixos(),
        buscarEnviosSemana(semana).catch(() => ({})),
      ]);
      setDados(d);
      setSugestoes(s ?? []);
      setEnvios(e ?? {});
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

  // Trocou de semana: limpa a seleção e as escolhas
  useEffect(() => {
    setSelecionados(new Set());
    setEscolha({});
  }, [semana]);

  const pacientes = useMemo(() => dados?.pacientes ?? [], [dados]);
  const agendas = useMemo(() => dados?.agendas ?? [], [dados]);

  // Alerta: na semana em que deveria vir, a partir de terça, ainda sem horário
  // (normalmente recebeu o link na semana anterior e não marcou)
  const diaHoje = new Date().getDay(); // 0 = domingo
  const passouDeSegunda = diaHoje === 0 || diaHoje >= 2;
  const emAlerta = useCallback(
    (p: PacienteFixoSemana) =>
      semana === estaSemana && passouDeSegunda && p.situacao === 'falta',
    [semana, estaSemana, passouDeSegunda]
  );

  // Filtro por profissional (paciente dividido aparece nas duas)
  const porProf = useMemo(
    () =>
      pacientes.filter(
        (p) =>
          !profFiltro ||
          p.profissional_id === profFiltro ||
          (p.profissionais ?? []).some((x) => x.id === profFiltro)
      ),
    [pacientes, profFiltro]
  );

  const profsDaLista = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; n: number }>();
    for (const p of pacientes) {
      const ids = new Map<string, string>();
      if (p.profissional_id)
        ids.set(p.profissional_id, p.profissional_nome ?? 'Sem nome');
      for (const x of p.profissionais ?? []) ids.set(x.id, x.nome);
      for (const [id, nome] of ids) {
        const atual = m.get(id) ?? { id, nome, n: 0 };
        atual.n += 1;
        m.set(id, atual);
      }
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [pacientes]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: porProf.length };
    for (const p of porProf) c[p.situacao] = (c[p.situacao] ?? 0) + 1;
    c.nao_agendou = porProf.filter(emAlerta).length;
    return c;
  }, [porProf, emAlerta]);

  const sessoesFaltando = pacientes.reduce((t, p) => t + p.falta, 0);

  // Profissionais com fixos esperando (para o filtro e para criar agendas).
  // Paciente dividido conta para a da vez; nas outras entra em "divididos".
  const pendentesPorProf = useMemo<ProfissionalPendente[]>(() => {
    const m = new Map<string, ProfissionalPendente>();
    const pegar = (id: string, nome: string | null) => {
      const atual = m.get(id) ?? {
        id,
        nome: nome ?? 'Sem nome',
        pacientes: 0,
        sessoes: 0,
        divididos: 0,
      };
      m.set(id, atual);
      return atual;
    };
    for (const p of pacientes) {
      if (p.situacao !== 'falta' || !p.profissional_id) continue;
      const vez = pegar(p.profissional_id, p.profissional_nome);
      vez.pacientes += 1;
      vez.sessoes += p.falta;
      for (const outra of p.profissionais ?? [])
        if (outra.id !== p.profissional_id)
          pegar(outra.id, outra.nome).divididos += 1;
    }
    return [...m.values()].sort(
      (a, b) => b.pacientes + b.divididos - (a.pacientes + a.divididos)
    );
  }, [pacientes]);

  // Estável entre renderizações: o diálogo busca horários quando ela muda
  const profsDoDialogo = useMemo(
    () => pendentesPorProf.filter((p) => (criarPara ?? []).includes(p.id)),
    [pendentesPorProf, criarPara]
  );

  const agendaDaProf = useCallback(
    (profId: string | null): AgendaPublicaSemana | undefined =>
      profId ? agendas.find((a) => a.profissional_id === profId) : undefined,
    [agendas]
  );

  // Agendas do paciente na semana: a da vez primeiro, depois as outras
  const agendasDoPaciente = useCallback(
    (p: PacienteFixoSemana): AgendaPublicaSemana[] => {
      const ids = [
        p.profissional_id,
        ...(p.profissionais ?? []).map((x) => x.id),
      ].filter((id, i, arr): id is string => !!id && arr.indexOf(id) === i);
      return ids
        .map((id) => agendaDaProf(id))
        .filter((a): a is AgendaPublicaSemana => !!a);
    },
    [agendaDaProf]
  );

  // Profissional do link: escolhida na linha ou, sem escolha, a da vez; se a
  // agenda da vez está sem horário livre, a primeira outra com horário
  const escolhaPadrao = useCallback(
    (p: PacienteFixoSemana): string | undefined => {
      const lista = agendasDoPaciente(p);
      if (lista.length <= 1) return lista[0]?.profissional_id;
      const daVez = lista.find((a) => a.profissional_id === p.profissional_id);
      if (daVez && daVez.livres > 0) return daVez.profissional_id;
      return (lista.find((a) => a.livres > 0) ?? lista[0]).profissional_id;
    },
    [agendasDoPaciente]
  );

  const agendasEscolhidas = useCallback(
    (p: PacienteFixoSemana): AgendaPublicaSemana[] => {
      const lista = agendasDoPaciente(p);
      const e = escolha[p.paciente_id] ?? escolhaPadrao(p);
      if (e === 'todas') return lista;
      const uma = lista.filter((a) => a.profissional_id === e);
      return uma.length ? uma : lista.slice(0, 1);
    },
    [agendasDoPaciente, escolha, escolhaPadrao]
  );

  // Convite (semana que vem) ou lembrete (já é a semana e não marcou)
  const textoDoLink = useCallback(
    (p: PacienteFixoSemana, ags: AgendaPublicaSemana[]) =>
      (emAlerta(p) ? mensagemLembreteAgenda : mensagemLinkAgenda)({
        responsavelNome: p.responsavel_nome,
        pacienteNome: p.paciente_nome,
        agendas: ags.map((a) => ({
          profissionalNome: a.profissional_nome,
          de: a.data_inicio,
          ate: a.data_fim,
          link: linkAgendaPublica(a.token),
        })),
      }),
    [emAlerta]
  );

  const envioDe = useCallback(
    (p: PacienteFixoSemana): EnvioSemana | null =>
      envios[p.paciente_id] ??
      (p.envio
        ? {
            status: 'enviado',
            canal: 'whatsapp_manual',
            enviado_em: p.envio.enviado_em,
            fila_em: null,
            erro: null,
            enviado_por_nome: p.envio.enviado_por_nome,
            agenda_id: p.envio.agenda_id,
            vezes: p.envio.vezes,
          }
        : null),
    [envios]
  );

  // Pode ir no envio em massa: falta marcar, tem agenda, tem telefone e não
  // está na fila
  const elegivelMassa = useCallback(
    (p: PacienteFixoSemana) => {
      const st = envioDe(p)?.status;
      return (
        p.situacao === 'falta' &&
        !!p.responsavel_telefone &&
        agendasDoPaciente(p).length > 0 &&
        st !== 'fila' &&
        st !== 'enviando'
      );
    },
    [agendasDoPaciente, envioDe]
  );

  // Envio em massa respeita o filtro de profissional e o de "Não agendaram"
  const elegiveis = useMemo(
    () =>
      porProf.filter(
        (p) => elegivelMassa(p) && (filtro !== 'nao_agendou' || emAlerta(p))
      ),
    [porProf, elegivelMassa, filtro, emAlerta]
  );
  const naFila = useMemo(
    () =>
      porProf.filter((p) => {
        const st = envioDe(p)?.status;
        return st === 'fila' || st === 'enviando';
      }).length,
    [porProf, envioDe]
  );
  const selecionadosValidos = elegiveis.filter((p) =>
    selecionados.has(p.paciente_id)
  );

  const alternarSelecao = (id: string) =>
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const enviarEmMassa = async () => {
    setEnfileirando(true);
    try {
      const r = await enfileirarEnvios(
        selecionadosValidos.map((p) => {
          const ags = agendasEscolhidas(p);
          return {
            paciente_id: p.paciente_id,
            semana,
            agendas: ags.map((a) => a.id),
            telefone: p.responsavel_telefone ?? '',
            texto: textoDoLink(p, ags),
          };
        })
      );
      toast({
        title: `${r.enfileirados} ${r.enfileirados === 1 ? 'mensagem entrou' : 'mensagens entraram'} na fila`,
        description: `Saem sozinhas pelo número da recepção, uma a cada 5 a 9 minutos, das 8h às 20h.${
          r.ignorados ? ` ${r.ignorados} já estavam na fila.` : ''
        }`,
      });
      setSelecionados(new Set());
      setConfirmarMassa(false);
      carregar();
    } catch (e) {
      toast({
        title: 'Não foi possível colocar na fila',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setEnfileirando(false);
    }
  };

  const cancelarFila = async (pacienteId?: string) => {
    try {
      const n = await cancelarFilaEnvios(semana, pacienteId);
      toast({
        title: n === 1 ? 'Saiu da fila' : `${n} mensagens saíram da fila`,
      });
      carregar();
    } catch (e) {
      toast({
        title: 'Não foi possível tirar da fila',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const visiveis = porProf.filter((p) =>
    filtro === 'todos'
      ? true
      : filtro === 'nao_agendou'
        ? emAlerta(p)
        : p.situacao === filtro
  );

  const enviarLink = async (p: PacienteFixoSemana) => {
    const lista = agendasEscolhidas(p);
    const agenda = lista[0];
    if (!agenda) return;
    const url = buildWhatsAppUrl(p.responsavel_telefone, textoDoLink(p, lista));
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
              onClick={() => setCriarPara(pendentesPorProf.map((p) => p.id))}
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
                        {pp.divididos > 0 && (
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            (+{pp.divididos} dividido
                            {pp.divididos === 1 ? '' : 's'})
                          </span>
                        )}
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
                        <>
                          <span className="text-muted-foreground">
                            · sem agenda pública nesta semana
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-primary"
                            onClick={() => setCriarPara([pp.id])}
                          >
                            <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                            Criar agenda
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quem deveria vir nesta semana e ainda não marcou (a partir de terça) */}
      {(contagem.nao_agendou ?? 0) > 0 && filtro !== 'nao_agendou' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="flex-1">
            {contagem.nao_agendou} paciente
            {contagem.nao_agendou === 1 ? '' : 's'} deveri
            {contagem.nao_agendou === 1 ? 'a' : 'am'} vir nesta semana e ainda
            não agend{contagem.nao_agendou === 1 ? 'ou' : 'aram'}.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-amber-400 bg-transparent"
            onClick={() => setFiltro('nao_agendou')}
          >
            Ver e lembrar
          </Button>
        </div>
      )}

      {/* Profissional */}
      {profsDaLista.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">
            Profissional
          </span>
          {[
            { id: null as string | null, nome: 'Todas', n: pacientes.length },
            ...profsDaLista,
          ].map((p) => (
            <Button
              key={p.id ?? 'todas'}
              size="sm"
              variant={profFiltro === p.id ? 'default' : 'outline'}
              className="h-8"
              onClick={() => setProfFiltro(p.id)}
            >
              {p.id ? primeiroNome(p.nome) : p.nome}
              <span
                className={cn(
                  'ml-1.5 tabular-nums',
                  profFiltro === p.id
                    ? 'text-primary-foreground/80'
                    : 'text-muted-foreground'
                )}
              >
                {p.n}
              </span>
            </Button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.filter(
          (f) => f.id !== 'nao_agendou' || (contagem.nao_agendou ?? 0) > 0
        ).map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filtro === f.id ? 'secondary' : 'ghost'}
            className={cn(
              'h-8',
              f.id === 'nao_agendou' && 'text-amber-800 dark:text-amber-300'
            )}
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
            <span className="ml-1.5 tabular-nums text-muted-foreground">
              {contagem[f.id] ?? 0}
            </span>
          </Button>
        ))}
      </div>

      {/* Envio em massa */}
      {(elegiveis.length > 0 || naFila > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          {elegiveis.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={
                  selecionadosValidos.length === elegiveis.length
                    ? true
                    : selecionadosValidos.length > 0
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(c) =>
                  setSelecionados(
                    c ? new Set(elegiveis.map((p) => p.paciente_id)) : new Set()
                  )
                }
              />
              Selecionar todos que podem receber ({elegiveis.length})
            </label>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {naFila > 0 && (
              <>
                <span className="text-muted-foreground">
                  {naFila} na fila de envio
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => cancelarFila()}
                >
                  Tirar todos da fila
                </Button>
              </>
            )}
            <Button
              size="sm"
              className="h-8"
              disabled={selecionadosValidos.length === 0}
              onClick={() => setConfirmarMassa(true)}
            >
              <Send className="mr-1.5 h-4 w-4" />
              Enviar em massa
              {selecionadosValidos.length > 0 &&
                ` (${selecionadosValidos.length})`}
            </Button>
          </div>
        </div>
      )}

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
            const agendasP = agendasDoPaciente(p);
            const nomesProfs = (p.profissionais ?? []).map((x) =>
              primeiroNome(x.nome)
            );
            const envio = envioDe(p);
            const naFilaP =
              envio?.status === 'fila' || envio?.status === 'enviando';
            const escolhaP = escolha[p.paciente_id] ?? escolhaPadrao(p);
            return (
              <li
                key={p.paciente_id}
                className="flex flex-col gap-3 p-3 md:flex-row md:items-center"
              >
                {p.situacao === 'falta' && (
                  <Checkbox
                    className="hidden md:block"
                    checked={selecionados.has(p.paciente_id)}
                    disabled={!elegivelMassa(p)}
                    onCheckedChange={() => alternarSelecao(p.paciente_id)}
                    aria-label={`Selecionar ${p.paciente_nome} para o envio em massa`}
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.situacao === 'falta' && (
                      <Checkbox
                        className="md:hidden"
                        checked={selecionados.has(p.paciente_id)}
                        disabled={!elegivelMassa(p)}
                        onCheckedChange={() => alternarSelecao(p.paciente_id)}
                        aria-label={`Selecionar ${p.paciente_nome} para o envio em massa`}
                      />
                    )}
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
                    {p.divide && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-sky-300 text-sky-800 dark:border-sky-800 dark:text-sky-300"
                        title={
                          p.divide_origem === 'cadastro'
                            ? 'Dividido no cadastro'
                            : `Pelo histórico: ${(
                                p.historico_profissionais ?? []
                              )
                                .map(
                                  (h) => `${primeiroNome(h.nome)} ${h.sessoes}`
                                )
                                .join(', ')} nas últimas sessões`
                        }
                      >
                        <ArrowLeftRight className="h-3 w-3" />
                        Divide
                      </Badge>
                    )}
                    {emAlerta(p) && (
                      <Badge
                        variant="outline"
                        className="border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        Não agendou
                      </Badge>
                    )}
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
                    {p.divide && nomesProfs.length > 1
                      ? `${nomesProfs.join(' e ')} · vez da ${primeiroNome(p.profissional_nome)}`
                      : p.profissional_nome
                        ? primeiroNome(p.profissional_nome)
                        : 'Sem profissional'}
                    {p.divide &&
                      (p.historico_profissionais ?? []).length > 1 &&
                      ` (${(p.historico_profissionais ?? [])
                        .map((h) => `${primeiroNome(h.nome)} ${h.sessoes}`)
                        .join(', ')} nas últimas sessões)`}
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
                  {emAlerta(p) && (
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      {envio?.status === 'enviado' && envio.enviado_em
                        ? `Recebeu o link em ${dataHoraCarimbo(envio.enviado_em)} e ainda não marcou.`
                        : 'Ainda não recebeu o link desta semana.'}{' '}
                      Toque em Lembrar para avisar a família.
                    </p>
                  )}
                  {envio &&
                    envio.status !== 'cancelado' &&
                    !(emAlerta(p) && envio.status === 'enviado') && (
                      <p
                        className={cn(
                          'text-xs',
                          envio.status === 'falhou'
                            ? 'text-destructive'
                            : naFilaP
                              ? 'text-sky-700 dark:text-sky-300'
                              : 'text-muted-foreground'
                        )}
                      >
                        {envio.status === 'fila' &&
                          'Na fila do envio automático'}
                        {envio.status === 'enviando' && 'Enviando agora…'}
                        {envio.status === 'falhou' &&
                          `Envio automático falhou${envio.erro ? `: ${envio.erro}` : ''}`}
                        {envio.status === 'enviado' &&
                          `Link enviado ${dataHoraCarimbo(envio.enviado_em)}${
                            envio.canal === 'whatsapp_auto'
                              ? ' automaticamente'
                              : envio.enviado_por_nome
                                ? ` por ${primeiroNome(envio.enviado_por_nome)}`
                                : ''
                          }${envio.vezes > 1 ? ` (${envio.vezes}x)` : ''}`}
                        {naFilaP && envio.status === 'fila' && (
                          <button
                            type="button"
                            className="ml-2 underline-offset-2 hover:underline"
                            onClick={() => cancelarFila(p.paciente_id)}
                          >
                            Tirar da fila
                          </button>
                        )}
                      </p>
                    )}
                  {envio?.status === 'cancelado' && envio.erro && (
                    <p className="text-xs text-muted-foreground">
                      Saiu da fila: {envio.erro.toLowerCase()}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  {p.situacao === 'falta' && (
                    <>
                      {agendasP.length > 1 && (
                        <Select
                          value={escolhaP}
                          onValueChange={(v) =>
                            setEscolha((e) => ({ ...e, [p.paciente_id]: v }))
                          }
                        >
                          <SelectTrigger
                            className="h-9 w-auto min-w-[8.5rem] gap-1 text-xs"
                            aria-label="De qual profissional vai o link"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {agendasP.map((a) => (
                              <SelectItem
                                key={a.profissional_id}
                                value={a.profissional_id}
                              >
                                Link da {primeiroNome(a.profissional_nome)}
                                {a.profissional_id === p.profissional_id
                                  ? ' (vez dela)'
                                  : ''}
                                {a.livres === 0 ? ' · sem horário' : ''}
                              </SelectItem>
                            ))}
                            <SelectItem value="todas">
                              {agendasP.length === 2
                                ? 'Links das duas'
                                : 'Links de todas'}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        size="sm"
                        variant={envio ? 'outline' : 'default'}
                        disabled={
                          !agendasP.length || !p.responsavel_telefone || naFilaP
                        }
                        title={
                          !agendasP.length
                            ? 'Crie a agenda da semana desta profissional'
                            : !p.responsavel_telefone
                              ? 'Responsável sem telefone'
                              : naFilaP
                                ? 'Já está na fila do envio automático'
                                : undefined
                        }
                        onClick={() => enviarLink(p)}
                      >
                        <MessageCircle className="mr-1.5 h-4 w-4" />
                        {emAlerta(p)
                          ? 'Lembrar'
                          : envio?.status === 'enviado'
                            ? 'Reenviar'
                            : 'Enviar link'}
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

      <Dialog
        open={confirmarMassa}
        onOpenChange={(o) => !o && !enfileirando && setConfirmarMassa(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Enviar para {selecionadosValidos.length} família
              {selecionadosValidos.length === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>
              As mensagens saem sozinhas pelo número da recepção, uma a cada 5 a
              9 minutos, só das 8h às 20h e no ritmo das cobranças em lote.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Previsão: cerca de{' '}
              {(() => {
                const min =
                  selecionadosValidos.length * MINUTOS_MEDIOS_POR_ENVIO;
                return min < 60
                  ? `${min} minutos`
                  : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
              })()}{' '}
              para todas saírem.
            </p>
            <p className="text-muted-foreground">
              Quem marcar antes de chegar a vez não recebe. Dá para tirar da
              fila a qualquer momento.
            </p>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-2 text-xs">
              {selecionadosValidos.map((p) => (
                <li key={p.paciente_id}>
                  {p.paciente_nome}
                  <span className="text-muted-foreground">
                    {' '}
                    ·{' '}
                    {agendasEscolhidas(p)
                      .map((a) => primeiroNome(a.profissional_nome))
                      .join(' e ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmarMassa(false)}
              disabled={enfileirando}
            >
              Cancelar
            </Button>
            <Button onClick={enviarEmMassa} disabled={enfileirando}>
              {enfileirando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Colocar na fila
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CriarAgendasSemanaDialog
        open={!!criarPara}
        semana={semana}
        profissionais={profsDoDialogo}
        agendas={agendas}
        onClose={() => setCriarPara(null)}
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
