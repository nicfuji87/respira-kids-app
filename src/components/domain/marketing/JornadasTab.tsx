import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SecaoRelatorio } from '@/components/domain/relatorios/relatorios-ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Input } from '@/components/primitives/input';
import { Skeleton } from '@/components/primitives/skeleton';
import {
  ESTADOS,
  ETAPAS,
  INTENCOES,
  MOTIVOS_PERDA,
  ORIGENS,
  brl,
  carregarJornada,
  data,
  dataHora,
  rotuloCanal,
  type Intencao,
  type Jornada,
  type Recorte,
} from '@/lib/marketing-atribuicao';
import { SeloSituacao, type Situacao } from './marketing-ui';

const situacaoEstado = (e: string): Situacao =>
  e === 'convertida'
    ? 'ok'
    : e === 'perdida'
      ? 'problema'
      : e === 'descartada'
        ? 'neutro'
        : 'atencao';

const ABERTURA: Record<string, string> = {
  toque: 'Mensagem com código do site',
  pedido_agendamento: 'Pedido de agendamento pela Ju',
  primeiro_contato: 'Primeiro contato de um contato novo',
  humano: 'Registrada pela equipe',
};

const STATUS_CONSULTA: Record<string, string> = {
  agendado: 'agendada',
  confirmado: 'confirmada',
  finalizado: 'realizada',
  cancelado: 'cancelada',
  faltou: 'falta',
  reagendado: 'remarcada',
  erro: 'erro',
};
const SITUACAO_RECEITA: Record<string, string> = {
  recebida: 'paga',
  recebida_manual: 'paga (fora de fatura)',
  pendente: 'pagamento pendente',
  estornada: 'estornada',
  a_conciliar: 'cancelada mas paga — a conciliar',
  sem_receita: 'sem receita',
};

interface Passo {
  em: string;
  titulo: string;
  detalhe?: string;
}

