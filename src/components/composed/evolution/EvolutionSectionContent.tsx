import React from 'react';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import { Input } from '@/components/primitives/input';
import { Checkbox } from '@/components/primitives/checkbox';
import { Button } from '@/components/primitives/button';
import { RadioButtonGroup } from '@/components/composed/evaluation/inputs/RadioButtonGroup';
import { BooleanToggle } from '@/components/composed/evaluation/inputs/BooleanToggle';
import { cn } from '@/lib/utils';
import { AjudaParametroBotao } from './AjudaParametroBotao';
import type {
  TipoEvolucao,
  EvolucaoRespiratoria,
  EvolucaoMotoraAssimetria,
  EstadoGeralAntes,
  PadraoRespiratorio,
  SinaisDispneia,
  RitmoRespiratorio,
  AuscultaPulmonar,
  AuscultaHemitorax,
  RuidoAdventicio,
  LocalizacaoRuido,
  IntervencaoRespiratoria,
  AvaliacaoRespiratoriaDepois,
  OrientacoesRespiratoria,
  CondutaRespiratoria,
  CraniometriaEvolucao,
  GoniometriaEvolucao,
  PalpacaoECOMEvolucao,
  ControleMotorEvolucao,
  IntervencaoMotoraAssimetria,
  RespostaIntervencaoMotora,
  OrientacoesMotoraAssimetria,
  CondutaMotoraAssimetria,
  RespostaObservada,
  AdesaoDomiciliar,
  TipoMedidaMotora,
  MedicaoSessao,
  ProximaReavaliacao,
} from '@/types/evolucao-clinica';
import { medidasComValores } from '@/lib/motora-medidas';
import {
  EXERCICIOS_DOMICILIARES,
  TUMMY_MINUTOS,
  TUMMY_VEZES,
  textoTummyTime,
  type TummyMinutos,
  type TummyVezes,
} from '@/lib/motora-catalogo';
import {
  MedicaoSessaoBloco,
  ReavaliacoesConduta,
  ComparacaoCraniometria,
  ComparacaoGoniometria,
} from './MedicoesMotoras';
import { ObjetivosHabilidadesSecao } from './ObjetivosHabilidadesSecao';
import {
  IntervencoesSecao,
  IntervencaoSessaoSecao,
  RespostaSessaoSecao,
} from './IntervencoesRespostaSecoes';
import {
  ehFormatoMotoraV13,
  ehFormatoMotoraV14,
  LOCAIS_BLOQUEIO,
  LADOS_MAIS_TENSO,
  type TensaoRegiao,
  type LocalBloqueio,
  type LadoMaisTenso,
  secoesMotorasVisiveis,
  calcularMetricasCraniometriaEvolucao,
  calcularDiferencasGoniometria,
  classificarDiferencaCervical,
  ladoMenorAmplitude,
  TEXTO_FAIXAS_DIFERENCA_CERVICAL,
  ROTULO_PLAGIOCEFALIA,
  ROTULO_BRAQUICEFALIA,
  itensRespostaVisiveis,
  capaceteVisivel,
  calcularClassificacaoClinica,
  getTextoClassificacaoClinica,
  getAvaliacaoRespiratoriaNormal,
  RUIDOS_ADVENTICIOS,
  LOCALIZACOES_RUIDO,
  auscultaInicialLimpa,
  MOTIVOS_SEM_ORIENTACAO,
  type MotivoSemOrientacao,
} from '@/types/evolucao-clinica';

// AI dev note: EvolutionSectionContent - Renderiza conteúdo de cada seção da evolução
// Suporta evolução respiratória e motora/assimetria

// Constantes para Quadro Compatível Com (em ordem alfabética)
const QUADROS_COMPATIVEIS = [
  'Adenovírus',
  'Amigdalite / Faringite',
  'Asma (ou Bronquite Asmática)',
  'Atelectasia',
  'Bocavírus Humano',
  'Bronquiolite',
  'Bronquiolite Obliterante',
  'Coqueluche',
  'Coronavírus Sazonais (229E, NL63, OC43, HKU1)',
  'Derrame Pleural',
  'Gripe (Influenza)',
  'Hipertrofia de Adenoide (Carne esponjosa)',
  'Influenza A (H1N1, H3N2)',
  'Influenza B',
  'Laringite (Crupe)',
  'Metapneumovírus Humano',
  'Otite Média (Infecção de ouvido)',
  'Parainfluenza (Tipos 1, 2, 3 e 4)',
  'Pneumonia',
  'Resfriado Comum',
  'Rinite Alérgica',
  'Rinovírus / Enterovírus',
  'SARS-CoV-2 (COVID-19)',
  'Sinusite',
  'Vírus Sincicial Respiratório (VSR)',
];

// Constantes para Origem da Informação do Quadro
const ORIGENS_INFORMACAO_QUADRO = [
  'Diagnóstico médico informado',
  'Relato dos responsáveis',
  'Observação clínica durante avaliação',
  'Documento/exame apresentado',
  'Não informado',
];

interface EvolutionSectionContentProps {
  tipoEvolucao: TipoEvolucao;
  secaoId: string;
  evolucaoRespiratoria: EvolucaoRespiratoria;
  evolucaoMotora: EvolucaoMotoraAssimetria;
  onRespiratoriaChange: (updates: Partial<EvolucaoRespiratoria>) => void;
  onMotoraChange: (updates: Partial<EvolucaoMotoraAssimetria>) => void;
  disabled?: boolean;
}

// Componente auxiliar para campos
const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
  ajuda?: string; // chave em AJUDA_MOTORA: mostra o "?" ao lado do nome
}> = ({ label, children, className, required, ajuda }) => (
  <div className={cn('space-y-2', className)}>
    <div className="flex items-center gap-1 min-h-7">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {ajuda && <AjudaParametroBotao id={ajuda} />}
    </div>
    {children}
  </div>
);

// Título de bloco com o "?" ao lado (ex.: "Rotação Cervical (graus)")
const TituloComAjuda: React.FC<{
  ajuda: string;
  className?: string;
  children: React.ReactNode;
}> = ({ ajuda, className, children }) => (
  <div className="flex items-center gap-1">
    <h4 className={cn('font-medium', className)}>{children}</h4>
    <AjudaParametroBotao id={ajuda} />
  </div>
);

// Componente auxiliar para checkbox
const CheckboxField: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ajuda?: string;
}> = ({ label, checked, onChange, disabled, ajuda }) => (
  <div className="flex items-center gap-2">
    <Checkbox
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
    />
    <Label className="text-sm cursor-pointer">{label}</Label>
    {ajuda && <AjudaParametroBotao id={ajuda} />}
  </div>
);

// Botões pequenos de escolha única (desmarca ao tocar de novo)
const EscolhaCurta: React.FC<{
  opcoes: { id: string; nome: string }[];
  valor?: string | null;
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
  rotulo: string;
}> = ({ opcoes, valor, onChange, disabled, rotulo }) => (
  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={rotulo}>
    {opcoes.map((o) => (
      <Button
        key={o.id}
        type="button"
        size="sm"
        role="radio"
        aria-checked={valor === o.id}
        variant={valor === o.id ? 'default' : 'outline'}
        onClick={() => onChange(valor === o.id ? undefined : o.id)}
        disabled={disabled}
        className="h-8"
      >
        {o.nome}
      </Button>
    ))}
  </div>
);

// Musculatura cervical (posterior ou anterior): normal ou tensa, e o lado
const TensaoRegiaoCampo: React.FC<{
  titulo: string;
  valor?: TensaoRegiao;
  onChange: (v: TensaoRegiao | undefined) => void;
  disabled?: boolean;
}> = ({ titulo, valor, onChange, disabled }) => (
  <div className="border rounded-lg p-4 space-y-3">
    <h4 className="font-medium flex items-center gap-1">
      {titulo}
      <AjudaParametroBotao id="cervical_tensao" />
    </h4>
    <EscolhaCurta
      rotulo={`Tônus: ${titulo}`}
      opcoes={[
        { id: 'normal', nome: 'Normal' },
        { id: 'tensa', nome: 'Tensa' },
      ]}
      valor={valor?.tonus}
      onChange={(t) =>
        onChange(
          t
            ? {
                tonus: t as TensaoRegiao['tonus'],
                ...(t === 'tensa' && valor?.lado ? { lado: valor.lado } : {}),
              }
            : undefined
        )
      }
      disabled={disabled}
    />
    {valor?.tonus === 'tensa' && (
      <div className="space-y-1.5 pl-1">
        <p className="text-xs text-muted-foreground">Lado mais tenso</p>
        <EscolhaCurta
          rotulo={`Lado mais tenso: ${titulo}`}
          opcoes={LADOS_MAIS_TENSO}
          valor={valor.lado}
          onChange={(l) =>
            onChange({
              tonus: 'tensa',
              ...(l ? { lado: l as LadoMaisTenso } : {}),
            })
          }
          disabled={disabled}
        />
      </div>
    )}
  </div>
);

