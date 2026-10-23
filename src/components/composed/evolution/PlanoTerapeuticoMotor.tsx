// Plano terapêutico motor da criança: objetivos (ativos e encerrados, com
// histórico de alterações), criação/edição e gráficos longitudinais.
// Usado na ficha do paciente e na avaliação. Secretaria não vê (o banco
// recusa e o painel some).

import React, { useState } from 'react';
import { History, Plus, Target } from 'lucide-react';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { cn } from '@/lib/utils';
import { usePlanoMotorDados } from '@/hooks/usePlanoMotorDados';
import {
  calcularIdade,
  dataCurta,
  fetchHistoricoObjetivo,
  fmtValor,
  situacaoObjetivo,
  ultimoEstadoDoIndicador,
  ROTULO_STATUS_OBJETIVO,
  type AlteracaoObjetivo,
  type HistoricoMotor,
  type ObjetivoMotor,
  type StatusObjetivo,
} from '@/lib/motora-plano';
import { AREAS_MOTORAS, type AreaMotora } from '@/types/evolucao-clinica';
import { ObjetivoMotorEditor } from './ObjetivoMotorEditor';
import { GraficosMotores } from './GraficosMotores';
import { chipClasse } from './estilos-motora';

const hojeParede = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const ACAO_HIST: Record<string, string> = {
  criado: 'Criado',
  editado: 'Editado',
  status: 'Situação alterada',
};

