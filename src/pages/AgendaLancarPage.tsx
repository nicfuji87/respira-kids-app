// AI dev note: Página /agenda/lancar/:id (admin e secretaria) — destino do botão
// "📅 Lançar consulta" no aviso do 🔔 Notificações (consulta combinada no WhatsApp que
// não entrou na agenda; ver supabase/migrations/agenda_sugestao_lancar.sql).
// Mostra o trecho da conversa e abre o formulário de agendamento de sempre, já com a
// criança, o dia, a hora e a fisio que o sistema leu da conversa (por regra, sem IA).
// Salvar cria a consulta pelo caminho normal (lembrete, Google Agenda, cobrança) e
// marca o aviso como lançado. "Já estava lançada" e "Não era consulta" só encerram o
// aviso, e servem para medir onde o aviso erra.

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Skeleton } from '@/components/primitives/skeleton';
import { useToast } from '@/components/primitives/use-toast';
import {
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  Loader2,
  MessageCircle,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppointmentFormManager } from '@/components/domain/calendar/AppointmentFormManager';
import {
  fetchAgendaSugestao,
  resolverAgendaSugestao,
  type AgendaSugestao,
  type AgendaSugestaoStatus,
} from '@/lib/agenda-sugestao-api';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// data pura (YYYY-MM-DD) sem new Date(iso): não pode cair um dia pelo fuso
function diaLegivel(s: string) {
  const [a, m, d] = s.slice(0, 10).split('-').map(Number);
  return `${DIAS[new Date(a, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

// data_hora da agenda é hora de parede (gravada como +00): lê a string, sem fuso
function consultaLegivel(s: string) {
  return `${diaLegivel(s)} às ${s.slice(11, 16)}`;
}

// instantes de verdade (mensagem, criação): mostrados no horário de Brasília
function quando(s: string) {
  return new Date(s).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS: Record<
  AgendaSugestaoStatus,
  { label: string; className: string }
> = {
  pendente: {
    label: 'Aguardando',
    className: 'border-amarelo-pipa/60 text-amber-700',
  },
  lancada: {
    label: 'Lançada',
    className: 'border-verde-pipa/60 text-green-700',
  },
  ja_estava: {
    label: 'Já estava na agenda',
    className: 'border-verde-pipa/60 text-green-700',
  },
  descartada: {
    label: 'Não era consulta',
    className: 'text-muted-foreground',
  },
};

const QUEM: Record<string, string> = {
  CLIENTE: 'Família',
  HUMANO: 'Equipe',
  JU: 'Ju',
};

export const AgendaLancarPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sug, setSug] = useState<AgendaSugestao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<AgendaSugestaoStatus | null>(null);
  const [formPaciente, setFormPaciente] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    try {
      setErroCarga(null);
      setSug(await fetchAgendaSugestao(id));
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const resolver = async (
    status: AgendaSugestaoStatus,
    agendamentoId?: string
  ) => {
    if (!id) return;
    setSalvando(status);
    try {
      await resolverAgendaSugestao(id, status, agendamentoId);
      await carregar();
      if (status !== 'pendente') {
        toast({
          title:
            status === 'lancada'
              ? 'Consulta lançada'
              : status === 'ja_estava'
                ? 'Aviso encerrado: já estava na agenda'
                : 'Aviso encerrado',
        });
      }
    } catch (e) {
      toast({
        title: 'Não foi possível salvar',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSalvando(null);
    }
  };

  const abrirFormulario = (pacienteId: string | null) => {
    setFormPaciente(pacienteId);
    setFormAberto(true);
  };

  if (carregando) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (erroCarga || !sug) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {erroCarga ?? 'Aviso não encontrado.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const st = STATUS[sug.status];
  const pendente = sug.status === 'pendente';
  const s = sug.sugestao ?? {};
  const entendido = [
    s.data ? diaLegivel(s.data) : null,
    s.hora ? `às ${s.hora}` : null,
    sug.profissional_nome ? `com ${sug.profissional_nome.split(' ')[0]}` : null,
  ].filter(Boolean);
  const dataInicial = s.data
    ? (() => {
        const [a, m, d] = s.data.split('-').map(Number);
        return new Date(a, m - 1, d);
      })()
    : undefined;
  // consultas criadas depois da conversa: forte sinal de "já estava lançada"
  const novas = sug.consultas.filter(
    (c) =>
      new Date(c.criada_em).getTime() >=
      new Date(sug.mensagem_em).getTime() - 3 * 3_600_000
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CalendarPlus className="h-6 w-6 text-roxo-titulo" />
          Lançar consulta
        </h1>
        <p className="text-muted-foreground">
          A consulta foi combinada no WhatsApp. Confira e salve na agenda para a
          família receber lembrete e cobrança.
        </p>
      </div>

      <Card className={cn(pendente && 'border-amarelo-pipa/50')}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">
              {sug.pacientes.length
                ? sug.pacientes.map((p) => p.nome.split(' ')[0]).join(' e ')
                : 'Família sem cadastro ligado ao número'}
            </CardTitle>
            <Badge variant="outline" className={cn('shrink-0', st.className)}>
              {st.label}
            </Badge>
          </div>
          {sug.telefone && (
            <p className="text-sm text-muted-foreground">{sug.telefone}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium">Pelo que entendi da conversa</p>
            <p className="mt-1">
              {entendido.length
                ? entendido.join(' ')
                : 'Não deu para entender o dia e a hora. Complete no formulário.'}
            </p>
            {entendido.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Lido automaticamente: confira no formulário antes de salvar.
              </p>
            )}
          </div>

          {sug.status !== 'pendente' && (
            <div className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
              <span>
                {st.label}
                {sug.resolvido_por
                  ? ` por ${sug.resolvido_por.split(' ')[0]}`
                  : ''}
                {sug.resolvido_em ? ` em ${quando(sug.resolvido_em)}` : ''}.
              </span>
            </div>
          )}

          {pendente && (
            <div className="space-y-2">
              {sug.pacientes.length > 0 ? (
                sug.pacientes.map((p) => (
                  <Button
                    key={p.id}
                    className="w-full"
                    onClick={() => abrirFormulario(p.id)}
                    disabled={!!salvando}
                  >
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    {sug.pacientes.length > 1
                      ? `Lançar para ${p.nome.split(' ')[0]}`
                      : 'Conferir e lançar'}
                  </Button>
                ))
              ) : (
                <Button
                  className="w-full"
                  onClick={() => abrirFormulario(null)}
                  disabled={!!salvando}
                >
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Escolher a criança e lançar
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => resolver('ja_estava')}
                  disabled={!!salvando}
                >
                  {salvando === 'ja_estava' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CalendarCheck className="mr-2 h-4 w-4" />
                  )}
                  Já estava lançada
                </Button>
                <Button
                  variant="outline"
                  onClick={() => resolver('descartada')}
                  disabled={!!salvando}
                >
                  {salvando === 'descartada' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="mr-2 h-4 w-4" />
                  )}
                  Não era consulta
                </Button>
              </div>
            </div>
          )}

          {!pendente && (
            <div className="flex gap-2">
              {sug.agendamento_id && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate('/agenda')}
                >
                  Abrir a agenda
                </Button>
              )}
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => resolver('pendente')}
                disabled={!!salvando}
              >
                Reabrir
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {sug.consultas.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Já na agenda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {sug.consultas.map((c) => (
              <div
                key={c.id}
                className={cn(
                  'rounded-lg border p-2',
                  novas.includes(c) && 'border-verde-pipa/60'
                )}
              >
                <p className="font-medium">
                  {consultaLegivel(c.data_hora)} · {c.paciente.split(' ')[0]}
                </p>
                <p className="text-muted-foreground">
                  {[c.profissional?.split(' ')[0], c.servico]
                    .filter(Boolean)
                    .join(' · ')}
                  {novas.includes(c)
                    ? ` · lançada em ${quando(c.criada_em)}`
                    : ''}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4" />
            Conversa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {sug.mensagens.length === 0 && (
            <p className="text-muted-foreground">“{sug.texto}”</p>
          )}
          {sug.mensagens.map((m, i) => (
            <div
              key={i}
              className={cn(
                'rounded-lg p-2',
                m.origem === 'CLIENTE' ? 'bg-muted/50' : 'bg-roxo-titulo/5',
                m.eh_a_confirmacao && 'ring-2 ring-amarelo-pipa/60'
              )}
            >
              <p className="text-xs text-muted-foreground">
                {QUEM[m.origem] ?? m.origem} · {quando(m.em)}
              </p>
              <p className="whitespace-pre-wrap break-words">{m.texto}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <AppointmentFormManager
        isOpen={formAberto}
        onClose={() => setFormAberto(false)}
        initialDate={dataInicial}
        initialTime={s.hora}
        initialPatientId={formPaciente ?? undefined}
        initialProfessionalId={s.profissional_id}
        prefillFromLastAppointment
        onSave={(agendamentoId) => {
          // o formulário fecha sozinho (ou fica aberto em "agendar próxima");
          // o aviso fica com a primeira consulta salva
          if (sug.status === 'pendente') resolver('lancada', agendamentoId);
        }}
      />
    </div>
  );
};

export default AgendaLancarPage;
