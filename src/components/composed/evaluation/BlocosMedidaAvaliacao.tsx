// Blocos de medida da avaliação usados também na evolução motora, para os
// dados serem gravados no mesmo formato e comparáveis entre si:
// FSOS-2 e tensão neuromeníngea. (Extraídos de EvaluationSectionContent.)

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import type {
  FSOS2,
  FSOS2ItemsPorPosicao,
  TensaoNeuromeningeaDetalhada,
  TensaoNeuromeningeaAvaliacao,
  TensaoNeuromeningeaSintoma,
} from '@/types/avaliacoes-clinicas';
import {
  FSOS2_ITENS,
  FSOS2_PONTUACAO,
  FSOS2_POSICOES,
  TENSAO_SINTOMAS_OPCOES,
  TENSAO_END_FEEL_OPCOES,
} from '@/types/avaliacoes-clinicas';

const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, children, className }) => (
  <div className={cn('space-y-2', className)}>
    <Label className="text-sm font-medium">{label}</Label>
    {children}
  </div>
);

export interface FSOS2BlocoProps {
  dados: FSOS2 | null | undefined;
  onChange: (v: FSOS2) => void;
  isReadOnly?: boolean;
}

export const FSOS2Bloco: React.FC<FSOS2BlocoProps> = ({
  dados,
  onChange,
  isReadOnly = false,
}) => {
  const fsos = (dados || {}) as FSOS2;

  // Função para calcular subtotal de uma posição
  const calcularSubtotalPosicao = (
    posicaoData: FSOS2ItemsPorPosicao | undefined
  ): number => {
    if (!posicaoData) return 0;
    return FSOS2_ITENS.reduce((total, item) => {
      const valor = posicaoData[item.id as keyof FSOS2ItemsPorPosicao];
      return total + (typeof valor === 'number' ? valor : 0);
    }, 0);
  };

  // Calcular subtotais e total
  const subtotais = {
    supino: calcularSubtotalPosicao(fsos.supino),
    prono: calcularSubtotalPosicao(fsos.prono),
    sentado: calcularSubtotalPosicao(fsos.sentado),
    em_pe: calcularSubtotalPosicao(fsos.em_pe),
  };
  const scoreTotal =
    subtotais.supino + subtotais.prono + subtotais.sentado + subtotais.em_pe;

  // Atualiza um item e recalcula o total com o valor novo
  const handleFSOS2Change = (
    posicao: 'supino' | 'prono' | 'sentado' | 'em_pe',
    itemId: string,
    valor: number | string
  ) => {
    const novo: FSOS2 = {
      ...fsos,
      [posicao]: { ...(fsos[posicao] || {}), [itemId]: valor },
    };
    const total = (['supino', 'prono', 'sentado', 'em_pe'] as const)
      .map((p) => calcularSubtotalPosicao(novo[p]))
      .reduce((x, y) => x + y, 0);
    onChange({ ...novo, score_total: total });
  };

  return (
    <div className="space-y-6">
      {/* Explicação Geral */}
      <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
          <span>📊</span>
          FSOS-2 - Escala de Observação de Simetria Funcional
        </h4>
        <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
          Avalia o <strong>quão simétrico</strong> está o comportamento motor do
          bebê em cada posição. Observa se os movimentos são iguais dos dois
          lados, se há preferência de um lado, e se existem padrões posturais ou
          motores assimétricos.
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-300 italic">
          💡 Dica: Observe por pelo menos 1-2 minutos por posição, sem
          interferir demais no movimento natural.
        </p>
      </div>

      {/* Legenda de Pontuação */}
      <div className="p-3 bg-muted/50 rounded-lg">
        <h5 className="font-medium text-sm mb-2">Pontuação (0 a 4):</h5>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          {FSOS2_PONTUACAO.map((pont) => (
            <div
              key={pont.valor}
              className="text-xs p-2 bg-background rounded border"
            >
              <span className="font-bold text-primary">{pont.valor}</span>
              <span className="text-muted-foreground ml-1">
                - {pont.label.split(' - ')[1]}
              </span>
              <p className="text-muted-foreground/70 mt-0.5 text-[10px]">
                {pont.descricao}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Seções por Posição */}
      {FSOS2_POSICOES.map((posicao) => {
        const posicaoData = (fsos[posicao.id as keyof FSOS2] ||
          {}) as FSOS2ItemsPorPosicao;
        const subtotal = subtotais[posicao.id as keyof typeof subtotais];
        const porcentagem = Math.round((subtotal / 28) * 100);

        return (
          <details
            key={posicao.id}
            open={posicao.id === 'supino'}
            className="group border rounded-lg overflow-hidden"
          >
            <summary className="w-full flex items-center justify-between px-4 py-3 text-base font-semibold hover:bg-muted/50 cursor-pointer list-none">
              <div className="flex items-center gap-2">
                <span className="text-lg">{posicao.icone}</span>
                <span>{posicao.label}</span>
                <Badge
                  variant={
                    porcentagem >= 75
                      ? 'default'
                      : porcentagem >= 50
                        ? 'secondary'
                        : 'destructive'
                  }
                  className="ml-2"
                >
                  {subtotal}/28 ({porcentagem}%)
                </Badge>
              </div>
              <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="border-t">
              <div className="divide-y">
                {FSOS2_ITENS.map((item, index) => {
                  const valorAtual = posicaoData[
                    item.id as keyof FSOS2ItemsPorPosicao
                  ] as number | undefined;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'p-3',
                        index % 2 === 0 ? 'bg-background' : 'bg-muted/30'
                      )}
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center">
                              {index + 1}
                            </span>
                            {item.label}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 ml-7">
                            {item.descricao}
                          </p>
                        </div>
                        <div className="flex gap-1 ml-7 md:ml-0">
                          {FSOS2_PONTUACAO.map((pont) => (
                            <button
                              key={pont.valor}
                              type="button"
                              onClick={() =>
                                !isReadOnly &&
                                handleFSOS2Change(
                                  posicao.id as
                                    | 'supino'
                                    | 'prono'
                                    | 'sentado'
                                    | 'em_pe',
                                  item.id,
                                  pont.valor
                                )
                              }
                              disabled={isReadOnly}
                              title={pont.descricao}
                              className={cn(
                                'w-10 h-10 rounded-lg font-bold text-sm transition-all',
                                valorAtual === pont.valor
                                  ? pont.valor === 4
                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                    : pont.valor === 3
                                      ? 'bg-lime-500 text-white border-2 border-lime-600'
                                      : pont.valor === 2
                                        ? 'bg-yellow-500 text-white border-2 border-yellow-600'
                                        : pont.valor === 1
                                          ? 'bg-orange-500 text-white border-2 border-orange-600'
                                          : 'bg-red-500 text-white border-2 border-red-600'
                                  : 'bg-muted border-2 border-border hover:border-primary/50',
                                isReadOnly && 'cursor-default'
                              )}
                            >
                              {pont.valor}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Observações por posição */}
              <div className="p-3 border-t bg-muted/20">
                <Field label="Observações">
                  <Textarea
                    value={posicaoData.observacoes || ''}
                    onChange={(e) =>
                      handleFSOS2Change(
                        posicao.id as 'supino' | 'prono' | 'sentado' | 'em_pe',
                        'observacoes',
                        e.target.value
                      )
                    }
                    disabled={isReadOnly}
                    placeholder={`Observações sobre a posição ${posicao.label.toLowerCase()}...`}
                    className="min-h-[60px]"
                  />
                </Field>
              </div>
            </div>
          </details>
        );
      })}

      {/* Score Total */}
      <div className="p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-lg">Score Total FSOS-2</h4>
            <p className="text-sm text-muted-foreground">
              Quanto maior, mais simétrico o comportamento motor
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-primary">{scoreTotal}</p>
            <p className="text-sm text-muted-foreground">/112 pontos</p>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="mt-3">
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all',
                scoreTotal >= 84
                  ? 'bg-green-500'
                  : scoreTotal >= 56
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
              )}
              style={{ width: `${(scoreTotal / 112) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>Assimétrico</span>
            <span>Simétrico</span>
          </div>
        </div>

        {/* Resumo por posição */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          {FSOS2_POSICOES.map((posicao) => {
            const subtotal = subtotais[posicao.id as keyof typeof subtotais];
            return (
              <div
                key={posicao.id}
                className="text-center p-2 bg-background rounded"
              >
                <p className="text-lg">{posicao.icone}</p>
                <p className="text-xs text-muted-foreground">{posicao.label}</p>
                <p className="font-bold">{subtotal}/28</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export interface TensaoNeuromeningeaBlocoProps {
  dados: TensaoNeuromeningeaDetalhada | null | undefined;
  onChange: (v: TensaoNeuromeningeaDetalhada) => void;
  isReadOnly?: boolean;
  /** mostra a dica de correlação quando há goniometria registrada */
  temGoniometria?: boolean;
}

export const TensaoNeuromeningeaBloco: React.FC<
  TensaoNeuromeningeaBlocoProps
> = ({ dados, onChange, isReadOnly = false, temGoniometria = false }) => {
  const tensaoData = (dados || {}) as TensaoNeuromeningeaDetalhada;

  // Handler para atualizar um membro específico
  const handleTensaoChange = (
    membro: keyof TensaoNeuromeningeaDetalhada,
    campo: keyof TensaoNeuromeningeaAvaliacao,
    valor: unknown
  ) => {
    const membroAtual = (tensaoData[membro] ||
      {}) as TensaoNeuromeningeaAvaliacao;
    onChange({
      ...tensaoData,
      [membro]: {
        ...membroAtual,
        [campo]: valor,
      },
    });
  };

  // Handler para toggle de sintomas
  const handleSintomaToggle = (
    membro: keyof TensaoNeuromeningeaDetalhada,
    sintoma: TensaoNeuromeningeaSintoma
  ) => {
    const membroAtual = (tensaoData[membro] ||
      {}) as TensaoNeuromeningeaAvaliacao;
    const sintomasAtuais = membroAtual.sintomas || [];
    const novosSintomas = sintomasAtuais.includes(sintoma)
      ? sintomasAtuais.filter((s) => s !== sintoma)
      : [...sintomasAtuais, sintoma];
    handleTensaoChange(membro, 'sintomas', novosSintomas);
  };

  // Verifica se há algum teste positivo
  const temTestePositivo =
    tensaoData.membro_superior_direito?.status === 'alterado' ||
    tensaoData.membro_superior_esquerdo?.status === 'alterado' ||
    tensaoData.membro_inferior_direito?.status === 'alterado' ||
    tensaoData.membro_inferior_esquerdo?.status === 'alterado' ||
    tensaoData.flexao_passiva_pescoco?.status === 'alterado';

  // Verifica assimetria entre lados
  const assimetriaSuperior =
    tensaoData.membro_superior_direito?.status !==
      tensaoData.membro_superior_esquerdo?.status &&
    tensaoData.membro_superior_direito?.status !== 'nao_testado' &&
    tensaoData.membro_superior_esquerdo?.status !== 'nao_testado';
  const assimetriaInferior =
    tensaoData.membro_inferior_direito?.status !==
      tensaoData.membro_inferior_esquerdo?.status &&
    tensaoData.membro_inferior_direito?.status !== 'nao_testado' &&
    tensaoData.membro_inferior_esquerdo?.status !== 'nao_testado';

  // Componente para card de avaliação de membro
  const TensaoCard = ({
    titulo,
    icone,
    membro,
    corBg,
  }: {
    titulo: string;
    icone: string;
    membro: keyof TensaoNeuromeningeaDetalhada;
    corBg: string;
  }) => {
    const dados = (tensaoData[membro] || {}) as TensaoNeuromeningeaAvaliacao;
    const isAlterado = dados.status === 'alterado';

    return (
      <div
        className={cn(
          'border rounded-lg overflow-hidden',
          isAlterado ? 'border-red-300 dark:border-red-800' : 'border-border'
        )}
      >
        <div className={cn('px-4 py-2 border-b', corBg)}>
          <h5 className="font-semibold flex items-center gap-2 text-sm">
            <span>{icone}</span>
            {titulo}
          </h5>
        </div>
        <div className="p-4 space-y-4">
          {/* Toggle Normal/Alterado */}
          <div className="flex gap-2">
            {['normal', 'alterado', 'nao_testado'].map((status) => {
              const isSelected = dados.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() =>
                    !isReadOnly && handleTensaoChange(membro, 'status', status)
                  }
                  disabled={isReadOnly}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all border-2',
                    status === 'normal' && isSelected
                      ? 'bg-green-500 text-white border-green-600'
                      : status === 'alterado' && isSelected
                        ? 'bg-red-500 text-white border-red-600'
                        : status === 'nao_testado' && isSelected
                          ? 'bg-gray-400 text-white border-gray-500'
                          : 'bg-muted border-border hover:border-primary/50',
                    isReadOnly && 'cursor-default'
                  )}
                >
                  {status === 'normal'
                    ? '✓ Normal'
                    : status === 'alterado'
                      ? '⚠ Alterado'
                      : '— Não testado'}
                </button>
              );
            })}
          </div>

          {/* Se Alterado, mostrar opções */}
          {isAlterado && (
            <div className="space-y-3 pt-2 border-t">
              <p className="text-sm font-medium text-muted-foreground">
                O que foi observado?
              </p>
              <div className="flex flex-wrap gap-2">
                {TENSAO_SINTOMAS_OPCOES.map((sintoma) => {
                  const isSelected = (dados.sintomas || []).includes(
                    sintoma.valor as TensaoNeuromeningeaSintoma
                  );
                  return (
                    <button
                      key={sintoma.valor}
                      type="button"
                      onClick={() =>
                        !isReadOnly &&
                        handleSintomaToggle(
                          membro,
                          sintoma.valor as TensaoNeuromeningeaSintoma
                        )
                      }
                      disabled={isReadOnly}
                      title={sintoma.descricao}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5',
                        isSelected
                          ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-2 border-red-300 dark:border-red-700'
                          : 'bg-muted border-2 border-transparent hover:border-primary/30',
                        isReadOnly && 'cursor-default'
                      )}
                    >
                      <span>{sintoma.icone}</span>
                      {sintoma.label}
                    </button>
                  );
                })}
              </div>

              {/* End-Feel */}
              <div className="pt-2">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Sensação final (End-feel):
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {TENSAO_END_FEEL_OPCOES.map((opt) => {
                    const isSelected = dados.endFeel === opt.valor;
                    return (
                      <button
                        key={opt.valor}
                        type="button"
                        onClick={() =>
                          !isReadOnly &&
                          handleTensaoChange(membro, 'endFeel', opt.valor)
                        }
                        disabled={isReadOnly}
                        className={cn(
                          'p-2 rounded-lg text-xs text-center transition-all border-2',
                          isSelected
                            ? 'bg-primary/10 border-primary'
                            : 'bg-background border-border hover:border-primary/50',
                          isReadOnly && 'cursor-default'
                        )}
                      >
                        <p className="font-medium">{opt.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Explicação Geral */}
      <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
          <span>🔌</span>
          Tensão Neuromeníngea - Testes Neurodinâmicos
        </h4>
        <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
          Avalia a <strong>mobilidade do sistema nervoso</strong>. São testes
          provocativos onde observamos a resposta do bebê ao alongamento das
          estruturas neurais.
        </p>

        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900">
          <p className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
            <span>👶</span>
            <span>
              <strong>Em pediatria (0-3 anos):</strong> O bebê não relata dor
              verbalmente. Observe: <strong>Choro</strong>,{' '}
              <strong>Resistência muscular</strong>,
              <strong>Retração do membro</strong> ou{' '}
              <strong>Expressão facial de dor</strong>.
            </span>
          </p>
        </div>
      </div>

      {/* Membros Superiores */}
      <div>
        <h5 className="font-semibold mb-2 flex items-center gap-2">
          <span>💪</span>
          Membros Superiores
          <span className="text-xs font-normal text-muted-foreground">
            (Plexo Braquial / ULTT)
          </span>
        </h5>

        {/* Instruções do teste */}
        <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-800 text-sm">
          <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">
            📋 Como realizar:
          </p>
          <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1 ml-4 list-decimal">
            <li>Bebê em supino, estabilize o ombro</li>
            <li>Abdução do ombro a 90° + extensão do cotovelo</li>
            <li>Adicione extensão do punho e dedos</li>
            <li>Observe a reação do bebê durante todo o movimento</li>
          </ol>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 italic">
            💡 Comparar sempre os dois lados. A diferença de resposta é mais
            importante que o resultado isolado.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TensaoCard
            titulo="Direito"
            icone="👉"
            membro="membro_superior_direito"
            corBg="bg-blue-50 dark:bg-blue-950/30"
          />
          <TensaoCard
            titulo="Esquerdo"
            icone="👈"
            membro="membro_superior_esquerdo"
            corBg="bg-purple-50 dark:bg-purple-950/30"
          />
        </div>
      </div>

      {/* Membros Inferiores */}
      <div>
        <h5 className="font-semibold mb-2 flex items-center gap-2">
          <span>🦵</span>
          Membros Inferiores
          <span className="text-xs font-normal text-muted-foreground">
            (SLR - Elevação da Perna Estendida)
          </span>
        </h5>

        {/* Instruções do teste */}
        <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-800 text-sm">
          <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">
            📋 Como realizar:
          </p>
          <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1 ml-4 list-decimal">
            <li>Bebê em supino, estabilize a pelve</li>
            <li>Mantenha o joelho em extensão</li>
            <li>Eleve lentamente a perna (flexão de quadril)</li>
            <li>Observe resistência, choro ou retração durante a elevação</li>
          </ol>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 italic">
            💡 Normal: elevação livre até ~70-90°. Positivo se houver
            resistência precoce ou reação adversa.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TensaoCard
            titulo="Direito"
            icone="👉"
            membro="membro_inferior_direito"
            corBg="bg-blue-50 dark:bg-blue-950/30"
          />
          <TensaoCard
            titulo="Esquerdo"
            icone="👈"
            membro="membro_inferior_esquerdo"
            corBg="bg-purple-50 dark:bg-purple-950/30"
          />
        </div>
      </div>

      {/* Neuroeixo */}
      <div>
        <h5 className="font-semibold mb-2 flex items-center gap-2">
          <span>🧠</span>
          Neuroeixo
          <span className="text-xs font-normal text-muted-foreground">
            (Flexão Passiva do Pescoço)
          </span>
        </h5>

        {/* Instruções do teste */}
        <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-800 text-sm">
          <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">
            📋 Como realizar:
          </p>
          <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1 ml-4 list-decimal">
            <li>Bebê em supino, relaxado</li>
            <li>Apoie a cabeça com ambas as mãos</li>
            <li>
              Flexione passivamente o pescoço (queixo em direção ao peito)
            </li>
            <li>Observe resistência, extensão dos membros ou choro</li>
          </ol>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 italic">
            💡 Teste de tensão meníngea. Positivo se houver extensão reflexa dos
            membros ou resistência à flexão.
          </p>
        </div>

        <TensaoCard
          titulo="Flexão Passiva do Pescoço"
          icone="🔄"
          membro="flexao_passiva_pescoco"
          corBg="bg-green-50 dark:bg-green-950/30"
        />
      </div>

      {/* Alertas Automáticos */}
      {(temTestePositivo || assimetriaSuperior || assimetriaInferior) && (
        <div className="space-y-2">
          {temTestePositivo && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 flex items-start gap-2">
              <span>🚨</span>
              <div className="text-sm text-red-800 dark:text-red-200">
                <strong>Tensão Neural Alterada detectada!</strong>
                <p className="text-xs mt-1">
                  Evitar alongamento passivo forçado neste segmento. Tratamento
                  deve incluir mobilização neural suave.
                </p>
              </div>
            </div>
          )}
          {assimetriaSuperior && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-start gap-2">
              <span>⚠️</span>
              <span className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Assimetria nos Membros Superiores:</strong> Respostas
                diferentes entre lados.
              </span>
            </div>
          )}
          {assimetriaInferior && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-start gap-2">
              <span>⚠️</span>
              <span className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Assimetria nos Membros Inferiores:</strong> Respostas
                diferentes entre lados.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Correlação com Goniometria */}
      {temTestePositivo && temGoniometria && (
        <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-900">
          <h5 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
            <span>🔗</span>
            Correlação com Goniometria
          </h5>
          <p className="text-sm text-indigo-800 dark:text-indigo-200">
            A restrição de movimento pode possuir{' '}
            <strong>componente neural</strong>. O tratamento deve incluir{' '}
            <strong>mobilização neural suave</strong>, não apenas muscular.
          </p>
        </div>
      )}

      {/* Observações Gerais */}
      <Field label="Observações gerais">
        <Textarea
          value={tensaoData.observacoes_gerais || ''}
          onChange={(e) =>
            onChange({
              ...tensaoData,
              observacoes_gerais: e.target.value,
            })
          }
          disabled={isReadOnly}
          placeholder="Observações sobre a avaliação de tensão neuromeníngea..."
        />
      </Field>
    </div>
  );
};