const ObjetivoResumo: React.FC<{
  o: ObjetivoMotor;
  h: HistoricoMotor;
  onEditar: () => void;
  onStatus: (s: StatusObjetivo, motivo?: string) => Promise<void>;
  podeEditar: boolean;
}> = ({ o, h, onEditar, onStatus, podeEditar }) => {
  const sit = situacaoObjetivo(o, h);
  const un = sit.info?.unidade ?? '';
  const [acao, setAcao] = useState<StatusObjetivo | null>(null);
  const [motivo, setMotivo] = useState('');
  const [hist, setHist] = useState<AlteracaoObjetivo[] | null>(null);
  const [verHist, setVerHist] = useState(false);
  const areas = AREAS_MOTORAS.filter((a) => o.areas.includes(a.id)).map(
    (a) => a.curto
  );

  return (
    <div className="rounded-lg border p-3 space-y-2 bg-background">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium leading-tight">{o.descricao}</p>
          <p className="text-xs text-muted-foreground">
            {areas.join(', ')}
            {sit.info ? ` · ${sit.info.rotulo}` : ''}
          </p>
        </div>
        <Badge
          variant={o.status === 'ativo' ? 'default' : 'secondary'}
          className="shrink-0"
        >
          {ROTULO_STATUS_OBJETIVO[o.status]}
        </Badge>
      </div>
      {sit.info?.numerico && (
        <p className="text-xs">
          {sit.inicial !== undefined && (
            <>Inicial {fmtValor(sit.inicial, un)} · </>
          )}
          {sit.ultimo ? (
            <>
              Último {fmtValor(sit.ultimo.valor, un)} (
              {dataCurta(sit.ultimo.data)})
            </>
          ) : (
            'Sem registro numérico ainda'
          )}
          {o.meta !== null && <> · Meta {fmtValor(o.meta, un)}</>}
        </p>
      )}
      {sit.proporcao !== undefined && (
        <div
          className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
          role="img"
          aria-label={`${Math.round(sit.proporcao * 100)}% do caminho até a meta (não é escala de desenvolvimento)`}
        >
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.round(sit.proporcao * 100)}%` }}
          />
        </div>
      )}
      {ultimoEstadoDoIndicador(o.indicador, h.evolucoes) && (
        <p className="text-xs">
          {ultimoEstadoDoIndicador(o.indicador, h.evolucoes)}
        </p>
      )}
      {o.meta_texto && (
        <p className="text-xs text-muted-foreground">Meta: {o.meta_texto}</p>
      )}
      {o.status !== 'ativo' && (
        <p className="text-xs text-muted-foreground">
          {ROTULO_STATUS_OBJETIVO[o.status]}
          {o.encerrado_em ? ` em ${dataCurta(o.encerrado_em)}` : ''}
          {o.motivo_status ? `: ${o.motivo_status}` : ''}
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {podeEditar && (
          <>
            <button
              type="button"
              onClick={onEditar}
              className="text-primary hover:underline"
            >
              Editar
            </button>
            {(o.status === 'ativo'
              ? (['atingido', 'suspenso', 'encerrado'] as StatusObjetivo[])
              : (['ativo'] as StatusObjetivo[])
            ).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setAcao(acao === s ? null : s)}
                className="text-muted-foreground hover:underline"
              >
                {s === 'ativo'
                  ? 'Reativar'
                  : s === 'atingido'
                    ? 'Marcar atingido'
                    : s === 'suspenso'
                      ? 'Suspender'
                      : 'Encerrar'}
              </button>
            ))}
          </>
        )}
        <button
          type="button"
          className="text-muted-foreground hover:underline inline-flex items-center gap-1"
          onClick={async () => {
            setVerHist((v) => !v);
            if (!hist)
              setHist(await fetchHistoricoObjetivo(o.id).catch(() => []));
          }}
        >
          <History className="h-3 w-3" />
          Histórico
        </button>
      </div>
      {acao && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (opcional)"
          />
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              await onStatus(acao, motivo);
              setAcao(null);
              setMotivo('');
              setHist(null);
            }}
          >
            Confirmar:{' '}
            {acao === 'ativo'
              ? 'reativar'
              : ROTULO_STATUS_OBJETIVO[acao].toLowerCase()}
          </Button>
        </div>
      )}
      {verHist && (
        <ul className="text-xs space-y-1 border-t pt-2">
          {hist === null && (
            <li className="text-muted-foreground">Carregando…</li>
          )}
          {hist?.map((a, i) => (
            <li key={i}>
              <span className="text-muted-foreground">
                {dataCurta(a.alterado_em.slice(0, 10))}
              </span>{' '}
              {ACAO_HIST[a.acao] ?? a.acao}
              {a.acao === 'status' && a.dados.status
                ? `: ${ROTULO_STATUS_OBJETIVO[a.dados.status as StatusObjetivo] ?? a.dados.status}`
                : ''}
              {a.acao !== 'status' && a.dados.descricao
                ? ` — ${a.dados.descricao}`
                : ''}
              {a.dados.meta !== null && a.dados.meta !== undefined
                ? ` (meta ${a.dados.meta})`
                : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export interface PlanoTerapeuticoMotorProps {
  pacienteId: string;
  origem: 'plano' | 'avaliacao';
  origemId?: string;
  /** Na ficha: some quando a criança não tem nada motor registrado */
  ocultarSeVazio?: boolean;
  mostrarGraficos?: boolean;
  areasSugeridas?: AreaMotora[];
  className?: string;
}

export const PlanoTerapeuticoMotor: React.FC<PlanoTerapeuticoMotorProps> = ({
  pacienteId,
  origem,
  origemId,
  ocultarSeVazio = false,
  mostrarGraficos = true,
  areasSugeridas,
  className,
}) => {
  const plano = usePlanoMotorDados({
    pacienteId,
    ativo: true,
    dataSessao: hojeParede(),
  });
  const [editor, setEditor] = useState<'novo' | ObjetivoMotor | null>(null);
  const [filtro, setFiltro] = useState<'ativos' | 'encerrados'>('ativos');

  if (!plano || plano.erro) return null;
  const h = plano.historico;
  const objetivos = plano.objetivos ?? [];
  if (!h) {
    return ocultarSeVazio ? null : (
      <p className="text-sm text-muted-foreground">
        Carregando o plano terapêutico…
      </p>
    );
  }
  const vazio =
    objetivos.length === 0 &&
    h.evolucoes.length === 0 &&
    h.medidas.length === 0;
  if (ocultarSeVazio && vazio) return null;

  const idade = calcularIdade(
    h.data_nascimento,
    h.idade_gestacional_semanas,
    hojeParede()
  );
  const lista = objetivos.filter((o) =>
    filtro === 'ativos' ? o.status === 'ativo' : o.status !== 'ativo'
  );

  return (
    <section
      className={cn('rounded-xl border bg-card p-4 space-y-4', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Target className="h-5 w-5" />
          Plano terapêutico motor
        </h2>
        {editor === null && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditor('novo')}
          >
            <Plus className="h-4 w-4 mr-1" />
            Novo objetivo
          </Button>
        )}
      </div>
      {idade && (
        <p className="text-sm text-muted-foreground">
          Idade hoje: {idade.cronologica_texto}
          {idade.corrigida_texto
            ? ` · corrigida: ${idade.corrigida_texto}`
            : ''}
          {idade.observacao ? ` · ${idade.observacao}` : ''}
        </p>
      )}

      {editor !== null && (
        <ObjetivoMotorEditor
          pacienteId={pacienteId}
          inicial={editor === 'novo' ? undefined : editor}
          areasSugeridas={areasSugeridas}
          jaNoPlano={objetivos
            .filter((o) => o.status === 'ativo')
            .map((o) => o.descricao)}
          origem={origem}
          origemId={origemId}
          onSalvar={async (o) => {
            await plano.salvarObjetivo(o);
            setEditor(null);
          }}
          onCancelar={() => setEditor(null)}
        />
      )}

      <div className="space-y-2">
        <div className="flex gap-1.5">
          {(['ativos', 'encerrados'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
              className={chipClasse(filtro === f)}
            >
              {f === 'ativos' ? 'Ativos' : 'Atingidos, suspensos e encerrados'}{' '}
              (
              {
                objetivos.filter((o) =>
                  f === 'ativos' ? o.status === 'ativo' : o.status !== 'ativo'
                ).length
              }
              )
            </button>
          ))}
        </div>
        {lista.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {filtro === 'ativos'
              ? 'Nenhum objetivo ativo. Crie um aqui ou na própria evolução.'
              : 'Nenhum objetivo encerrado.'}
          </p>
        )}
        {lista.map((o) => (
          <ObjetivoResumo
            key={o.id}
            o={o}
            h={h}
            podeEditar={editor === null}
            onEditar={() => setEditor(o)}
            onStatus={(s, m) => plano.mudarStatus(o.id, s, m)}
          />
        ))}
      </div>

      {mostrarGraficos && (
        <div className="space-y-2 border-t pt-4">
          <h3 className="font-semibold">Evolução dos indicadores</h3>
          <GraficosMotores historico={h} objetivos={objetivos} />
        </div>
      )}
    </section>
  );
};