// "Nenhuma orientação nesta sessão": distingue "não orientou" de esquecido.
// Marcar desliga as orientações da lista; o motivo é opcional.
const SemOrientacaoBloco: React.FC<{
  marcado: boolean;
  motivo?: MotivoSemOrientacao | null;
  onMarcar: (marcado: boolean) => void;
  onMotivo: (m: MotivoSemOrientacao | null) => void;
  disabled?: boolean;
}> = ({ marcado, motivo, onMarcar, onMotivo, disabled }) => (
  <div
    className={cn(
      'rounded-lg border p-4 space-y-3',
      marcado ? 'border-amber-300 bg-amber-50' : 'bg-muted/20'
    )}
  >
    <CheckboxField
      label="Nenhuma orientação nesta sessão"
      checked={marcado}
      onChange={onMarcar}
      disabled={disabled}
    />
    {marcado && (
      <div className="space-y-1.5 pl-6">
        <p className="text-xs text-muted-foreground">Motivo (opcional)</p>
        <div className="flex flex-wrap gap-2">
          {MOTIVOS_SEM_ORIENTACAO.map((m) => (
            <Button
              key={m.valor}
              type="button"
              size="sm"
              variant={motivo === m.valor ? 'default' : 'outline'}
              aria-pressed={motivo === m.valor}
              onClick={() => onMotivo(motivo === m.valor ? null : m.valor)}
              disabled={disabled}
              className="h-8"
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>
    )}
  </div>
);

// Componente auxiliar para BooleanToggle com label
const BooleanField: React.FC<{
  label: string;
  value: boolean | null | undefined;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}> = ({ label, value, onChange, disabled, className }) => (
  <div
    className={cn(
      'flex items-center justify-between p-3 bg-muted/30 rounded-lg',
      className
    )}
  >
    <Label className="text-sm font-medium">{label}</Label>
    <BooleanToggle value={value} onChange={onChange} disabled={disabled} />
  </div>
);

// Escolha única sem nada marcado de início: em branco significa "não
// registrado". Tocar de novo na opção escolhida limpa a resposta.
type OpcaoEscolha<T> = { valor: T; label: string; ativo: string };

const ATIVO_SIM = 'bg-emerald-500 border-emerald-500 text-white';
const ATIVO_PARCIAL = 'bg-amber-500 border-amber-500 text-white';
const ATIVO_NAO = 'bg-rose-500 border-rose-500 text-white';
const ATIVO_NEUTRO = 'bg-slate-500 border-slate-500 text-white';

const OPCOES_RESPOSTA: OpcaoEscolha<RespostaObservada>[] = [
  { valor: true, label: 'Sim', ativo: ATIVO_SIM },
  { valor: false, label: 'Não', ativo: ATIVO_NAO },
  { valor: 'nao_avaliado', label: 'Não avaliado', ativo: ATIVO_NEUTRO },
];

const OPCOES_ADESAO: OpcaoEscolha<AdesaoDomiciliar>[] = [
  { valor: 'sim', label: 'Sim', ativo: ATIVO_SIM },
  { valor: 'parcial', label: 'Parcialmente', ativo: ATIVO_PARCIAL },
  { valor: 'nao', label: 'Não', ativo: ATIVO_NAO },
  { valor: 'nao_informado', label: 'Não informado', ativo: ATIVO_NEUTRO },
];

function EscolhaField<T extends string | boolean>({
  label,
  value,
  onChange,
  opcoes,
  disabled,
  ajuda,
}: {
  label: string;
  value: T | null | undefined;
  onChange: (value: T | undefined) => void;
  opcoes: OpcaoEscolha<T>[];
  disabled?: boolean;
  ajuda?: string;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-1 min-h-7">
        <Label className="text-sm font-medium">{label}</Label>
        {ajuda && <AjudaParametroBotao id={ajuda} />}
      </div>
      <div
        className={cn(
          'grid gap-2',
          opcoes.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
        )}
        role="radiogroup"
        aria-label={label}
      >
        {opcoes.map((op) => {
          const selecionado = value === op.valor;
          return (
            <button
              key={String(op.valor)}
              type="button"
              role="radio"
              aria-checked={selecionado}
              disabled={disabled}
              onClick={() => onChange(selecionado ? undefined : op.valor)}
              className={cn(
                'min-h-11 py-2 px-1 rounded-lg border-2 font-medium transition-all text-[13px] sm:text-sm whitespace-nowrap',
                selecionado
                  ? op.ativo
                  : 'bg-background border-border text-muted-foreground hover:bg-muted',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {op.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const RespostaField: React.FC<{
  label: string;
  value: RespostaObservada | null | undefined;
  onChange: (value: RespostaObservada | undefined) => void;
  disabled?: boolean;
  ajuda?: string;
}> = (props) => <EscolhaField {...props} opcoes={OPCOES_RESPOSTA} />;

// Ausculta de um hemitórax. Cada ruído marcado abre logo abaixo a pergunta
// "onde?" (ex.: marcou roncos → onde estão os roncos?), em vez de uma
// localização única que não dizia qual ruído estava onde.
const HemitoraxAuscultaCard: React.FC<{
  titulo: string;
  className?: string;
  tituloClassName?: string;
  valor: AuscultaHemitorax;
  onChange: (updates: Partial<AuscultaHemitorax>) => void;
  disabled?: boolean;
}> = ({ titulo, className, tituloClassName, valor, onChange, disabled }) => {
  const loc = valor.localizacao_ruidos || {};
  const temLocalizacaoAntiga = !!(
    valor.localizacao_difusos ||
    valor.localizacao_apice ||
    valor.localizacao_terco_medio ||
    valor.localizacao_base
  );

  const marcarAusentes = (checked: boolean) => {
    const updates: Partial<AuscultaHemitorax> = { ruidos_ausentes: checked };
    if (checked) {
      RUIDOS_ADVENTICIOS.forEach((r) => (updates[r.valor] = false));
      updates.localizacao_ruidos = {};
      updates.localizacao_difusos = false;
      updates.localizacao_apice = false;
      updates.localizacao_terco_medio = false;
      updates.localizacao_base = false;
    }
    onChange(updates);
  };

  const marcarRuido = (ruido: RuidoAdventicio, checked: boolean) => {
    const novaLoc = { ...loc };
    if (!checked) delete novaLoc[ruido];
    const updates: Partial<AuscultaHemitorax> = {
      ruidos_ausentes: false,
      localizacao_ruidos: novaLoc,
    };
    updates[ruido] = checked;
    onChange(updates);
  };

  // "Difusos" exclui os pontos específicos e vice-versa
  const alternarLocal = (ruido: RuidoAdventicio, local: LocalizacaoRuido) => {
    const atual = loc[ruido] || [];
    let novo: LocalizacaoRuido[];
    if (atual.includes(local)) novo = atual.filter((l) => l !== local);
    else if (local === 'difusos') novo = ['difusos'];
    else novo = [...atual.filter((l) => l !== 'difusos'), local];
    onChange({ localizacao_ruidos: { ...loc, [ruido]: novo } });
  };

  return (
    <div className={cn('border rounded-lg p-4 space-y-4', className)}>
      <h5 className={cn('font-medium', tituloClassName)}>{titulo}</h5>

      <Field label="Murmúrio Vesicular">
        <RadioButtonGroup
          value={valor.murmurio_vesicular}
          onChange={(v) =>
            onChange({
              murmurio_vesicular: v as 'preservado' | 'diminuido' | 'abolido',
            })
          }
          options={[
            { valor: 'preservado', label: '✅ Preservado' },
            { valor: 'diminuido', label: '⚠️ Diminuído' },
            { valor: 'abolido', label: '❌ Abolido' },
          ]}
          disabled={disabled}
        />
      </Field>

      <div className="space-y-2">
        <span className="text-sm font-medium">Ruídos Adventícios</span>
        <div className="space-y-3">
          <CheckboxField
            label="Ausentes"
            checked={valor.ruidos_ausentes || false}
            onChange={marcarAusentes}
            disabled={disabled}
          />
          {RUIDOS_ADVENTICIOS.map((r) => {
            const marcado = valor[r.valor] || false;
            const locais = loc[r.valor] || [];
            return (
              <div key={r.valor} className="space-y-2">
                <CheckboxField
                  label={r.label}
                  checked={marcado}
                  onChange={(checked) => marcarRuido(r.valor, checked)}
                  disabled={disabled}
                />
                {marcado && (
                  <div
                    className={cn(
                      'ml-6 p-2 rounded-lg border space-y-2 bg-background',
                      locais.length === 0 ? 'border-amber-300' : 'border-border'
                    )}
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      📍 Onde estão os {r.label.toLowerCase()}?
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {LOCALIZACOES_RUIDO.map((l) => {
                        const ativo = locais.includes(l.valor);
                        return (
                          <button
                            key={l.valor}
                            type="button"
                            aria-pressed={ativo}
                            disabled={disabled}
                            onClick={() => alternarLocal(r.valor, l.valor)}
                            className={cn(
                              'min-h-10 px-3 rounded-lg border-2 text-sm font-medium transition-all',
                              ativo
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'bg-background border-border text-foreground hover:bg-muted',
                              disabled && 'opacity-50 cursor-not-allowed'
                            )}
                          >
                            {l.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Registro antigo: localização única do hemitórax, sem dizer o ruído */}
      {temLocalizacaoAntiga && (
        <div className="space-y-2">
          <span className="text-sm font-medium">
            📍 Localização geral (registro antigo)
          </span>
          <div className="grid grid-cols-2 gap-2">
            <CheckboxField
              label="Difusos"
              checked={valor.localizacao_difusos || false}
              onChange={(checked) => onChange({ localizacao_difusos: checked })}
              disabled={disabled}
            />
            <CheckboxField
              label="Ápice"
              checked={valor.localizacao_apice || false}
              onChange={(checked) => onChange({ localizacao_apice: checked })}
              disabled={disabled}
            />
            <CheckboxField
              label="Terço Médio"
              checked={valor.localizacao_terco_medio || false}
              onChange={(checked) =>
                onChange({ localizacao_terco_medio: checked })
              }
              disabled={disabled}
            />
            <CheckboxField
              label="Base"
              checked={valor.localizacao_base || false}
              onChange={(checked) => onChange({ localizacao_base: checked })}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const EvolutionSectionContent: React.FC<
  EvolutionSectionContentProps
> = ({
  tipoEvolucao,
  secaoId,
  evolucaoRespiratoria,
  evolucaoMotora,
  onRespiratoriaChange,
  onMotoraChange,
  disabled = false,
}) => {
  // =========================================================================
  // EVOLUÇÃO RESPIRATÓRIA
  // =========================================================================

  if (tipoEvolucao === 'respiratoria') {
    const evolucao = evolucaoRespiratoria;

    switch (secaoId) {
      // -----------------------------------------------------------------
      // ESTADO GERAL (ANTES) - Consolidado: Queixa Principal + Sinais Vitais + Estado + Saturação
      // -----------------------------------------------------------------
      case 'estado_geral_antes': {
        const estado = evolucao.estado_geral_antes;

        const updateEstado = (updates: Partial<EstadoGeralAntes>) => {
          onRespiratoriaChange({
            estado_geral_antes: { ...estado, ...updates },
          });
        };

        // Temperatura: parte inteira/decimal p/ os chips de atalho (passo 0,1)
        const tempInt =
          estado.temperatura_aferida != null
            ? Math.floor(estado.temperatura_aferida)
            : null;
        const tempDec =
          estado.temperatura_aferida != null
            ? Math.round(
                (estado.temperatura_aferida -
                  Math.floor(estado.temperatura_aferida)) *
                  10
              )
            : null;

        return (
          <div className="space-y-8">
            {/* Explicação da seção */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <p className="text-sm text-purple-800">
                <strong>📋 Sobre esta seção:</strong> Registre aqui a avaliação
                inicial do profissional junto com os relatos do responsável
                sobre o estado da criança antes do atendimento.
              </p>
            </div>

            {/* 1️⃣ Estado Geral da Criança */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-purple-700">
                👶 Estado Geral da Criança
              </h4>

              {/* Nível de Consciência */}
              <Field label="Nível de Consciência" required>
                <RadioButtonGroup
                  value={estado.nivel_consciencia}
                  onChange={(v) => {
                    const val = v as 'acordado' | 'sonolento' | 'dormindo';
                    updateEstado({
                      nivel_consciencia: val,
                      // Limpa estado_acordado se não está acordado
                      estado_acordado:
                        val === 'acordado' ? estado.estado_acordado : null,
                    });
                  }}
                  options={[
                    { valor: 'acordado', label: '👁️ Acordado' },
                    { valor: 'sonolento', label: '😴 Sonolento' },
                    { valor: 'dormindo', label: '💤 Dormindo' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              {/* Se acordado: Ativo ou Hipoativo */}
              {estado.nivel_consciencia === 'acordado' && (
                <div className="pl-4 border-l-2 border-purple-200">
                  <Field label="Estado" required>
                    <RadioButtonGroup
                      value={estado.estado_acordado}
                      onChange={(v) =>
                        updateEstado({
                          estado_acordado: v as 'ativo' | 'hipoativo',
                        })
                      }
                      options={[
                        { valor: 'ativo', label: '⚡ Ativo' },
                        { valor: 'hipoativo', label: '😶 Hipoativo' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>
                </div>
              )}

              {/* Comportamento / Reação (múltipla escolha) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Comportamento / Reação
                </label>
                <p className="text-xs text-gray-500">
                  Múltipla escolha - a criança pode apresentar mais de um
                  comportamento
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <CheckboxField
                    label="😊 Calmo"
                    checked={estado.comportamento_calmo || false}
                    onChange={(checked) =>
                      updateEstado({ comportamento_calmo: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="😤 Irritado"
                    checked={estado.comportamento_irritado || false}
                    onChange={(checked) =>
                      updateEstado({ comportamento_irritado: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="😢 Choroso"
                    checked={estado.comportamento_choroso || false}
                    onChange={(checked) =>
                      updateEstado({ comportamento_choroso: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="🏃 Agitado"
                    checked={estado.comportamento_agitado || false}
                    onChange={(checked) =>
                      updateEstado({ comportamento_agitado: checked })
                    }
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>

            {/* 2️⃣ Sinais Vitais */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-red-700">🌡️ Sinais Vitais</h4>

              {/* Temperatura — chips de atalho em 2 níveis (inteiro + decimal),
                  passo 0,1; input preciso continua p/ edição direta */}
              <Field label="Temperatura (°C)" required>
                <div className="flex flex-wrap items-center gap-2">
                  <RadioButtonGroup
                    value={tempInt != null ? String(tempInt) : null}
                    onChange={(v) => {
                      const dec =
                        estado.temperatura_aferida != null
                          ? estado.temperatura_aferida % 1
                          : 0;
                      updateEstado({
                        temperatura_aferida: Number(
                          (Number(v) + dec).toFixed(1)
                        ),
                        temperatura_nao_aferida: false,
                      });
                    }}
                    options={[
                      { valor: '35', label: '35' },
                      { valor: '36', label: '36' },
                      { valor: '37', label: '37' },
                      { valor: '38', label: '38' },
                      { valor: '39', label: '39' },
                      { valor: '40', label: '40' },
                      { valor: '41', label: '41' },
                    ]}
                    size="sm"
                    disabled={disabled || estado.temperatura_nao_aferida}
                  />
                  <span className="text-sm text-gray-400">,</span>
                  <RadioButtonGroup
                    value={tempDec != null ? String(tempDec) : null}
                    onChange={(v) => {
                      const intPart =
                        estado.temperatura_aferida != null
                          ? Math.floor(estado.temperatura_aferida)
                          : 36;
                      updateEstado({
                        temperatura_aferida: Number(
                          (intPart + Number(v) / 10).toFixed(1)
                        ),
                        temperatura_nao_aferida: false,
                      });
                    }}
                    options={[
                      { valor: '0', label: ',0' },
                      { valor: '1', label: ',1' },
                      { valor: '2', label: ',2' },
                      { valor: '3', label: ',3' },
                      { valor: '4', label: ',4' },
                      { valor: '5', label: ',5' },
                      { valor: '6', label: ',6' },
                      { valor: '7', label: ',7' },
                      { valor: '8', label: ',8' },
                      { valor: '9', label: ',9' },
                    ]}
                    size="sm"
                    disabled={disabled || estado.temperatura_nao_aferida}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={35}
                    max={42}
                    step={0.1}
                    value={estado.temperatura_aferida || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.]/g, '');
                      updateEstado({
                        temperatura_aferida: value ? Number(value) : undefined,
                        temperatura_nao_aferida: value
                          ? false
                          : estado.temperatura_nao_aferida,
                      });
                    }}
                    placeholder="36.5"
                    disabled={disabled || estado.temperatura_nao_aferida}
                    className="w-full sm:w-32"
                  />
                  <CheckboxField
                    label="Não aferida"
                    checked={estado.temperatura_nao_aferida || false}
                    onChange={(checked) =>
                      updateEstado({
                        temperatura_nao_aferida: checked,
                        temperatura_aferida: checked
                          ? undefined
                          : estado.temperatura_aferida,
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              </Field>

              <Field label="FC (bpm)" required>
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={40}
                    max={220}
                    value={estado.frequencia_cardiaca || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      updateEstado({
                        frequencia_cardiaca: value ? Number(value) : undefined,
                        frequencia_cardiaca_nao_aferida: value
                          ? false
                          : estado.frequencia_cardiaca_nao_aferida,
                      });
                    }}
                    placeholder="120"
                    disabled={
                      disabled || estado.frequencia_cardiaca_nao_aferida
                    }
                    className="w-full sm:w-32"
                  />
                  <CheckboxField
                    label="Não aferida"
                    checked={estado.frequencia_cardiaca_nao_aferida || false}
                    onChange={(checked) =>
                      updateEstado({
                        frequencia_cardiaca_nao_aferida: checked,
                        frequencia_cardiaca: checked
                          ? undefined
                          : estado.frequencia_cardiaca,
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              </Field>

              {/* SpO₂ com chips de atalho + campo p/ valores fora da faixa */}
              <Field label="SpO₂ (%) (inicial)" required>
                <RadioButtonGroup
                  value={
                    estado.saturacao_o2 != null
                      ? String(estado.saturacao_o2)
                      : null
                  }
                  onChange={(v) =>
                    updateEstado({
                      saturacao_o2: Number(v),
                      saturacao_nao_aferida: false,
                    })
                  }
                  options={[
                    { valor: '94', label: '94' },
                    { valor: '95', label: '95' },
                    { valor: '96', label: '96' },
                    { valor: '97', label: '97' },
                    { valor: '98', label: '98' },
                    { valor: '99', label: '99' },
                    { valor: '100', label: '100' },
                  ]}
                  size="sm"
                  disabled={disabled || estado.saturacao_nao_aferida}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={estado.saturacao_o2 || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      updateEstado({
                        saturacao_o2: value ? Number(value) : undefined,
                        saturacao_nao_aferida: value
                          ? false
                          : estado.saturacao_nao_aferida,
                      });
                    }}
                    placeholder="Outro valor"
                    disabled={disabled || estado.saturacao_nao_aferida}
                    className="w-full sm:w-40"
                  />
                  <CheckboxField
                    label="Não aferida"
                    checked={estado.saturacao_nao_aferida || false}
                    onChange={(checked) =>
                      updateEstado({
                        saturacao_nao_aferida: checked,
                        saturacao_o2: checked ? undefined : estado.saturacao_o2,
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              </Field>

              {/* Suporte de O2 condicional */}
              <div className="space-y-3">
                <CheckboxField
                  label="Necessita de suporte de O₂?"
                  checked={estado.necessita_suporte_o2 || false}
                  onChange={(checked) => {
                    updateEstado({
                      necessita_suporte_o2: checked,
                      saturacao_com_suporte: checked
                        ? estado.saturacao_com_suporte
                        : undefined,
                    });
                  }}
                  disabled={disabled}
                />
                {estado.necessita_suporte_o2 && (
                  <div className="pl-4 border-l-2 border-red-200">
                    <Field label="SpO₂ c/ Suporte (%)">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        value={estado.saturacao_com_suporte || ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9]/g, '');
                          updateEstado({
                            saturacao_com_suporte: value
                              ? Number(value)
                              : undefined,
                          });
                        }}
                        placeholder="99"
                        disabled={disabled}
                        className="w-full sm:w-32"
                      />
                    </Field>
                  </div>
                )}
              </div>
            </div>

            {/* 3️⃣ Contexto Clínico Recente */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-indigo-700">
                🏥 Contexto Clínico Recente{' '}
                <span className="text-sm font-normal text-gray-500">
                  (relato do responsável)
                </span>
              </h4>
              <p className="text-sm text-gray-500">
                Fatores que ajudam na interpretação do quadro
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CheckboxField
                  label="Infecção respiratória recente"
                  checked={estado.infeccao_recente || false}
                  onChange={(checked) =>
                    updateEstado({ infeccao_recente: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Episódios recorrentes de sibilância"
                  checked={estado.episodios_recorrentes_sibilancia || false}
                  onChange={(checked) =>
                    updateEstado({ episodios_recorrentes_sibilancia: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Contato recente com pessoas sintomáticas"
                  checked={estado.contato_pessoas_sintomaticas || false}
                  onChange={(checked) =>
                    updateEstado({ contato_pessoas_sintomaticas: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Uso recente de medicação respiratória"
                  checked={estado.uso_medicacao_respiratoria || false}
                  onChange={(checked) =>
                    updateEstado({ uso_medicacao_respiratoria: checked })
                  }
                  disabled={disabled}
                />
              </div>

              <Field label="Início dos sintomas há (dias)">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={365}
                  value={estado.inicio_sintomas_dias || ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    updateEstado({
                      inicio_sintomas_dias: value ? Number(value) : undefined,
                    });
                  }}
                  placeholder="Ex: 3"
                  disabled={disabled}
                  className="w-full sm:w-32"
                />
              </Field>

              {/* Quadro Compatível Com */}
              <Field label="Quadro Compatível com (múltipla escolha)">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-2 border rounded-lg bg-muted/20">
                  {QUADROS_COMPATIVEIS.map((quadro) => (
                    <CheckboxField
                      key={quadro}
                      label={quadro}
                      checked={
                        estado.quadro_compativel_com?.includes(quadro) || false
                      }
                      onChange={(checked) => {
                        const atual = estado.quadro_compativel_com || [];
                        const novos = checked
                          ? [...atual, quadro]
                          : atual.filter((q) => q !== quadro);
                        updateEstado({ quadro_compativel_com: novos });
                      }}
                      disabled={disabled}
                    />
                  ))}
                </div>
              </Field>

              {/* Origem da Informação do Quadro */}
              <Field label="Origem da Informação do Quadro">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ORIGENS_INFORMACAO_QUADRO.map((origem) => (
                    <CheckboxField
                      key={origem}
                      label={origem}
                      checked={
                        estado.origem_informacao_quadro?.includes(origem) ||
                        false
                      }
                      onChange={(checked) => {
                        const atual = estado.origem_informacao_quadro || [];
                        const novos = checked
                          ? [...atual, origem]
                          : atual.filter((o) => o !== origem);
                        updateEstado({ origem_informacao_quadro: novos });
                      }}
                      disabled={disabled}
                    />
                  ))}
                </div>
              </Field>
            </div>

            {/* 4️⃣ Repercussões Funcionais */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-yellow-700">
                📋 Repercussões Funcionais{' '}
                <span className="text-sm font-normal text-gray-500">
                  (relato do responsável)
                </span>
              </h4>
              <p className="text-sm text-gray-500">
                Impacto dos sintomas no dia a dia
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CheckboxField
                  label="Dificuldade alimentar"
                  checked={estado.dificuldade_alimentar || false}
                  onChange={(checked) =>
                    updateEstado({ dificuldade_alimentar: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Interrupções do sono"
                  checked={estado.interrupcoes_sono || false}
                  onChange={(checked) =>
                    updateEstado({ interrupcoes_sono: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Piora noturna dos sintomas"
                  checked={estado.piora_noturna || false}
                  onChange={(checked) =>
                    updateEstado({ piora_noturna: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Irritabilidade associada à respiração"
                  checked={estado.irritabilidade_respiratoria || false}
                  onChange={(checked) =>
                    updateEstado({ irritabilidade_respiratoria: checked })
                  }
                  disabled={disabled}
                />
              </div>
            </div>

            {/* 5️⃣ Sinais e Sintomas Respiratórios (tosse unificada) */}
            {/* AI dev note: Tosse antes ficava duplicada (checkbox em "Sinais
                Associados" + radio em "Sintomas Respiratórios"). Consolidado em
                um único controle com a cascata de tosse produtiva. */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-orange-700">
                ⚠️ Sinais e Sintomas Respiratórios
              </h4>

              <Field label="Tosse" required>
                <RadioButtonGroup
                  value={estado.tosse}
                  onChange={(v) => {
                    const val = v as 'ausente' | 'seca' | 'produtiva';
                    updateEstado({
                      tosse: val,
                      // Limpa campos dependentes se não for produtiva
                      tosse_eficacia:
                        val === 'produtiva' ? estado.tosse_eficacia : null,
                      tosse_destino:
                        val === 'produtiva' ? estado.tosse_destino : null,
                      secrecao_cor:
                        val === 'produtiva' ? estado.secrecao_cor : null,
                      secrecao_quantidade:
                        val === 'produtiva' ? estado.secrecao_quantidade : null,
                    });
                  }}
                  options={[
                    { valor: 'ausente', label: '✅ Ausente' },
                    { valor: 'seca', label: '🫁 Seca' },
                    { valor: 'produtiva', label: '💧 Produtiva' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              {/* Se produtiva: eficaz ou ineficaz */}
              {estado.tosse === 'produtiva' && (
                <div className="pl-4 border-l-2 border-blue-200 space-y-4">
                  <Field label="Eficácia da Tosse" required>
                    <RadioButtonGroup
                      value={estado.tosse_eficacia}
                      onChange={(v) => {
                        const val = v as 'eficaz' | 'pouco_eficaz' | 'ineficaz';
                        updateEstado({
                          tosse_eficacia: val,
                          // Limpa campos dependentes se não for eficaz
                          tosse_destino:
                            val === 'eficaz' ? estado.tosse_destino : null,
                          secrecao_cor:
                            val === 'eficaz' &&
                            estado.tosse_destino === 'expectoracao'
                              ? estado.secrecao_cor
                              : null,
                          secrecao_quantidade:
                            val === 'eficaz' &&
                            estado.tosse_destino === 'expectoracao'
                              ? estado.secrecao_quantidade
                              : null,
                        });
                      }}
                      options={[
                        { valor: 'eficaz', label: '✅ Eficaz' },
                        { valor: 'pouco_eficaz', label: '🟡 Pouco eficaz' },
                        { valor: 'ineficaz', label: '❌ Ineficaz' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  {/* Se eficaz: deglutição ou expectoração */}
                  {estado.tosse_eficacia === 'eficaz' && (
                    <div className="pl-4 border-l-2 border-blue-300 space-y-4">
                      <Field label="Destino da Secreção" required>
                        <RadioButtonGroup
                          value={estado.tosse_destino}
                          onChange={(v) => {
                            const val = v as 'degluticao' | 'expectoracao';
                            updateEstado({
                              tosse_destino: val,
                              // Limpa campos de secreção se não for expectoração
                              secrecao_cor:
                                val === 'expectoracao'
                                  ? estado.secrecao_cor
                                  : null,
                              secrecao_quantidade:
                                val === 'expectoracao'
                                  ? estado.secrecao_quantidade
                                  : null,
                            });
                          }}
                          options={[
                            { valor: 'degluticao', label: '😮‍💨 Deglutição' },
                            { valor: 'expectoracao', label: '💧 Expectoração' },
                          ]}
                          disabled={disabled}
                        />
                      </Field>

                      {/* Se expectoração: cor e quantidade */}
                      {estado.tosse_destino === 'expectoracao' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-4 border-l-2 border-blue-400">
                          <Field label="Cor da Secreção">
                            <RadioButtonGroup
                              value={estado.secrecao_cor}
                              onChange={(v) =>
                                updateEstado({
                                  secrecao_cor: v as
                                    | 'clara'
                                    | 'amarelada'
                                    | 'esverdeada',
                                })
                              }
                              options={[
                                { valor: 'clara', label: '⚪ Clara' },
                                { valor: 'amarelada', label: '🟡 Amarelada' },
                                { valor: 'esverdeada', label: '🟢 Esverdeada' },
                              ]}
                              disabled={disabled}
                            />
                          </Field>
                          <Field label="Quantidade">
                            <RadioButtonGroup
                              value={estado.secrecao_quantidade}
                              onChange={(v) =>
                                updateEstado({
                                  secrecao_quantidade: v as
                                    | 'pouca'
                                    | 'moderada'
                                    | 'abundante',
                                })
                              }
                              options={[
                                { valor: 'pouca', label: 'Pouca' },
                                { valor: 'moderada', label: 'Moderada' },
                                { valor: 'abundante', label: 'Abundante' },
                              ]}
                              disabled={disabled}
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Outros sinais (relato do responsável) */}
              <div className="space-y-2 border-t pt-4">
                <label className="text-sm font-medium">
                  Outros sinais{' '}
                  <span className="text-sm font-normal text-gray-500">
                    (relato do responsável)
                  </span>
                </label>
                <p className="text-xs text-gray-500">
                  Podem coexistir com qualquer tipo de tosse
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CheckboxField
                    label="Sibilo referido pelos responsáveis"
                    checked={estado.chiado_referido || false}
                    onChange={(checked) =>
                      updateEstado({ chiado_referido: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Cansaço respiratório"
                    checked={estado.cansaco_respiratorio || false}
                    onChange={(checked) =>
                      updateEstado({ cansaco_respiratorio: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Esforço respiratório percebido"
                    checked={estado.esforco_respiratorio || false}
                    onChange={(checked) =>
                      updateEstado({ esforco_respiratorio: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Respiração ruidosa"
                    checked={estado.respiracao_ruidosa || false}
                    onChange={(checked) =>
                      updateEstado({ respiracao_ruidosa: checked })
                    }
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>

            {/* Observações Gerais */}
            <Field label="Observações Gerais">
              <Textarea
                value={estado.observacoes || ''}
                onChange={(e) => updateEstado({ observacoes: e.target.value })}
                placeholder="Observações adicionais sobre o estado geral da criança..."
                disabled={disabled}
                rows={2}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // AVALIAÇÃO RESPIRATÓRIA (SEM TEMPERATURA E SATURAÇÃO - MOVIDOS PARA ESTADO GERAL)
      // -----------------------------------------------------------------
      case 'avaliacao_antes': {
        const avaliacao = evolucao.avaliacao_antes;

        const updatePadrao = (updates: Partial<PadraoRespiratorio>) => {
          const novoPadrao = {
            ...avaliacao.padrao_respiratorio,
            ...updates,
          };
          // Calcula classificação automaticamente
          const classificacao = calcularClassificacaoClinica(
            novoPadrao.ritmo_respiratorio,
            novoPadrao.dispneia
          );
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              padrao_respiratorio: {
                ...novoPadrao,
                classificacao_clinica: classificacao,
              },
            },
          });
        };

        const updateSinais = (updates: Partial<SinaisDispneia>) => {
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              sinais_dispneia: {
                ...avaliacao.sinais_dispneia,
                ...updates,
              },
            },
          });
        };

        const updateAusculta = (updates: Partial<AuscultaPulmonar>) => {
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              ausculta: { ...avaliacao.ausculta, ...updates },
            },
          });
        };

        const updateHemitoraxDireito = (
          updates: Partial<AuscultaHemitorax>
        ) => {
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              ausculta: {
                ...avaliacao.ausculta,
                hemitorax_direito: {
                  ...avaliacao.ausculta.hemitorax_direito,
                  ...updates,
                },
              },
            },
          });
        };

        const updateHemitoraxEsquerdo = (
          updates: Partial<AuscultaHemitorax>
        ) => {
          onRespiratoriaChange({
            avaliacao_antes: {
              ...avaliacao,
              ausculta: {
                ...avaliacao.ausculta,
                hemitorax_esquerdo: {
                  ...avaliacao.ausculta.hemitorax_esquerdo,
                  ...updates,
                },
              },
            },
          });
        };

        // Texto descritivo da classificação
        const classificacaoTexto = avaliacao.padrao_respiratorio
          .classificacao_clinica
          ? getTextoClassificacaoClinica(
              avaliacao.padrao_respiratorio.classificacao_clinica
            )
          : null;

        return (
          <div className="space-y-8">
            {/* Atalho: exame normal (charting by exception) */}
            {!disabled && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    onRespiratoriaChange({
                      avaliacao_antes: getAvaliacaoRespiratoriaNormal(),
                    })
                  }
                  className="w-full rounded-lg border-2 border-green-300 bg-green-50 py-2.5 text-sm font-medium text-green-800 transition-colors hover:bg-green-100"
                >
                  ✅ Marcar exame respiratório normal
                </button>
                <p className="text-xs text-gray-500">
                  Preenche eupneico, MV preservado bilateral, sem ruídos e sem
                  dispneia. Depois é só ajustar as exceções.
                </p>
              </div>
            )}

            {/* Padrão Respiratório */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-700">
                🔹 Padrão Respiratório
              </h4>

              <Field label="Tipo" required>
                <RadioButtonGroup
                  value={avaliacao.padrao_respiratorio.tipo}
                  onChange={(v) =>
                    updatePadrao({
                      tipo: v as
                        | 'nasal'
                        | 'oral'
                        | 'misto'
                        | 'traqueostomizado',
                    })
                  }
                  options={[
                    { valor: 'nasal', label: 'Nasal' },
                    { valor: 'oral', label: 'Oral' },
                    { valor: 'misto', label: 'Misto' },
                    { valor: 'traqueostomizado', label: 'Traqueostomizado' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <Field label="Ritmo Respiratório" required>
                <RadioButtonGroup
                  value={avaliacao.padrao_respiratorio.ritmo_respiratorio}
                  onChange={(v) =>
                    updatePadrao({ ritmo_respiratorio: v as RitmoRespiratorio })
                  }
                  options={[
                    { valor: 'eupneico', label: '✅ Eupneico (Normal)' },
                    {
                      valor: 'bradipneico',
                      label: '🔵 Bradipneico (FR Baixa)',
                    },
                    { valor: 'taquipneico', label: '🟠 Taquipneico (FR Alta)' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <BooleanField
                label="Presença de Dispneia (Sinais de Esforço)"
                value={avaliacao.padrao_respiratorio.dispneia}
                onChange={(checked) => {
                  updatePadrao({ dispneia: checked });
                  // Sem esforço respiratório não há melhora de padrão nem
                  // redução de desconforto a avaliar depois - limpa respostas
                  if (!checked) {
                    onRespiratoriaChange({
                      avaliacao_depois: {
                        ...evolucao.avaliacao_depois,
                        melhora_padrao_respiratorio: false,
                        reducao_desconforto: false,
                      },
                    });
                  }
                }}
                disabled={disabled}
              />
            </div>

            {/* Sinais de Dispneia - Só aparecem se dispneia = true */}
            {avaliacao.padrao_respiratorio.dispneia && (
              <div className="border rounded-lg p-4 space-y-4 bg-orange-50">
                <h4 className="font-medium text-orange-700">
                  ⚠️ Sinais Associados à Dispneia
                </h4>
                <p className="text-sm text-orange-600 mb-4">
                  Selecione os sinais de esforço respiratório observados:
                </p>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <CheckboxField
                    label="Uso de Musculatura Acessória"
                    checked={
                      avaliacao.sinais_dispneia.uso_musculatura_acessoria
                    }
                    onChange={(checked) =>
                      updateSinais({ uso_musculatura_acessoria: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Batimento de Asa Nasal"
                    checked={avaliacao.sinais_dispneia.batimento_asa_nasal}
                    onChange={(checked) =>
                      updateSinais({ batimento_asa_nasal: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Tiragem Intercostal"
                    checked={avaliacao.sinais_dispneia.tiragem_intercostal}
                    onChange={(checked) =>
                      updateSinais({ tiragem_intercostal: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Tiragem Subcostal"
                    checked={avaliacao.sinais_dispneia.tiragem_subcostal}
                    onChange={(checked) =>
                      updateSinais({ tiragem_subcostal: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Tiragem Supraclavicular"
                    checked={avaliacao.sinais_dispneia.tiragem_supraclavicular}
                    onChange={(checked) =>
                      updateSinais({ tiragem_supraclavicular: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Retração de Fúrcula"
                    checked={avaliacao.sinais_dispneia.retracao_furcula}
                    onChange={(checked) =>
                      updateSinais({ retracao_furcula: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Gemência"
                    checked={avaliacao.sinais_dispneia.gemencia}
                    onChange={(checked) => updateSinais({ gemencia: checked })}
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Postura Antálgica"
                    checked={avaliacao.sinais_dispneia.postura_antalgica}
                    onChange={(checked) =>
                      updateSinais({ postura_antalgica: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Tempo Expiratório Prolongado"
                    checked={
                      avaliacao.sinais_dispneia.tempo_expiratorio_prolongado
                    }
                    onChange={(checked) =>
                      updateSinais({ tempo_expiratorio_prolongado: checked })
                    }
                    disabled={disabled}
                  />
                </div>
              </div>
            )}

            {/* Classificação Clínica Automática */}
            {avaliacao.padrao_respiratorio.ritmo_respiratorio && (
              <div
                className={cn(
                  'border rounded-lg p-4 space-y-2',
                  avaliacao.padrao_respiratorio.classificacao_clinica ===
                    'taquidispneico'
                    ? 'bg-red-50 border-red-300'
                    : avaliacao.padrao_respiratorio.classificacao_clinica ===
                        'taquipneico_sem_dispneia'
                      ? 'bg-orange-50 border-orange-300'
                      : avaliacao.padrao_respiratorio.classificacao_clinica ===
                          'dispneico_sem_taquipneia'
                        ? 'bg-yellow-50 border-yellow-300'
                        : 'bg-green-50 border-green-300'
                )}
              >
                <h4 className="font-medium flex items-center gap-2">
                  📋 Classificação Clínica (Automática)
                </h4>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-sm font-semibold',
                      avaliacao.padrao_respiratorio.classificacao_clinica ===
                        'taquidispneico'
                        ? 'bg-red-200 text-red-800'
                        : avaliacao.padrao_respiratorio
                              .classificacao_clinica ===
                            'taquipneico_sem_dispneia'
                          ? 'bg-orange-200 text-orange-800'
                          : avaliacao.padrao_respiratorio
                                .classificacao_clinica ===
                              'dispneico_sem_taquipneia'
                            ? 'bg-yellow-200 text-yellow-800'
                            : 'bg-green-200 text-green-800'
                    )}
                  >
                    {avaliacao.padrao_respiratorio.classificacao_clinica ===
                      'taquidispneico' && '🔴 Taquidispneico'}
                    {avaliacao.padrao_respiratorio.classificacao_clinica ===
                      'taquipneico_sem_dispneia' &&
                      '🟠 Taquipneico sem Dispneia'}
                    {avaliacao.padrao_respiratorio.classificacao_clinica ===
                      'dispneico_sem_taquipneia' &&
                      '🟡 Dispneico sem Taquipneia'}
                    {avaliacao.padrao_respiratorio.classificacao_clinica ===
                      'normal' && '🟢 Normal'}
                  </span>
                </div>
                {classificacaoTexto && (
                  <p className="text-sm text-muted-foreground italic mt-2">
                    {classificacaoTexto}
                  </p>
                )}
                <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                  <strong>Legenda:</strong> Taquipneia = frequência elevada |
                  Dispneia = esforço | Taquidispneia = frequência + esforço
                </div>
              </div>
            )}

            {/* Ausculta Pulmonar por Hemitórax */}
            <div className="border rounded-lg p-4 space-y-6">
              <h4 className="font-medium text-purple-700">
                🩺 Ausculta Pulmonar
              </h4>
              <p className="text-sm text-gray-500">
                Avaliação separada por hemitórax
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <HemitoraxAuscultaCard
                  titulo="🫁 Hemitórax Direito"
                  className="bg-blue-50/50"
                  tituloClassName="text-blue-700"
                  valor={avaliacao.ausculta.hemitorax_direito}
                  onChange={updateHemitoraxDireito}
                  disabled={disabled}
                />
                <HemitoraxAuscultaCard
                  titulo="🫁 Hemitórax Esquerdo"
                  className="bg-green-50/50"
                  tituloClassName="text-green-700"
                  valor={avaliacao.ausculta.hemitorax_esquerdo}
                  onChange={updateHemitoraxEsquerdo}
                  disabled={disabled}
                />
              </div>

              {/* Observações da Ausculta */}
              <Field label="Observações da Ausculta">
                <Textarea
                  value={avaliacao.ausculta.observacoes || ''}
                  onChange={(e) =>
                    updateAusculta({ observacoes: e.target.value })
                  }
                  placeholder="Observações adicionais sobre a ausculta pulmonar..."
                  disabled={disabled}
                  rows={2}
                />
              </Field>
            </div>
          </div>
        );
      }

      // AI dev note: 'estado_geral' foi consolidado em 'estado_geral_antes' para reduzir seções

      // -----------------------------------------------------------------
      // INTERVENÇÃO REALIZADA
      // -----------------------------------------------------------------
      case 'intervencao': {
        const intervencao = evolucao.intervencao;

        const updateIntervencao = (
          updates: Partial<IntervencaoRespiratoria>
        ) => {
          onRespiratoriaChange({
            intervencao: { ...intervencao, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            {/* Técnicas de Desobstrução Brônquica */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-700">
                🫁 Técnicas de Desobstrução Brônquica
              </h4>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <CheckboxField
                  label="AFE (Aumento do Fluxo Expiratório)"
                  checked={intervencao.afe}
                  onChange={(checked) => updateIntervencao({ afe: checked })}
                  disabled={disabled}
                />
                <CheckboxField
                  label="Vibrocompressão"
                  checked={intervencao.vibrocompressao}
                  onChange={(checked) =>
                    updateIntervencao({ vibrocompressao: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Expiração Lenta Prolongada"
                  checked={intervencao.expiração_lenta_prolongada}
                  onChange={(checked) =>
                    updateIntervencao({ expiração_lenta_prolongada: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Inspiração Forçada"
                  checked={intervencao.inspiracao_forcada || false}
                  onChange={(checked) =>
                    updateIntervencao({ inspiracao_forcada: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Expiração Forçada"
                  checked={intervencao.expiracao_forcada || false}
                  onChange={(checked) =>
                    updateIntervencao({ expiracao_forcada: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="RTA (Reequilíbrio Toracoabdominal)"
                  checked={intervencao.rta}
                  onChange={(checked) => updateIntervencao({ rta: checked })}
                  disabled={disabled}
                />
                <CheckboxField
                  label="EPAP"
                  checked={intervencao.epap}
                  onChange={(checked) => updateIntervencao({ epap: checked })}
                  disabled={disabled}
                />
                <CheckboxField
                  label="EPAP Selo d'Água"
                  checked={intervencao.epap_selo_dagua}
                  onChange={(checked) =>
                    updateIntervencao({ epap_selo_dagua: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Redirecionamento de Fluxo"
                  checked={intervencao.redirecionamento_fluxo}
                  onChange={(checked) =>
                    updateIntervencao({ redirecionamento_fluxo: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Posicionamentos Terapêuticos"
                  checked={intervencao.posicionamentos_terapeuticos}
                  onChange={(checked) =>
                    updateIntervencao({ posicionamentos_terapeuticos: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Estímulo à Tosse Eficaz"
                  checked={intervencao.estimulo_tosse}
                  onChange={(checked) =>
                    updateIntervencao({ estimulo_tosse: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Nebulização"
                  checked={intervencao.nebulizacao}
                  onChange={(checked) =>
                    updateIntervencao({ nebulizacao: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Ambu (Hiperinsuflação Manual)"
                  checked={intervencao.ambu || false}
                  onChange={(checked) => updateIntervencao({ ambu: checked })}
                  disabled={disabled}
                />
                <CheckboxField
                  label="Acapella"
                  checked={intervencao.acapella || false}
                  onChange={(checked) =>
                    updateIntervencao({ acapella: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Shaker"
                  checked={intervencao.shaker || false}
                  onChange={(checked) => updateIntervencao({ shaker: checked })}
                  disabled={disabled}
                />
                <CheckboxField
                  label="Lavagem Nasal"
                  checked={intervencao.lavagem_nasal || false}
                  onChange={(checked) =>
                    updateIntervencao({ lavagem_nasal: checked })
                  }
                  disabled={disabled}
                />
              </div>

              {/* PEEP - aparece se usar EPAP ou EPAP selo d'água */}
              {(intervencao.epap || intervencao.epap_selo_dagua) && (
                <Field label="Valor da PEEP (cmH₂O)">
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={intervencao.peep_valor || ''}
                    onChange={(e) =>
                      updateIntervencao({
                        peep_valor: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Ex: 5"
                    disabled={disabled}
                    className="w-full sm:w-32"
                  />
                </Field>
              )}
            </div>

            {/* Aspiração */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-orange-700">🔸 Aspiração</h4>

              <BooleanField
                label="Realizou Aspiração"
                value={intervencao.aspiracao}
                onChange={(checked) =>
                  updateIntervencao({ aspiracao: checked })
                }
                disabled={disabled}
              />

              {intervencao.aspiracao && (
                <div className="space-y-4 pl-4 border-l-2 border-orange-200">
                  <Field label="Tipo de Aspiração" required>
                    <RadioButtonGroup
                      value={intervencao.aspiracao_tipo}
                      onChange={(v) =>
                        updateIntervencao({
                          aspiracao_tipo: v as
                            | 'invasiva'
                            | 'nao_invasiva'
                            | 'ambas',
                        })
                      }
                      options={[
                        { valor: 'nao_invasiva', label: 'Não Invasiva' },
                        { valor: 'invasiva', label: 'Invasiva' },
                        { valor: 'ambas', label: 'Ambas' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  <Field label="Quantidade de Secreção">
                    <RadioButtonGroup
                      value={intervencao.aspiracao_quantidade}
                      onChange={(v) =>
                        updateIntervencao({
                          aspiracao_quantidade: v as
                            | 'pouca'
                            | 'moderada'
                            | 'abundante',
                        })
                      }
                      options={[
                        { valor: 'pouca', label: 'Pouca' },
                        { valor: 'moderada', label: 'Moderada' },
                        { valor: 'abundante', label: 'Abundante' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  <Field label="Consistência da Secreção">
                    <RadioButtonGroup
                      value={intervencao.aspiracao_consistencia}
                      onChange={(v) =>
                        updateIntervencao({
                          aspiracao_consistencia: v as
                            | 'fluida'
                            | 'semi_espessa'
                            | 'espessa',
                        })
                      }
                      options={[
                        { valor: 'fluida', label: 'Fluida' },
                        { valor: 'semi_espessa', label: 'Semi Espessa' },
                        { valor: 'espessa', label: 'Espessa' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  <Field label="Aspecto da Secreção">
                    <RadioButtonGroup
                      value={intervencao.aspiracao_aspecto}
                      onChange={(v) =>
                        updateIntervencao({
                          aspiracao_aspecto: v as
                            | 'clara'
                            | 'amarelada'
                            | 'esverdeada'
                            | 'purulenta',
                        })
                      }
                      options={[
                        { valor: 'clara', label: '⚪ Clara' },
                        { valor: 'amarelada', label: '🟡 Amarelada' },
                        { valor: 'esverdeada', label: '🟢 Esverdeada' },
                        { valor: 'purulenta', label: '🟤 Purulenta' },
                      ]}
                      disabled={disabled}
                    />
                  </Field>

                  <Field label="Sangramento">
                    <RadioButtonGroup
                      value={intervencao.aspiracao_sangramento}
                      onChange={(v) =>
                        updateIntervencao({
                          aspiracao_sangramento: v as
                            | 'nao'
                            | 'rajas_sangue'
                            | 'sangramento_ativo',
                        })
                      }
                      options={[
                        { valor: 'nao', label: '✅ Sem sangramento' },
                        { valor: 'rajas_sangue', label: '⚠️ Rajas de sangue' },
                        {
                          valor: 'sangramento_ativo',
                          label: '🔴 Sangramento ativo',
                        },
                      ]}
                      disabled={disabled}
                    />
                  </Field>
                </div>
              )}
            </div>

            <Field label="Observações da Intervenção">
              <Textarea
                value={intervencao.observacoes || ''}
                onChange={(e) =>
                  updateIntervencao({ observacoes: e.target.value })
                }
                placeholder="Detalhes adicionais sobre a intervenção realizada..."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // RESPOSTA AO TRATAMENTO (DEPOIS)
      // -----------------------------------------------------------------
      case 'avaliacao_depois': {
        const depois = evolucao.avaliacao_depois;
        // Itens de esforço respiratório só fazem sentido se havia dispneia antes
        const tinhaDispneia =
          evolucao.avaliacao_antes.padrao_respiratorio.dispneia;

        const updateDepois = (
          updates: Partial<AvaliacaoRespiratoriaDepois>
        ) => {
          onRespiratoriaChange({
            avaliacao_depois: { ...depois, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <div
              className={cn(
                'grid grid-cols-1 gap-4',
                tinhaDispneia ? 'md:grid-cols-3' : 'md:grid-cols-1'
              )}
            >
              {tinhaDispneia && (
                <BooleanField
                  value={depois.melhora_padrao_respiratorio}
                  onChange={(checked) =>
                    updateDepois({ melhora_padrao_respiratorio: checked })
                  }
                  label="Melhora do Padrão Respiratório"
                  disabled={disabled}
                />
              )}
              <BooleanField
                value={depois.eliminacao_secrecao}
                onChange={(checked) =>
                  updateDepois({ eliminacao_secrecao: checked })
                }
                label="Eliminação de Secreção"
                disabled={disabled}
              />
              {tinhaDispneia && (
                <BooleanField
                  value={depois.reducao_desconforto}
                  onChange={(checked) =>
                    updateDepois({ reducao_desconforto: checked })
                  }
                  label="Redução de Sinais de Desconforto"
                  disabled={disabled}
                />
              )}
            </div>
            {!tinhaDispneia && (
              <p className="text-sm text-muted-foreground -mt-4">
                Sem dispneia na avaliação inicial: melhora do padrão
                respiratório e redução de sinais de desconforto não se aplicam.
              </p>
            )}

            {/* Tolerância e Comportamento Durante a Sessão */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-purple-700">
                👶 Tolerância e Comportamento
              </h4>

              <Field label="Tolerância ao Manuseio" required>
                <RadioButtonGroup
                  value={depois.tolerancia_manuseio}
                  onChange={(v) =>
                    updateDepois({
                      tolerancia_manuseio: v as 'boa' | 'regular' | 'ruim',
                    })
                  }
                  options={[
                    { valor: 'boa', label: '✅ Boa' },
                    { valor: 'regular', label: '⚠️ Regular' },
                    { valor: 'ruim', label: '❌ Ruim' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <Field label="Choro Durante Atendimento" required>
                <RadioButtonGroup
                  value={depois.choro_durante_atendimento}
                  onChange={(v) =>
                    updateDepois({
                      choro_durante_atendimento: v as
                        | 'ausente'
                        | 'leve'
                        | 'moderado'
                        | 'intenso',
                    })
                  }
                  options={[
                    { valor: 'ausente', label: '😊 Ausente' },
                    { valor: 'leve', label: '😢 Leve' },
                    { valor: 'moderado', label: '😭 Moderado' },
                    { valor: 'intenso', label: '😱 Intenso' },
                  ]}
                  disabled={disabled}
                />
              </Field>
            </div>

            {/* Mudança na Ausculta Pulmonar - Checkboxes */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-purple-700">
                🩺 Mudança na Ausculta Pulmonar
                {!auscultaInicialLimpa(evolucao) && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </h4>
              {auscultaInicialLimpa(evolucao) && (
                <p className="text-sm text-muted-foreground">
                  Ausculta inicial sem ruídos e com murmúrio preservado: não se
                  aplica. Marque só se algo mudou.
                </p>
              )}

              <div className="flex flex-wrap gap-4">
                <CheckboxField
                  label="Sem Alteração (igual)"
                  checked={depois.ausculta_sem_alteracao}
                  onChange={(checked) => {
                    updateDepois({
                      ausculta_sem_alteracao: checked,
                      // Se marcar "sem alteração", desmarca as outras opções
                      ausculta_melhorou: checked
                        ? false
                        : depois.ausculta_melhorou,
                      ausculta_pouca_melhora: checked
                        ? false
                        : depois.ausculta_pouca_melhora,
                      ausculta_reducao_roncos: checked
                        ? false
                        : depois.ausculta_reducao_roncos,
                      ausculta_reducao_sibilos: checked
                        ? false
                        : depois.ausculta_reducao_sibilos,
                      ausculta_reducao_estertores: checked
                        ? false
                        : depois.ausculta_reducao_estertores,
                      ausculta_melhora_mv: checked
                        ? false
                        : depois.ausculta_melhora_mv,
                    });
                  }}
                  disabled={disabled}
                />
                <CheckboxField
                  label="Pouca Melhora"
                  checked={depois.ausculta_pouca_melhora || false}
                  onChange={(checked) => {
                    updateDepois({
                      ausculta_pouca_melhora: checked,
                      ausculta_sem_alteracao: checked
                        ? false
                        : depois.ausculta_sem_alteracao,
                      ausculta_melhorou: checked
                        ? false
                        : depois.ausculta_melhorou,
                    });
                  }}
                  disabled={disabled}
                />
                <CheckboxField
                  label="Houve Melhora"
                  checked={depois.ausculta_melhorou}
                  onChange={(checked) => {
                    updateDepois({
                      ausculta_melhorou: checked,
                      ausculta_sem_alteracao: checked
                        ? false
                        : depois.ausculta_sem_alteracao,
                      ausculta_pouca_melhora: checked
                        ? false
                        : depois.ausculta_pouca_melhora,
                    });
                  }}
                  disabled={disabled}
                />
              </div>

              {(depois.ausculta_melhorou || depois.ausculta_pouca_melhora) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-4 border-l-2 border-purple-200">
                  <CheckboxField
                    label="Redução de Roncos"
                    checked={depois.ausculta_reducao_roncos}
                    onChange={(checked) =>
                      updateDepois({ ausculta_reducao_roncos: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Redução de Sibilos"
                    checked={depois.ausculta_reducao_sibilos}
                    onChange={(checked) =>
                      updateDepois({ ausculta_reducao_sibilos: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Redução de Estertores"
                    checked={depois.ausculta_reducao_estertores}
                    onChange={(checked) =>
                      updateDepois({ ausculta_reducao_estertores: checked })
                    }
                    disabled={disabled}
                  />
                  <CheckboxField
                    label="Melhora do Murmúrio Vesicular"
                    checked={depois.ausculta_melhora_mv}
                    onChange={(checked) =>
                      updateDepois({ ausculta_melhora_mv: checked })
                    }
                    disabled={disabled}
                  />
                </div>
              )}
            </div>

            {/* Sinais Vitais Após */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-green-700">
                🌡️ Sinais Vitais Após Intervenção
              </h4>
              {/* SpO₂ com chips de atalho + campo p/ valores fora da faixa */}
              <Field label="SpO₂ (%) (pós-atendimento)" required>
                <RadioButtonGroup
                  value={
                    depois.saturacao_o2 != null
                      ? String(depois.saturacao_o2)
                      : null
                  }
                  onChange={(v) =>
                    updateDepois({
                      saturacao_o2: Number(v),
                      saturacao_nao_aferida: false,
                    })
                  }
                  options={[
                    { valor: '94', label: '94' },
                    { valor: '95', label: '95' },
                    { valor: '96', label: '96' },
                    { valor: '97', label: '97' },
                    { valor: '98', label: '98' },
                    { valor: '99', label: '99' },
                    { valor: '100', label: '100' },
                  ]}
                  size="sm"
                  disabled={disabled || depois.saturacao_nao_aferida}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={depois.saturacao_o2 || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      updateDepois({
                        saturacao_o2: value ? Number(value) : undefined,
                        saturacao_nao_aferida: value
                          ? false
                          : depois.saturacao_nao_aferida,
                      });
                    }}
                    placeholder="Outro valor"
                    disabled={disabled || depois.saturacao_nao_aferida}
                    className="w-full sm:w-40"
                  />
                  <CheckboxField
                    label="Não aferida"
                    checked={depois.saturacao_nao_aferida || false}
                    onChange={(checked) =>
                      updateDepois({
                        saturacao_nao_aferida: checked,
                        saturacao_o2: checked ? undefined : depois.saturacao_o2,
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="FC (bpm) (pós-atendimento)" required>
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={40}
                      max={220}
                      value={depois.frequencia_cardiaca || ''}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        updateDepois({
                          frequencia_cardiaca: value
                            ? Number(value)
                            : undefined,
                          frequencia_cardiaca_nao_aferida: value
                            ? false
                            : depois.frequencia_cardiaca_nao_aferida,
                        });
                      }}
                      onKeyDown={(e) => {
                        if (
                          [
                            'Backspace',
                            'Delete',
                            'Tab',
                            'Escape',
                            'Enter',
                          ].includes(e.key) ||
                          (e.ctrlKey &&
                            ['a', 'c', 'v', 'x'].includes(
                              e.key.toLowerCase()
                            )) ||
                          [
                            'ArrowLeft',
                            'ArrowRight',
                            'ArrowUp',
                            'ArrowDown',
                          ].includes(e.key)
                        ) {
                          return;
                        }
                        if (!/[0-9]/.test(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      placeholder="115"
                      disabled={
                        disabled || depois.frequencia_cardiaca_nao_aferida
                      }
                      className="w-full sm:w-32"
                    />
                    <CheckboxField
                      label="Não aferida"
                      checked={depois.frequencia_cardiaca_nao_aferida || false}
                      onChange={(checked) =>
                        updateDepois({
                          frequencia_cardiaca_nao_aferida: checked,
                          frequencia_cardiaca: checked
                            ? undefined
                            : depois.frequencia_cardiaca,
                        })
                      }
                      disabled={disabled}
                    />
                  </div>
                </Field>
              </div>
            </div>

            <Field label="Comportamento da Criança Após a Sessão" required>
              <RadioButtonGroup
                value={depois.comportamento_crianca}
                onChange={(v) =>
                  updateDepois({
                    comportamento_crianca: v as
                      | 'calmo'
                      | 'sonolento'
                      | 'irritado'
                      | 'choroso'
                      | 'sem_mudanca',
                  })
                }
                options={[
                  { valor: 'calmo', label: '😊 Calmo' },
                  { valor: 'sonolento', label: '😴 Sonolento' },
                  { valor: 'irritado', label: '😤 Irritado' },
                  { valor: 'choroso', label: '😢 Choroso' },
                  { valor: 'sem_mudanca', label: '➖ Sem Mudança' },
                ]}
                disabled={disabled}
              />
            </Field>

            <Field label="Observações">
              <Textarea
                value={depois.observacoes || ''}
                onChange={(e) => updateDepois({ observacoes: e.target.value })}
                placeholder="Ex: Após intervenção, criança apresentou redução de roncos difusos e melhora do padrão respiratório, mantendo boa saturação."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // ORIENTAÇÕES AOS RESPONSÁVEIS
      // -----------------------------------------------------------------
      case 'orientacoes': {
        const orientacoes = evolucao.orientacoes;

        const updateOrientacoes = (
          updates: Partial<OrientacoesRespiratoria>
        ) => {
          onRespiratoriaChange({
            orientacoes: { ...orientacoes, ...updates },
          });
        };
        // "Nenhuma orientação" marcada trava a lista
        const travado = disabled || !!orientacoes.sem_orientacao;

        return (
          <div className="space-y-6">
            {/* Explicação */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>💡 Orientações importantes:</strong> Marque as
                orientações que foram passadas aos responsáveis durante o
                atendimento. Essas informações ajudam no acompanhamento e na
                continuidade do cuidado em casa.
              </p>
            </div>

            <SemOrientacaoBloco
              marcado={!!orientacoes.sem_orientacao}
              motivo={orientacoes.sem_orientacao_motivo}
              onMarcar={(marcado) =>
                updateOrientacoes(
                  marcado
                    ? {
                        sem_orientacao: true,
                        higiene_nasal: false,
                        posicionamento_dormir: false,
                        sinais_alerta: false,
                        outras: '',
                      }
                    : { sem_orientacao: false, sem_orientacao_motivo: null }
                )
              }
              onMotivo={(m) => updateOrientacoes({ sem_orientacao_motivo: m })}
              disabled={disabled}
            />

            {/* Higiene Nasal */}
            <div className="border rounded-lg p-4 space-y-4">
              <CheckboxField
                label="Higiene Nasal"
                checked={orientacoes.higiene_nasal}
                onChange={(checked) =>
                  updateOrientacoes({ higiene_nasal: checked })
                }
                disabled={travado}
              />
              {orientacoes.higiene_nasal && (
                <div className="pl-6 border-l-2 border-blue-200 space-y-2">
                  <CheckboxField
                    label="Técnica demonstrada"
                    checked={
                      orientacoes.higiene_nasal_tecnica_demonstrada || false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        higiene_nasal_tecnica_demonstrada: checked,
                      })
                    }
                    disabled={travado}
                  />
                  <CheckboxField
                    label="Frequência orientada conforme idade"
                    checked={
                      orientacoes.higiene_nasal_frequencia_orientada || false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        higiene_nasal_frequencia_orientada: checked,
                      })
                    }
                    disabled={travado}
                  />
                  <CheckboxField
                    label="Frequência orientada conforme necessidade"
                    checked={
                      orientacoes.higiene_nasal_frequencia_conforme_necessidade ||
                      false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        higiene_nasal_frequencia_conforme_necessidade: checked,
                      })
                    }
                    disabled={travado}
                  />
                </div>
              )}
            </div>

            {/* Posicionamento para Dormir e Repouso */}
            <div className="border rounded-lg p-4 space-y-4">
              <CheckboxField
                label="Posicionamento para Dormir e Repouso"
                checked={orientacoes.posicionamento_dormir}
                onChange={(checked) =>
                  updateOrientacoes({ posicionamento_dormir: checked })
                }
                disabled={travado}
              />
              {orientacoes.posicionamento_dormir && (
                <div className="pl-6 border-l-2 border-blue-200 space-y-2">
                  <CheckboxField
                    label="Cabeça elevada"
                    checked={orientacoes.posicionamento_cabeca_elevada || false}
                    onChange={(checked) =>
                      updateOrientacoes({
                        posicionamento_cabeca_elevada: checked,
                      })
                    }
                    disabled={travado}
                  />
                  <CheckboxField
                    label="Alternância de decúbitos"
                    checked={
                      orientacoes.posicionamento_alternancia_decubitos || false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        posicionamento_alternancia_decubitos: checked,
                      })
                    }
                    disabled={travado}
                  />
                  <CheckboxField
                    label="Prono (barriga para baixo)"
                    checked={orientacoes.posicionamento_prono || false}
                    onChange={(checked) =>
                      updateOrientacoes({
                        posicionamento_prono: checked,
                      })
                    }
                    disabled={travado}
                  />
                  <CheckboxField
                    label="Decúbito lateral direito"
                    checked={
                      orientacoes.posicionamento_decubito_lateral_direito ||
                      false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        posicionamento_decubito_lateral_direito: checked,
                      })
                    }
                    disabled={travado}
                  />
                  <CheckboxField
                    label="Decúbito lateral esquerdo"
                    checked={
                      orientacoes.posicionamento_decubito_lateral_esquerdo ||
                      false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        posicionamento_decubito_lateral_esquerdo: checked,
                      })
                    }
                    disabled={travado}
                  />
                </div>
              )}
            </div>

            {/* Sinais de Alerta */}
            <div className="border rounded-lg p-4 space-y-4">
              <CheckboxField
                label="Sinais de Alerta"
                checked={orientacoes.sinais_alerta}
                onChange={(checked) =>
                  updateOrientacoes({ sinais_alerta: checked })
                }
                disabled={travado}
              />
              {orientacoes.sinais_alerta && (
                <div className="pl-6 border-l-2 border-orange-200 space-y-2">
                  <CheckboxField
                    label="Aumento do esforço respiratório"
                    checked={
                      orientacoes.sinais_alerta_esforco_respiratorio || false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        sinais_alerta_esforco_respiratorio: checked,
                      })
                    }
                    disabled={travado}
                  />
                  <CheckboxField
                    label="Piora da tosse ou chiado"
                    checked={
                      orientacoes.sinais_alerta_piora_tosse_chiado || false
                    }
                    onChange={(checked) =>
                      updateOrientacoes({
                        sinais_alerta_piora_tosse_chiado: checked,
                      })
                    }
                    disabled={travado}
                  />
                  <CheckboxField
                    label="Queda de saturação (quando monitorada)"
                    checked={orientacoes.sinais_alerta_queda_saturacao || false}
                    onChange={(checked) =>
                      updateOrientacoes({
                        sinais_alerta_queda_saturacao: checked,
                      })
                    }
                    disabled={travado}
                  />
                  <CheckboxField
                    label="Piora da diurese"
                    checked={orientacoes.sinais_alerta_piora_diurese || false}
                    onChange={(checked) =>
                      updateOrientacoes({
                        sinais_alerta_piora_diurese: checked,
                      })
                    }
                    disabled={travado}
                  />
                  <CheckboxField
                    label="Febre"
                    checked={orientacoes.sinais_alerta_febre || false}
                    onChange={(checked) =>
                      updateOrientacoes({
                        sinais_alerta_febre: checked,
                      })
                    }
                    disabled={travado}
                  />
                  <CheckboxField
                    label="Prostração"
                    checked={orientacoes.sinais_alerta_prostracao || false}
                    onChange={(checked) =>
                      updateOrientacoes({
                        sinais_alerta_prostracao: checked,
                      })
                    }
                    disabled={travado}
                  />
                </div>
              )}
            </div>

            <Field label="Outras Orientações">
              <Textarea
                value={orientacoes.outras || ''}
                onChange={(e) => updateOrientacoes({ outras: e.target.value })}
                placeholder="Outras orientações específicas..."
                disabled={travado}
                rows={2}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // CONDUTA E PLANO
      // -----------------------------------------------------------------
      case 'conduta': {
        const conduta = evolucao.conduta;

        const updateConduta = (updates: Partial<CondutaRespiratoria>) => {
          onRespiratoriaChange({
            conduta: { ...conduta, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            {/* Manter Fisioterapia - principal decisão */}
            <BooleanField
              value={conduta.manter_fisioterapia}
              onChange={(checked) =>
                updateConduta({
                  manter_fisioterapia: checked,
                  // Limpa campos de alta quando manter fisio
                  alta: checked ? false : conduta.alta,
                  alta_parcial: checked ? false : conduta.alta_parcial,
                })
              }
              label="Manter Fisioterapia Respiratória"
              disabled={disabled}
            />

            {/* Se NÃO manter fisioterapia: mostra opções de Alta */}
            {!conduta.manter_fisioterapia && (
              <div className="pl-4 border-l-2 border-orange-200 space-y-4">
                <Field label="Tipo de Alta" required>
                  <RadioButtonGroup
                    value={
                      conduta.alta
                        ? 'completa'
                        : conduta.alta_parcial
                          ? 'parcial'
                          : null
                    }
                    onChange={(v) =>
                      updateConduta({
                        alta: v === 'completa',
                        alta_parcial: v === 'parcial',
                        // Limpa campos quando muda para alta completa
                        reavaliacao_dias:
                          v === 'completa'
                            ? undefined
                            : conduta.reavaliacao_dias,
                        encaminhamento_medico:
                          v === 'completa'
                            ? false
                            : conduta.encaminhamento_medico,
                        especialista_encaminhamento:
                          v === 'completa'
                            ? undefined
                            : conduta.especialista_encaminhamento,
                        motivo_encaminhamento:
                          v === 'completa'
                            ? undefined
                            : conduta.motivo_encaminhamento,
                      })
                    }
                    options={[
                      { valor: 'completa', label: '✅ Alta Completa' },
                      {
                        valor: 'parcial',
                        label: '⏳ Alta Parcial / Acompanhamento',
                      },
                    ]}
                    disabled={disabled}
                  />
                </Field>

                {/* Se Alta Parcial: mostra Reavaliação */}
                {conduta.alta_parcial && (
                  <div className="space-y-4 pl-4 border-l-2 border-yellow-200">
                    <Field label="Reavaliação em (dias)">
                      <Input
                        type="number"
                        min={1}
                        value={conduta.reavaliacao_dias || ''}
                        onChange={(e) =>
                          updateConduta({
                            reavaliacao_dias: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                        placeholder="Ex: 7"
                        disabled={disabled}
                        className="w-full sm:w-32"
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}

            {/* Encaminhamento Médico - se manter fisioterapia OU alta parcial */}
            {(conduta.manter_fisioterapia || conduta.alta_parcial) && (
              <>
                <BooleanField
                  value={conduta.encaminhamento_medico}
                  onChange={(checked) =>
                    updateConduta({ encaminhamento_medico: checked })
                  }
                  label="Encaminhamento Médico Necessário"
                  disabled={disabled}
                />

                {conduta.encaminhamento_medico && (
                  <div className="space-y-4 pl-4 border-l-2 border-blue-200">
                    <Field label="Especialista">
                      <Input
                        value={conduta.especialista_encaminhamento || ''}
                        onChange={(e) =>
                          updateConduta({
                            especialista_encaminhamento: e.target.value,
                          })
                        }
                        placeholder="Ex: Pneumologista, Otorrinolaringologista..."
                        disabled={disabled}
                      />
                    </Field>
                    <Field label="Motivo do Encaminhamento">
                      <Textarea
                        value={conduta.motivo_encaminhamento || ''}
                        onChange={(e) =>
                          updateConduta({
                            motivo_encaminhamento: e.target.value,
                          })
                        }
                        placeholder="Descreva o motivo do encaminhamento..."
                        disabled={disabled}
                        rows={2}
                      />
                    </Field>
                  </div>
                )}
              </>
            )}

            <Field label="Observações da Conduta">
              <Textarea
                value={conduta.observacoes || ''}
                onChange={(e) => updateConduta({ observacoes: e.target.value })}
                placeholder="Observações adicionais sobre a conduta..."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }
    }
  }

  // =========================================================================
  // EVOLUÇÃO MOTORA / ASSIMETRIA
  // =========================================================================

  if (tipoEvolucao === 'motora_assimetria') {
    const evolucao = evolucaoMotora;
    // Medidas programadas: o que foi feito hoje e a próxima reavaliação
    const medicoes = evolucao.medicoes || {};
    const setMedicao = (
      tipo: TipoMedidaMotora,
      m: MedicaoSessao | undefined
    ) => {
      const novo = { ...medicoes };
      if (m) novo[tipo] = m;
      else delete novo[tipo];
      onMotoraChange({ medicoes: novo });
    };
    const proximas = evolucao.proximas_reavaliacoes || {};
    const setProxima = (
      tipo: TipoMedidaMotora,
      p: ProximaReavaliacao | undefined
    ) => {
      const novo = { ...proximas };
      if (p) novo[tipo] = p;
      else delete novo[tipo];
      onMotoraChange({ proximas_reavaliacoes: novo });
    };
    const comValores = medidasComValores(evolucao);

    switch (secaoId) {
      // -----------------------------------------------------------------
      // FORMATO 1.3: objetivos e habilidades, intervenções, resposta
      // -----------------------------------------------------------------
      case 'objetivos_habilidades':
        return (
          <ObjetivosHabilidadesSecao
            evolucao={evolucao}
            onChange={onMotoraChange}
            disabled={disabled}
          />
        );
      case 'intervencoes':
        if (ehFormatoMotoraV14(evolucao))
          return (
            <IntervencaoSessaoSecao
              evolucao={evolucao}
              onChange={onMotoraChange}
              disabled={disabled}
            />
          );
        return (
          <IntervencoesSecao
            evolucao={evolucao}
            onChange={onMotoraChange}
            disabled={disabled}
          />
        );
      case 'resposta_sessao':
        return (
          <RespostaSessaoSecao
            evolucao={evolucao}
            onChange={onMotoraChange}
            disabled={disabled}
          />
        );

      // -----------------------------------------------------------------
      // CRANIOMETRIA
      // -----------------------------------------------------------------
      case 'craniometria': {
        const craniometria = evolucao.craniometria || {};

        const updateCraniometria = (updates: Partial<CraniometriaEvolucao>) => {
          const novasCraniometria = { ...craniometria, ...updates };
          const comCalculos =
            calcularMetricasCraniometriaEvolucao(novasCraniometria);
          onMotoraChange({
            craniometria: comCalculos,
          });
        };

        return (
          <MedicaoSessaoBloco
            tipo="craniometria"
            valor={medicoes.craniometria}
            onChange={(m) => setMedicao('craniometria', m)}
            temValores={comValores.includes('craniometria')}
            onDescartarValores={() => onMotoraChange({ craniometria: {} })}
            disabled={disabled}
          >
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  📐 Medidas para acompanhar a evolução da assimetria craniana.
                  CVA, CVAI e CI são calculados automaticamente. Preencha quando
                  a medição estiver indicada.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Diagonal A (mm)" ajuda="diagonal_a">
                  <Input
                    type="number"
                    min={0}
                    value={craniometria.diagonal_a_mm || ''}
                    onChange={(e) =>
                      updateCraniometria({
                        diagonal_a_mm: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Ex: 145"
                    disabled={disabled}
                  />
                </Field>
                <Field label="Diagonal B (mm)" ajuda="diagonal_b">
                  <Input
                    type="number"
                    min={0}
                    value={craniometria.diagonal_b_mm || ''}
                    onChange={(e) =>
                      updateCraniometria({
                        diagonal_b_mm: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Ex: 135"
                    disabled={disabled}
                  />
                </Field>
                <Field label="Comprimento AP (mm)" ajuda="comprimento_ap">
                  <Input
                    type="number"
                    min={0}
                    value={craniometria.comprimento_ap_mm || ''}
                    onChange={(e) =>
                      updateCraniometria({
                        comprimento_ap_mm: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Ex: 120"
                    disabled={disabled}
                  />
                </Field>
                <Field label="Largura ML (mm)" ajuda="largura_ml">
                  <Input
                    type="number"
                    min={0}
                    value={craniometria.largura_ml_mm || ''}
                    onChange={(e) =>
                      updateCraniometria({
                        largura_ml_mm: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Ex: 110"
                    disabled={disabled}
                  />
                </Field>
                <Field
                  label="Perímetro Cefálico (cm)"
                  ajuda="perimetro_cefalico"
                >
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={craniometria.perimetro_cefalico_cm || ''}
                    onChange={(e) =>
                      updateCraniometria({
                        perimetro_cefalico_cm: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Ex: 42.5"
                    disabled={disabled}
                  />
                </Field>
              </div>

              {/* Métricas Calculadas */}
              {(craniometria.cva_mm !== undefined ||
                craniometria.cvai_percentual !== undefined) && (
                <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
                  <TituloComAjuda
                    ajuda="metricas_cranio"
                    className="text-gray-700"
                  >
                    📊 Métricas Calculadas
                  </TituloComAjuda>

                  <div className="grid grid-cols-3 gap-4">
                    {craniometria.cva_mm !== undefined && (
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          {craniometria.cva_mm.toFixed(1)} mm
                        </div>
                        <div className="text-xs text-muted-foreground">CVA</div>
                      </div>
                    )}
                    {craniometria.cvai_percentual !== undefined && (
                      <div className="text-center">
                        <div
                          className={cn(
                            'text-2xl font-bold',
                            craniometria.cvai_percentual < 3.5
                              ? 'text-green-600'
                              : craniometria.cvai_percentual < 6.25
                                ? 'text-yellow-600'
                                : craniometria.cvai_percentual < 8.75
                                  ? 'text-orange-600'
                                  : 'text-red-600'
                          )}
                        >
                          {craniometria.cvai_percentual.toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          CVAI
                        </div>
                        {craniometria.plagiocefalia_severidade && (
                          <div className="text-xs font-medium first-letter:uppercase">
                            {ROTULO_PLAGIOCEFALIA[
                              craniometria.plagiocefalia_severidade
                            ] || craniometria.plagiocefalia_severidade}
                          </div>
                        )}
                      </div>
                    )}
                    {craniometria.ci_percentual !== undefined && (
                      <div className="text-center">
                        <div
                          className={cn(
                            'text-2xl font-bold',
                            craniometria.ci_percentual >= 75 &&
                              craniometria.ci_percentual < 85
                              ? 'text-green-600'
                              : craniometria.ci_percentual < 75
                                ? 'text-blue-600'
                                : 'text-orange-600'
                          )}
                        >
                          {craniometria.ci_percentual.toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          CI (índice cefálico)
                        </div>
                        {craniometria.braquicefalia_severidade && (
                          <div className="text-xs font-medium first-letter:uppercase">
                            {ROTULO_BRAQUICEFALIA[
                              craniometria.braquicefalia_severidade
                            ] || craniometria.braquicefalia_severidade}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    CVAI calculado sobre a maior diagonal, faixas da escala de
                    Atlanta (CHOA). CI: normal de 75% a menos de 85%. Mesma
                    convenção da avaliação. A classificação apoia a leitura dos
                    números: não substitui o exame do formato do crânio nem
                    indica capacete sozinha.
                  </p>
                </div>
              )}
              <ComparacaoCraniometria atual={craniometria} />
            </div>
          </MedicaoSessaoBloco>
        );
      }

      // -----------------------------------------------------------------
      // GONIOMETRIA
      // -----------------------------------------------------------------
      case 'goniometria': {
        const goniometria = evolucao.goniometria || {};

        const updateGoniometria = (updates: Partial<GoniometriaEvolucao>) => {
          onMotoraChange({
            goniometria: calcularDiferencasGoniometria({
              ...goniometria,
              ...updates,
            }),
          });
        };

        const diferencas = [
          {
            label: 'Rotação passiva',
            valor: goniometria.diferenca_rotacao_passiva,
            classifica: true,
            lado: ladoMenorAmplitude(
              goniometria.rotacao_passiva_direita,
              goniometria.rotacao_passiva_esquerda
            ),
          },
          {
            label: 'Rotação ativa',
            valor: goniometria.diferenca_rotacao_ativa,
            classifica: true,
            lado: ladoMenorAmplitude(
              goniometria.rotacao_ativa_direita,
              goniometria.rotacao_ativa_esquerda
            ),
          },
          {
            label: 'Inclinação passiva',
            valor: goniometria.diferenca_inclinacao_passiva,
            classifica: false,
            lado: ladoMenorAmplitude(
              goniometria.inclinacao_passiva_direita,
              goniometria.inclinacao_passiva_esquerda
            ),
          },
          {
            label: 'Inclinação ativa',
            valor: goniometria.diferenca_inclinacao_ativa,
            classifica: false,
            lado: ladoMenorAmplitude(
              goniometria.inclinacao_ativa_direita,
              goniometria.inclinacao_ativa_esquerda
            ),
          },
        ].filter((d) => d.valor !== undefined);

        const corClassificacao: Record<string, string> = {
          normal: 'text-green-600',
          leve: 'text-yellow-600',
          moderada: 'text-orange-600',
          severa: 'text-red-600',
        };

        return (
          <MedicaoSessaoBloco
            tipo="goniometria"
            valor={medicoes.goniometria}
            onChange={(m) => setMedicao('goniometria', m)}
            temValores={comValores.includes('goniometria')}
            onDescartarValores={() => onMotoraChange({ goniometria: {} })}
            disabled={disabled}
          >
            <div className="space-y-6">
              <div className="border rounded-lg p-4 space-y-4">
                <TituloComAjuda ajuda="rotacao" className="text-blue-700">
                  Rotação Cervical (graus)
                </TituloComAjuda>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Ativa D">
                    <Input
                      type="number"
                      min={0}
                      max={180}
                      value={goniometria.rotacao_ativa_direita ?? ''}
                      onChange={(e) =>
                        updateGoniometria({
                          rotacao_ativa_direita: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Ativa E">
                    <Input
                      type="number"
                      min={0}
                      max={180}
                      value={goniometria.rotacao_ativa_esquerda ?? ''}
                      onChange={(e) =>
                        updateGoniometria({
                          rotacao_ativa_esquerda: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Passiva D">
                    <Input
                      type="number"
                      min={0}
                      max={180}
                      value={goniometria.rotacao_passiva_direita ?? ''}
                      onChange={(e) =>
                        updateGoniometria({
                          rotacao_passiva_direita: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Passiva E">
                    <Input
                      type="number"
                      min={0}
                      max={180}
                      value={goniometria.rotacao_passiva_esquerda ?? ''}
                      onChange={(e) =>
                        updateGoniometria({
                          rotacao_passiva_esquerda: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={disabled}
                    />
                  </Field>
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-4">
                <TituloComAjuda ajuda="inclinacao" className="text-purple-700">
                  Inclinação Lateral (graus)
                </TituloComAjuda>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Field label="Ativa D">
                    <Input
                      type="number"
                      min={0}
                      max={90}
                      value={goniometria.inclinacao_ativa_direita ?? ''}
                      onChange={(e) =>
                        updateGoniometria({
                          inclinacao_ativa_direita: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Ativa E">
                    <Input
                      type="number"
                      min={0}
                      max={90}
                      value={goniometria.inclinacao_ativa_esquerda ?? ''}
                      onChange={(e) =>
                        updateGoniometria({
                          inclinacao_ativa_esquerda: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Passiva D">
                    <Input
                      type="number"
                      min={0}
                      max={90}
                      value={goniometria.inclinacao_passiva_direita ?? ''}
                      onChange={(e) =>
                        updateGoniometria({
                          inclinacao_passiva_direita: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={disabled}
                    />
                  </Field>
                  <Field label="Passiva E">
                    <Input
                      type="number"
                      min={0}
                      max={90}
                      value={goniometria.inclinacao_passiva_esquerda ?? ''}
                      onChange={(e) =>
                        updateGoniometria({
                          inclinacao_passiva_esquerda: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      disabled={disabled}
                    />
                  </Field>
                </div>
              </div>

              {diferencas.length > 0 && (
                <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
                  <h4 className="font-medium text-gray-700">
                    📊 Diferença entre os lados
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {diferencas.map((d) => {
                      const classe = d.classifica
                        ? classificarDiferencaCervical(d.valor)
                        : undefined;
                      return (
                        <div key={d.label} className="text-center">
                          <div
                            className={cn(
                              'text-2xl font-bold',
                              classe
                                ? corClassificacao[classe]
                                : 'text-blue-600'
                            )}
                          >
                            {d.valor}°
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {d.label}
                          </div>
                          {classe && (
                            <div className="text-xs font-medium capitalize">
                              {classe}
                            </div>
                          )}
                          {d.lado && (
                            <div className="text-xs text-muted-foreground">
                              menor para a {d.lado}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Rotação classificada com as mesmas faixas da avaliação:{' '}
                    {TEXTO_FAIXAS_DIFERENCA_CERVICAL}. A classificação apoia a
                    leitura dos números e não é um diagnóstico por si só.
                  </p>
                </div>
              )}

              <Field label="Observações">
                <Textarea
                  value={goniometria.observacoes || ''}
                  onChange={(e) =>
                    updateGoniometria({ observacoes: e.target.value })
                  }
                  placeholder="Observações sobre amplitude de movimento..."
                  disabled={disabled}
                  rows={2}
                />
              </Field>
              <ComparacaoGoniometria
                atual={goniometria as Record<string, unknown>}
              />
            </div>
          </MedicaoSessaoBloco>
        );
      }

      // -----------------------------------------------------------------
      // PALPAÇÃO ECOM
      // -----------------------------------------------------------------
      case 'palpacao': {
        const palpacao = evolucao.palpacao || {};

        const updatePalpacao = (updates: Partial<PalpacaoECOMEvolucao>) => {
          onMotoraChange({
            palpacao: { ...palpacao, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ECOM Direito */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium text-blue-700">ECOM Direito</h4>

                <Field label="Tônus" ajuda="ecom_tonus">
                  <RadioButtonGroup
                    value={palpacao.ecom_direito_tonus}
                    onChange={(v) =>
                      updatePalpacao({
                        ecom_direito_tonus: v as
                          | 'normal'
                          | 'tenso'
                          | 'tenso_corda',
                      })
                    }
                    options={[
                      { valor: 'normal', label: '✅ Normal' },
                      { valor: 'tenso', label: '⚠️ Tenso' },
                      { valor: 'tenso_corda', label: '🔴 Em corda' },
                    ]}
                    layout="vertical"
                    disabled={disabled}
                  />
                </Field>

                <CheckboxField
                  label="Nódulo Presente"
                  ajuda="nodulo"
                  checked={palpacao.nodulo_direito || false}
                  onChange={(checked) =>
                    updatePalpacao({ nodulo_direito: checked })
                  }
                  disabled={disabled}
                />
              </div>

              {/* ECOM Esquerdo */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium text-purple-700">ECOM Esquerdo</h4>

                <Field label="Tônus" ajuda="ecom_tonus">
                  <RadioButtonGroup
                    value={palpacao.ecom_esquerdo_tonus}
                    onChange={(v) =>
                      updatePalpacao({
                        ecom_esquerdo_tonus: v as
                          | 'normal'
                          | 'tenso'
                          | 'tenso_corda',
                      })
                    }
                    options={[
                      { valor: 'normal', label: '✅ Normal' },
                      { valor: 'tenso', label: '⚠️ Tenso' },
                      { valor: 'tenso_corda', label: '🔴 Em corda' },
                    ]}
                    layout="vertical"
                    disabled={disabled}
                  />
                </Field>

                <CheckboxField
                  label="Nódulo Presente"
                  ajuda="nodulo"
                  checked={palpacao.nodulo_esquerdo || false}
                  onChange={(checked) =>
                    updatePalpacao({ nodulo_esquerdo: checked })
                  }
                  disabled={disabled}
                />
              </div>
            </div>

            {(palpacao.nodulo_direito || palpacao.nodulo_esquerdo) && (
              <>
                <Field label="Tamanho do Nódulo">
                  <RadioButtonGroup
                    value={palpacao.nodulo_tamanho}
                    onChange={(v) =>
                      updatePalpacao({
                        nodulo_tamanho: v as
                          | 'menor_1cm'
                          | '1_3cm'
                          | 'maior_3cm',
                      })
                    }
                    options={[
                      { valor: 'menor_1cm', label: '< 1cm' },
                      { valor: '1_3cm', label: '1-3cm' },
                      { valor: 'maior_3cm', label: '> 3cm' },
                    ]}
                    disabled={disabled}
                  />
                </Field>

                <Field label="Localização do Nódulo">
                  <RadioButtonGroup
                    value={palpacao.nodulo_localizacao}
                    onChange={(v) =>
                      updatePalpacao({
                        nodulo_localizacao: v as
                          | 'terco_inferior'
                          | 'terco_medio'
                          | 'terco_superior',
                      })
                    }
                    options={[
                      { valor: 'terco_inferior', label: 'Terço Inferior' },
                      { valor: 'terco_medio', label: 'Terço Médio' },
                      { valor: 'terco_superior', label: 'Terço Superior' },
                    ]}
                    disabled={disabled}
                  />
                </Field>
              </>
            )}

            {/* Desde 1.4: cervical posterior/anterior e bloqueios */}
            {ehFormatoMotoraV14(evolucao) && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TensaoRegiaoCampo
                    titulo="Musculatura cervical posterior"
                    valor={palpacao.cervical_posterior}
                    onChange={(v) => updatePalpacao({ cervical_posterior: v })}
                    disabled={disabled}
                  />
                  <TensaoRegiaoCampo
                    titulo="Musculatura cervical anterior"
                    valor={palpacao.cervical_anterior}
                    onChange={(v) => updatePalpacao({ cervical_anterior: v })}
                    disabled={disabled}
                  />
                </div>
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium flex items-center gap-1">
                    Bloqueio articular
                    <AjudaParametroBotao id="bloqueio_articular" />
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Marque onde há bloqueio e o lado mais tenso.
                  </p>
                  {LOCAIS_BLOQUEIO.map((loc) => {
                    const b = (palpacao.bloqueios || []).find(
                      (x) => x.local === loc.id
                    );
                    const setBloqueio = (
                      lado: LadoMaisTenso | undefined,
                      marcado: boolean
                    ) => {
                      const resto = (palpacao.bloqueios || []).filter(
                        (x) => x.local !== loc.id
                      );
                      updatePalpacao({
                        bloqueios: marcado
                          ? [
                              ...resto,
                              {
                                local: loc.id as LocalBloqueio,
                                ...(lado ? { lado } : {}),
                              },
                            ]
                          : resto,
                      });
                    };
                    return (
                      <div key={loc.id} className="space-y-2">
                        <CheckboxField
                          label={loc.nome}
                          checked={!!b}
                          onChange={(c) => setBloqueio(undefined, c)}
                          disabled={disabled}
                        />
                        {b && (
                          <div className="pl-6">
                            <EscolhaCurta
                              rotulo={`Lado mais tenso: ${loc.nome}`}
                              opcoes={LADOS_MAIS_TENSO}
                              valor={b.lado}
                              onChange={(l) =>
                                setBloqueio(
                                  l as LadoMaisTenso | undefined,
                                  true
                                )
                              }
                              disabled={disabled}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <Field label="Observações">
              <Textarea
                value={palpacao.observacoes || ''}
                onChange={(e) =>
                  updatePalpacao({ observacoes: e.target.value })
                }
                placeholder="Observações sobre palpação..."
                disabled={disabled}
                rows={2}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // CONTROLE MOTOR
      // -----------------------------------------------------------------
      case 'controle_motor': {
        const controle = evolucao.controle_motor || {};

        const updateControle = (updates: Partial<ControleMotorEvolucao>) => {
          onMotoraChange({
            controle_motor: { ...controle, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            {/* Supino */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-700">
                🔷 SUPINO (Barriga para cima)
              </h4>

              <Field
                label="Manutenção na Linha Média"
                ajuda="supino_linha_media"
              >
                <RadioButtonGroup
                  value={controle.supino_linha_media}
                  onChange={(v) =>
                    updateControle({
                      supino_linha_media: v as
                        | 'mantem_firme'
                        | 'cai_preferencia'
                        | 'instavel',
                    })
                  }
                  options={[
                    { valor: 'mantem_firme', label: '✅ Mantém firme' },
                    {
                      valor: 'cai_preferencia',
                      label: '⚠️ Cai para preferência',
                    },
                    { valor: 'instavel', label: '❌ Instável' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <Field
                label="Alcance de Linha Média (Mãos)"
                ajuda="supino_alcance"
              >
                <RadioButtonGroup
                  value={controle.supino_alcance}
                  onChange={(v) =>
                    updateControle({
                      supino_alcance: v as
                        | 'maos_joelhos'
                        | 'maos_boca'
                        | 'maos_ar'
                        | 'ausente',
                    })
                  }
                  options={[
                    { valor: 'maos_joelhos', label: 'Mãos nos joelhos' },
                    { valor: 'maos_boca', label: 'Mãos na boca' },
                    { valor: 'maos_ar', label: 'Mãos no ar' },
                    { valor: 'ausente', label: 'Ausente' },
                  ]}
                  disabled={disabled}
                />
              </Field>
            </div>

            {/* Prono */}
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-orange-700">
                🔶 PRONO (Tummy Time)
              </h4>

              <Field label="Tolerância" ajuda="prono_tolerancia">
                <RadioButtonGroup
                  value={controle.prono_tolerancia}
                  onChange={(v) =>
                    updateControle({
                      prono_tolerancia: v as
                        | 'boa'
                        | 'chora_imediato'
                        | 'cansa_rapido',
                    })
                  }
                  options={[
                    { valor: 'boa', label: '✅ Boa' },
                    { valor: 'cansa_rapido', label: '⚠️ Cansa rápido' },
                    { valor: 'chora_imediato', label: '❌ Chora imediato' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <Field label="Carga de Peso" ajuda="prono_carga_peso">
                <RadioButtonGroup
                  value={controle.prono_carga_peso}
                  onChange={(v) =>
                    updateControle({
                      prono_carga_peso: v as
                        | 'cotovelos'
                        | 'maos_estendidas'
                        | 'nao_levanta',
                    })
                  }
                  options={[
                    { valor: 'cotovelos', label: 'Cotovelos' },
                    { valor: 'maos_estendidas', label: 'Mãos estendidas' },
                    { valor: 'nao_levanta', label: 'Não levanta' },
                  ]}
                  disabled={disabled}
                />
              </Field>

              <Field label="Controle de Cabeça" ajuda="prono_controle_cabeca">
                <RadioButtonGroup
                  value={controle.prono_controle_cabeca}
                  onChange={(v) =>
                    updateControle({
                      prono_controle_cabeca: v as
                        | '45_graus'
                        | '90_graus'
                        | 'oscila',
                    })
                  }
                  options={[
                    { valor: '45_graus', label: '45°' },
                    { valor: '90_graus', label: '90°' },
                    { valor: 'oscila', label: 'Oscila' },
                  ]}
                  disabled={disabled}
                />
              </Field>
            </div>

            <Field label="Observações">
              <Textarea
                value={controle.observacoes || ''}
                onChange={(e) =>
                  updateControle({ observacoes: e.target.value })
                }
                placeholder="Observações sobre controle motor..."
                disabled={disabled}
                rows={2}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // INTERVENÇÃO (Motora)
      // -----------------------------------------------------------------
      case 'intervencao': {
        const intervencao = evolucao.intervencao;

        const updateIntervencao = (
          updates: Partial<IntervencaoMotoraAssimetria>
        ) => {
          onMotoraChange({
            intervencao: { ...intervencao, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <div className="border rounded-lg p-4 space-y-4">
              <h4 className="font-medium text-blue-700">Técnicas Realizadas</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CheckboxField
                  label="Alongamentos"
                  checked={intervencao.alongamentos}
                  onChange={(checked) =>
                    updateIntervencao({ alongamentos: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Fortalecimento"
                  checked={intervencao.fortalecimento}
                  onChange={(checked) =>
                    updateIntervencao({ fortalecimento: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Estimulação Sensorial"
                  checked={intervencao.estimulacao_sensorial}
                  onChange={(checked) =>
                    updateIntervencao({ estimulacao_sensorial: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Posicionamentos Terapêuticos"
                  checked={intervencao.posicionamentos_terapeuticos}
                  onChange={(checked) =>
                    updateIntervencao({ posicionamentos_terapeuticos: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Tummy Time"
                  checked={intervencao.tummy_time}
                  onChange={(checked) =>
                    updateIntervencao({ tummy_time: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Bandagem Kinesio"
                  checked={intervencao.bandagem_kinesio}
                  onChange={(checked) =>
                    updateIntervencao({ bandagem_kinesio: checked })
                  }
                  disabled={disabled}
                />
                <CheckboxField
                  label="Orientação aos Pais"
                  checked={intervencao.orientacao_pais}
                  onChange={(checked) =>
                    updateIntervencao({ orientacao_pais: checked })
                  }
                  disabled={disabled}
                />
              </div>
            </div>

            <Field label="Outras Técnicas">
              <Textarea
                value={intervencao.outras_tecnicas || ''}
                onChange={(e) =>
                  updateIntervencao({ outras_tecnicas: e.target.value })
                }
                placeholder="Descreva outras técnicas utilizadas..."
                disabled={disabled}
                rows={2}
              />
            </Field>

            <Field label="Observações">
              <Textarea
                value={intervencao.observacoes || ''}
                onChange={(e) =>
                  updateIntervencao({ observacoes: e.target.value })
                }
                placeholder="Detalhes da intervenção..."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // RESPOSTA (Motora)
      // -----------------------------------------------------------------
      case 'resposta': {
        const resposta = evolucao.resposta;
        const itensVisiveis = itensRespostaVisiveis(evolucao.areas);
        const respostaVisivel = (id: (typeof itensVisiveis)[number]) =>
          itensVisiveis.includes(id);

        const updateResposta = (
          updates: Partial<RespostaIntervencaoMotora>
        ) => {
          onMotoraChange({
            resposta: { ...resposta, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <div className="space-y-1">
              <h4 className="font-medium">
                Em relação à sessão anterior, você observou:
              </h4>
              <p className="text-sm text-muted-foreground">
                Use “Não avaliado” quando não deu para observar. O que ficar em
                branco sai como não registrado.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {respostaVisivel('melhora_adm') && (
                <RespostaField
                  value={resposta.melhora_adm}
                  onChange={(v) => updateResposta({ melhora_adm: v })}
                  label="Melhora da ADM"
                  ajuda="melhora_adm"
                  disabled={disabled}
                />
              )}
              {respostaVisivel('reducao_preferencia_postural') && (
                <RespostaField
                  value={resposta.reducao_preferencia_postural}
                  onChange={(v) =>
                    updateResposta({ reducao_preferencia_postural: v })
                  }
                  label="Redução da Preferência Postural"
                  ajuda="reducao_preferencia_postural"
                  disabled={disabled}
                />
              )}
              {respostaVisivel('melhora_controle_cervical') && (
                <RespostaField
                  value={resposta.melhora_controle_cervical}
                  onChange={(v) =>
                    updateResposta({ melhora_controle_cervical: v })
                  }
                  label="Melhora do Controle Cervical"
                  ajuda="melhora_controle_cervical"
                  disabled={disabled}
                />
              )}
              {respostaVisivel('tolerancia_prono_melhorou') && (
                <RespostaField
                  value={resposta.tolerancia_prono_melhorou}
                  onChange={(v) =>
                    updateResposta({ tolerancia_prono_melhorou: v })
                  }
                  label="Tolerância ao Prono Melhorou"
                  ajuda="tolerancia_prono_melhorou"
                  disabled={disabled}
                />
              )}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Relato do responsável</h4>
              <EscolhaField
                value={resposta.adesao_domiciliar}
                onChange={(v) => updateResposta({ adesao_domiciliar: v })}
                opcoes={OPCOES_ADESAO}
                label="O responsável relata ter realizado as orientações domiciliares?"
                ajuda="adesao_domiciliar"
                disabled={disabled}
              />
              {!resposta.adesao_domiciliar &&
                resposta.pais_seguindo_orientacoes !== undefined &&
                resposta.pais_seguindo_orientacoes !== null && (
                  <p className="text-xs text-muted-foreground">
                    Registro antigo, pergunta anterior: “Pais seguindo
                    orientações” ={' '}
                    {resposta.pais_seguindo_orientacoes === true
                      ? 'Sim'
                      : resposta.pais_seguindo_orientacoes === false
                        ? 'Não'
                        : 'Não avaliado'}
                    .
                  </p>
                )}
            </div>

            <Field label="Observações">
              <Textarea
                value={resposta.observacoes || ''}
                onChange={(e) =>
                  updateResposta({ observacoes: e.target.value })
                }
                placeholder="Observações sobre a resposta ao tratamento..."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // ORIENTAÇÕES (Motora)
      // -----------------------------------------------------------------
      case 'orientacoes': {
        const orientacoes = evolucao.orientacoes;

        const updateOrientacoes = (
          updates: Partial<OrientacoesMotoraAssimetria>
        ) => {
          onMotoraChange({
            orientacoes: { ...orientacoes, ...updates },
          });
        };
        // "Nenhuma orientação" marcada trava a lista
        const travado = disabled || !!orientacoes.sem_orientacao;

        // 1.4: lista enxuta, exercícios por área e tummy time em botões
        if (ehFormatoMotoraV14(evolucao)) {
          const exercicios = EXERCICIOS_DOMICILIARES.filter((x) =>
            x.areas.some((a) => (evolucao.areas || []).includes(a))
          );
          const marcados = orientacoes.exercicios || [];
          const setTummy = (
            vezes: TummyVezes | null | undefined,
            minutos: TummyMinutos | null | undefined
          ) =>
            updateOrientacoes({
              tummy_time_vezes: vezes ?? null,
              tummy_time_minutos: minutos ?? null,
              tummy_time_frequencia: textoTummyTime(vezes, minutos),
            });
          return (
            <div className="space-y-6">
              <SemOrientacaoBloco
                marcado={!!orientacoes.sem_orientacao}
                motivo={orientacoes.sem_orientacao_motivo}
                onMarcar={(marcado) =>
                  updateOrientacoes(
                    marcado
                      ? {
                          sem_orientacao: true,
                          posicionamento_sono: false,
                          posicionamento_vigilia: false,
                          colo_alternando: false,
                          tempo_no_chao: false,
                          sinais_alerta: false,
                          exercicios: [],
                          tummy_time_vezes: null,
                          tummy_time_minutos: null,
                          tummy_time_frequencia: '',
                          outras: '',
                        }
                      : { sem_orientacao: false, sem_orientacao_motivo: null }
                  )
                }
                onMotivo={(m) =>
                  updateOrientacoes({ sem_orientacao_motivo: m })
                }
                disabled={disabled}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CheckboxField
                  label="Sono seguro (de barriga para cima, sem posicionadores)"
                  checked={orientacoes.posicionamento_sono}
                  onChange={(c) =>
                    updateOrientacoes({ posicionamento_sono: c })
                  }
                  disabled={travado}
                />
                <CheckboxField
                  label="Brinquedos e posicionamentos no lado não preferido"
                  checked={orientacoes.posicionamento_vigilia || false}
                  onChange={(c) =>
                    updateOrientacoes({ posicionamento_vigilia: c })
                  }
                  disabled={travado}
                />
                <CheckboxField
                  label="Colo alternando os lados (carregar e mamar)"
                  checked={orientacoes.colo_alternando || false}
                  onChange={(c) => updateOrientacoes({ colo_alternando: c })}
                  disabled={travado}
                />
                <CheckboxField
                  label="Mais tempo no chão (menos bebê-conforto e cadeirinha)"
                  checked={orientacoes.tempo_no_chao || false}
                  onChange={(c) => updateOrientacoes({ tempo_no_chao: c })}
                  disabled={travado}
                />
                <CheckboxField
                  label="Sinais de alerta"
                  checked={orientacoes.sinais_alerta}
                  onChange={(c) => updateOrientacoes({ sinais_alerta: c })}
                  disabled={travado}
                />
              </div>

              {exercicios.length > 0 && (
                <Field label="Exercícios para casa">
                  <div className="flex flex-wrap gap-2">
                    {exercicios.map((x) => {
                      const sel = marcados.includes(x.id);
                      return (
                        <Button
                          key={x.id}
                          type="button"
                          size="sm"
                          variant={sel ? 'default' : 'outline'}
                          aria-pressed={sel}
                          disabled={travado}
                          onClick={() =>
                            updateOrientacoes({
                              exercicios: sel
                                ? marcados.filter((y) => y !== x.id)
                                : [...marcados, x.id],
                            })
                          }
                          className="h-auto min-h-8 whitespace-normal text-left"
                        >
                          {x.nome}
                        </Button>
                      );
                    })}
                  </div>
                </Field>
              )}

              <Field
                label="Tummy time (acordado e supervisionado)"
                ajuda="tummy_time"
              >
                <div className="space-y-2">
                  <EscolhaCurta
                    rotulo="Tummy time: vezes ao dia"
                    opcoes={TUMMY_VEZES.map((v) => ({
                      id: v,
                      nome: v + ' ao dia',
                    }))}
                    valor={orientacoes.tummy_time_vezes}
                    onChange={(v) =>
                      setTummy(
                        v as TummyVezes | undefined,
                        orientacoes.tummy_time_minutos
                      )
                    }
                    disabled={travado}
                  />
                  <EscolhaCurta
                    rotulo="Tummy time: minutos cada vez"
                    opcoes={TUMMY_MINUTOS.map((v) => ({ id: v, nome: v }))}
                    valor={orientacoes.tummy_time_minutos}
                    onChange={(v) =>
                      setTummy(
                        orientacoes.tummy_time_vezes,
                        v as TummyMinutos | undefined
                      )
                    }
                    disabled={travado}
                  />
                </div>
              </Field>

              <Field label="Outras orientações">
                <Textarea
                  value={orientacoes.outras || ''}
                  onChange={(e) =>
                    updateOrientacoes({ outras: e.target.value })
                  }
                  placeholder="Outras orientações específicas..."
                  disabled={travado}
                  rows={2}
                />
              </Field>
            </div>
          );
        }

        return (
          <div className="space-y-6">
            <SemOrientacaoBloco
              marcado={!!orientacoes.sem_orientacao}
              motivo={orientacoes.sem_orientacao_motivo}
              onMarcar={(marcado) =>
                updateOrientacoes(
                  marcado
                    ? {
                        sem_orientacao: true,
                        posicionamento_sono: false,
                        posicionamento_vigilia: false,
                        exercicios_domiciliares: false,
                        sinais_alerta: false,
                        uso_capacete: false,
                        tummy_time_frequencia: '',
                        outras: '',
                      }
                    : { sem_orientacao: false, sem_orientacao_motivo: null }
                )
              }
              onMotivo={(m) => updateOrientacoes({ sem_orientacao_motivo: m })}
              disabled={disabled}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CheckboxField
                label="Sono seguro (de barriga para cima, sem posicionadores)"
                checked={orientacoes.posicionamento_sono}
                onChange={(checked) =>
                  updateOrientacoes({ posicionamento_sono: checked })
                }
                disabled={travado}
              />
              <CheckboxField
                label="Posicionamento e brincadeiras acordado (estimular o lado não preferido)"
                checked={orientacoes.posicionamento_vigilia || false}
                onChange={(checked) =>
                  updateOrientacoes({ posicionamento_vigilia: checked })
                }
                disabled={travado}
              />
              <CheckboxField
                label="Exercícios Domiciliares"
                checked={orientacoes.exercicios_domiciliares}
                onChange={(checked) =>
                  updateOrientacoes({ exercicios_domiciliares: checked })
                }
                disabled={travado}
              />
              <CheckboxField
                label="Sinais de Alerta"
                checked={orientacoes.sinais_alerta}
                onChange={(checked) =>
                  updateOrientacoes({ sinais_alerta: checked })
                }
                disabled={travado}
              />
              {capaceteVisivel(evolucao.areas) && (
                <CheckboxField
                  label="Uso de Capacete (se indicado)"
                  checked={orientacoes.uso_capacete || false}
                  onChange={(checked) =>
                    updateOrientacoes({ uso_capacete: checked })
                  }
                  disabled={travado}
                />
              )}
            </div>

            <Field label="Frequência do Tummy Time (acordado e supervisionado)">
              <Input
                value={orientacoes.tummy_time_frequencia || ''}
                onChange={(e) =>
                  updateOrientacoes({ tummy_time_frequencia: e.target.value })
                }
                placeholder="Ex: 3x ao dia, 10-15 min cada"
                disabled={travado}
              />
            </Field>

            <Field label="Outras Orientações">
              <Textarea
                value={orientacoes.outras || ''}
                onChange={(e) => updateOrientacoes({ outras: e.target.value })}
                placeholder="Outras orientações específicas..."
                disabled={travado}
                rows={3}
              />
            </Field>
          </div>
        );
      }

      // -----------------------------------------------------------------
      // CONDUTA (Motora)
      // -----------------------------------------------------------------
      case 'conduta': {
        const conduta = evolucao.conduta;

        const updateConduta = (updates: Partial<CondutaMotoraAssimetria>) => {
          onMotoraChange({
            conduta: { ...conduta, ...updates },
          });
        };

        return (
          <div className="space-y-6">
            <BooleanField
              value={conduta.manter_fisioterapia}
              onChange={(checked) =>
                updateConduta({ manter_fisioterapia: checked })
              }
              label="Manter Fisioterapia"
              disabled={disabled}
            />

            {conduta.manter_fisioterapia && (
              <Field label="Frequência Sugerida">
                <RadioButtonGroup
                  value={conduta.frequencia_sugerida}
                  onChange={(v) =>
                    updateConduta({
                      frequencia_sugerida: v as
                        | 'diaria'
                        | '2x_semana'
                        | '3x_semana'
                        | 'semanal'
                        | 'quinzenal',
                    })
                  }
                  options={[
                    { valor: 'diaria', label: 'Diária' },
                    { valor: '3x_semana', label: '3x/semana' },
                    { valor: '2x_semana', label: '2x/semana' },
                    { valor: 'semanal', label: 'Semanal' },
                    { valor: 'quinzenal', label: 'Quinzenal' },
                  ]}
                  disabled={disabled}
                />
              </Field>
            )}

            {(!ehFormatoMotoraV14(evolucao) ||
              conduta.manter_fisioterapia === false) && (
              <Field label="Reavaliação em (dias)" ajuda="reavaliacao_dias">
                <Input
                  type="number"
                  min={1}
                  value={conduta.reavaliacao_dias || ''}
                  onChange={(e) =>
                    updateConduta({
                      reavaliacao_dias: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  placeholder="Ex: 30"
                  disabled={disabled}
                  className="w-full sm:w-32"
                />
              </Field>
            )}

            <BooleanField
              value={conduta.encaminhamento_medico}
              onChange={(checked) =>
                updateConduta({ encaminhamento_medico: checked })
              }
              label="Encaminhamento Médico Necessário"
              disabled={disabled}
            />

            {capaceteVisivel(evolucao.areas) && (
              <BooleanField
                value={conduta.indicacao_capacete || false}
                onChange={(checked) =>
                  updateConduta({ indicacao_capacete: checked })
                }
                label="Indicação de Capacete Ortopédico"
                disabled={disabled}
              />
            )}

            {(conduta.encaminhamento_medico || conduta.indicacao_capacete) && (
              <Field label="Motivo">
                <Textarea
                  value={conduta.motivo_encaminhamento || ''}
                  onChange={(e) =>
                    updateConduta({ motivo_encaminhamento: e.target.value })
                  }
                  placeholder="Descreva o motivo..."
                  disabled={disabled}
                  rows={2}
                />
              </Field>
            )}

            {/* Some sozinho para quem não vê medidas (secretaria). No 1.4 as
                medidas vêm dos objetivos e "próxima medição" saiu */}
            {!ehFormatoMotoraV14(evolucao) && (
              <ReavaliacoesConduta
                medicoes={medicoes}
                proximas={proximas}
                onMedicaoChange={setMedicao}
                onProximaChange={setProxima}
                tiposComSecao={secoesMotorasVisiveis(
                  evolucao.areas,
                  ehFormatoMotoraV13(evolucao)
                )
                  .map((sec) => sec.id)
                  .filter(
                    (id): id is TipoMedidaMotora =>
                      id === 'craniometria' || id === 'goniometria'
                  )}
                disabled={disabled}
              />
            )}

            <Field label="Observações da Conduta">
              <Textarea
                value={conduta.observacoes || ''}
                onChange={(e) => updateConduta({ observacoes: e.target.value })}
                placeholder="Observações adicionais..."
                disabled={disabled}
                rows={3}
              />
            </Field>
          </div>
        );
      }
    }
  }

  // Fallback
  return (
    <div className="text-center text-muted-foreground py-8">
      Seção não encontrada: {secaoId}
    </div>
  );
};

EvolutionSectionContent.displayName = 'EvolutionSectionContent';