function montarPassos(j: Jornada): Passo[] {
  const p: Passo[] = [];
  for (const t of j.toques) {
    if (t.clicado_em)
      p.push({
        em: t.clicado_em,
        titulo: `Clique no WhatsApp do site — ${rotuloCanal(t.canal)}`,
        detalhe:
          [
            t.campanha_nome && `campanha ${t.campanha_nome}`,
            t.palavra_chave_segmentacao &&
              `palavra-chave de segmentação "${t.palavra_chave_segmentacao}"`,
            t.pagina && `página ${t.pagina}`,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
      });
    if (t.mensagem_em)
      p.push({
        em: t.mensagem_em,
        titulo:
          t.origem_tipo === 'declarada'
            ? `Origem declarada pela equipe — ${rotuloCanal(t.canal)}`
            : `Mensagem com o código ${t.ref ?? ''}`,
        detalhe:
          t.clique_status === 'nao_encontrado'
            ? 'clique não encontrado no site (origem recuperada)'
            : t.clique_status === 'pendente'
              ? 'buscando o clique no site'
              : undefined,
      });
  }
  for (const e of j.eventos) {
    if (e.tipo === 'toque') continue;
    const titulo =
      e.tipo === 'aberta'
        ? `Oportunidade aberta — ${ABERTURA[e.para ?? ''] ?? e.para}`
        : e.tipo === 'pedido'
          ? 'Pedido de agendamento registrado (Ju → Lolô)'
          : e.tipo === 'estado'
            ? `Estado: ${ESTADOS[e.de ?? ''] ?? e.de ?? '—'} → ${ESTADOS[e.para ?? ''] ?? e.para}`
            : e.tipo === 'etapa'
              ? `Etapa: ${ETAPAS.find((x) => x.chave === e.para)?.rotulo ?? e.para}`
              : e.tipo === 'motivo'
                ? `Motivo de perda: ${MOTIVOS_PERDA[e.para ?? ''] ?? e.para}`
                : e.tipo === 'revisao'
                  ? `Revisão da equipe: ${e.para}`
                  : e.tipo;
    p.push({
      em: e.ocorrido_em,
      titulo,
      detalhe: [e.evidencia && `“${e.evidencia}”`, `fonte: ${e.fonte}`]
        .filter(Boolean)
        .join(' · '),
    });
  }
  for (const a of j.agendamentos) {
    p.push({
      em: a.criado_em,
      titulo: `Agendamento criado — ${a.crianca}`,
      detalhe: `${a.servico ?? 'serviço'} · vínculo ${a.tipo_vinculo === 'pedido_ju' ? 'pelo pedido da Ju' : a.tipo_vinculo === 'humano' ? 'confirmado pela equipe' : 'provável (telefone + janela de 60 dias)'}`,
    });
    // data_hora é hora de parede (sem fuso): mostrada como está
    const em = `${a.data_hora}:00-03:00`;
    const semBaixa =
      (a.status_consulta === 'agendado' ||
        a.status_consulta === 'confirmado') &&
      new Date(em).getTime() < Date.now();
    p.push({
      em,
      titulo: `Sessão ${STATUS_CONSULTA[a.status_consulta ?? ''] ?? a.status_consulta} — ${a.crianca}`,
      detalhe: [
        semBaixa
          ? 'já passou e não foi finalizada na agenda: só conta como atendimento depois da baixa'
          : null,
        SITUACAO_RECEITA[a.situacao_receita ?? ''] ?? a.situacao_receita,
        a.receita ? brl(a.receita) : null,
        a.tipo_paciente === 'recorrente'
          ? 'paciente já atendido antes (retenção)'
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }
  return p.sort((x, y) => new Date(x.em).getTime() - new Date(y.em).getTime());
}

const DetalheJornada: React.FC<{ id: number | null; onClose: () => void }> = ({
  id,
  onClose,
}) => {
  const [j, setJ] = useState<Jornada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (id == null) return;
    setJ(null);
    setErro(null);
    carregarJornada(id)
      .then(setJ)
      .catch((e: Error) => setErro(e.message));
  }, [id]);
  const passos = useMemo(() => (j ? montarPassos(j) : []), [j]);
  const pacientes = j
    ? [
        ...new Map(
          j.agendamentos.map((a) => [a.paciente_id, a.crianca])
        ).entries(),
      ]
    : [];

  return (
    <Dialog open={id != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Jornada da oportunidade #{id}</DialogTitle>
          <DialogDescription>
            Sem conteúdo de mensagens nem dados clínicos. Datas no horário de
            Brasília.
          </DialogDescription>
        </DialogHeader>
        {erro && (
          <p className="text-sm text-destructive">
            Não foi possível carregar: {erro}
          </p>
        )}
        {!j && !erro && <Skeleton className="h-40 w-full" />}
        {j && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <SeloSituacao situacao={situacaoEstado(j.oportunidade.estado)}>
                {ESTADOS[j.oportunidade.estado] ?? j.oportunidade.estado}
              </SeloSituacao>
              <span>
                Etapa máxima:{' '}
                {
                  ETAPAS.find((e) => e.chave === j.oportunidade.etapa_maxima)
                    ?.rotulo
                }
              </span>
              {j.oportunidade.contato && (
                <span className="text-muted-foreground">
                  Contato {j.oportunidade.contato}
                </span>
              )}
              {j.oportunidade.contato_novo && (
                <span className="text-muted-foreground">· contato novo</span>
              )}
            </div>
            {j.oportunidade.motivo_perda && (
              <p className="text-sm">
                Motivo:{' '}
                {MOTIVOS_PERDA[j.oportunidade.motivo_perda] ??
                  j.oportunidade.motivo_perda}{' '}
                (fonte: {j.oportunidade.motivo_fonte})
                {j.oportunidade.motivo_evidencia && (
                  <> — “{j.oportunidade.motivo_evidencia}”</>
                )}
              </p>
            )}
            {pacientes.length > 0 && (
              <p className="text-sm">
                Ficha:{' '}
                {pacientes.map(([pid, nome], i) => (
                  <React.Fragment key={pid}>
                    {i > 0 && ', '}
                    <Link className="underline" to={`/pacientes/${pid}`}>
                      {nome}
                    </Link>
                  </React.Fragment>
                ))}
              </p>
            )}
            <ol className="relative space-y-3 border-l pl-5">
              {passos.map((p, i) => (
                <li key={i} className="relative">
                  <span
                    className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-[hsl(var(--serie-1))]"
                    aria-hidden
                  />
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {dataHora(p.em)}
                  </div>
                  <div className="text-sm font-medium">{p.titulo}</div>
                  {p.detalhe && (
                    <div className="text-xs text-muted-foreground">
                      {p.detalhe}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export const JornadasTab: React.FC<{
  r: Recorte;
  aberta: number | null;
  setAberta: (id: number | null) => void;
}> = ({ r, aberta, setAberta }) => {
  const [busca, setBusca] = useState('');
  const [estado, setEstado] = useState('todos');
  const [intencao, setIntencao] = useState<'todas' | Intencao>('todas');
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return r.oportunidades.filter(
      (o) =>
        (estado === 'todos' || o.estado === estado) &&
        (intencao === 'todas' || o.intencao === intencao) &&
        (!b ||
          (o.criancas ?? '').toLowerCase().includes(b) ||
          String(o.id) === b)
    );
  }, [r.oportunidades, busca, estado, intencao]);

  return (
    <>
      <SecaoRelatorio
        titulo="Oportunidades"
        descricao="Toque numa oportunidade para ver a jornada do clique à receita."
      >
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            placeholder="Buscar criança ou nº"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar oportunidade"
          />
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Filtrar por estado"
          >
            {[
              'todos',
              'aberta',
              'agendada',
              'convertida',
              'perdida',
              'descartada',
            ].map((e) => (
              <button
                key={e}
                onClick={() => setEstado(e)}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${estado === e ? 'border-[hsl(var(--azul-respira-ink))] bg-muted font-medium' : 'text-muted-foreground'}`}
                aria-pressed={estado === e}
              >
                {e === 'todos' ? 'Todos' : ESTADOS[e]}
              </button>
            ))}
          </div>
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="Filtrar por intenção"
          >
            {(
              [
                'todas',
                'contratar',
                'paciente',
                'sem_demanda',
                'nao_analisada',
              ] as const
            ).map((i) => (
              <button
                key={i}
                onClick={() => setIntencao(i)}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${intencao === i ? 'border-[hsl(var(--azul-respira-ink))] bg-muted font-medium' : 'text-muted-foreground'}`}
                aria-pressed={intencao === i}
              >
                {i === 'todas' ? 'Qualquer intenção' : INTENCOES[i]}
              </button>
            ))}
          </div>
        </div>
        {lista.length ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  {[
                    'Nº',
                    'Aberta em',
                    'Criança(s)',
                    'Intenção',
                    'Origem',
                    'Campanha',
                    'Etapa máxima',
                    'Estado',
                    'Receita',
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-3 py-2 font-medium"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-t hover:bg-muted/40"
                    onClick={() => setAberta(o.id)}
                  >
                    <td className="px-3 py-2 tabular-nums">
                      <button
                        className="underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAberta(o.id);
                        }}
                      >
                        #{o.id}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {data(o.aberta_em)}
                    </td>
                    <td className="px-3 py-2">
                      {o.criancas ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2"
                      title={
                        o.intencao_fonte === 'etapa'
                          ? 'pelo fato: pediu ou agendou'
                          : o.intencao_analisada_em
                            ? `análise da noite de ${data(o.intencao_analisada_em)}`
                            : undefined
                      }
                    >
                      {INTENCOES[o.intencao] ?? o.intencao}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2"
                      title={ORIGENS[o.tipo_origem]}
                    >
                      {rotuloCanal(o.canal)}
                    </td>
                    <td className="px-3 py-2">
                      {o.campanha_nome ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {ETAPAS.find((e) => e.chave === o.etapa_maxima)?.rotulo}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <SeloSituacao situacao={situacaoEstado(o.estado)}>
                        {ESTADOS[o.estado] ?? o.estado}
                      </SeloSituacao>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {o.receita_vinculada ? brl(o.receita_vinculada) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma oportunidade com esses filtros.
          </p>
        )}
      </SecaoRelatorio>
      <DetalheJornada id={aberta} onClose={() => setAberta(null)} />
    </>
  );
};
