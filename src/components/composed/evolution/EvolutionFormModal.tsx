import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  Save,
  CheckCircle2,
  Circle,
  CircleDot,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Cloud,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/primitives/alert-dialog';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Progress } from '@/components/primitives/progress';
import { ScrollArea } from '@/components/primitives/scroll-area';
import { useToast } from '@/components/primitives/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/primitives/tooltip';
import { cn } from '@/lib/utils';
import {
  type TipoEvolucao,
  type EvolucaoRespiratoria,
  type EvolucaoMotoraAssimetria,
  type AreaMotora,
  EVOLUCAO_RESPIRATORIA_SECOES,
  AREAS_MOTORAS,
  secoesMotorasVisiveis,
  secaoMotoraEssencial,
  inferirAreasMotoras,
  criarEvolucaoRespiratoriaVazia,
  criarEvolucaoRespiratoriaDeAnterior,
  criarEvolucaoMotoraAssimetriaVazia,
  verificarSecaoEvolucaoCompleta,
  getTipoEvolucaoPorServico,
  SECOES_REAPROVEITAVEIS_RESPIRATORIA,
  ehFormatoMotoraV13,
  normalizarAreas,
  rascunhoMotorParaV14,
  pendenciasEvolucaoRespiratoria,
  pendenciasEvolucaoMotora,
  type PendenciaEvolucao,
} from '@/types/evolucao-clinica';
import {
  apagarRascunhoEvolucao,
  buscarRascunhoEvolucao,
  quandoRascunho,
  salvarRascunhoEvolucao,
} from '@/lib/evolucao-rascunho-api';
import { EvolutionSectionContent } from './EvolutionSectionContent';
import { MedidasEvolucaoContext } from './medidas-evolucao-context';
import { PlanoMotorContext, type PlanoMotorValor } from './plano-motor-context';
import { prepararSessaoV13 } from '@/lib/motora-plano';
import {
  pendenciasDasMedicoes,
  type MedidaPaciente,
} from '@/lib/motora-medidas';

// AI dev note: EvolutionFormModal - Modal de formulário de evolução estruturada
// Suporta evolução respiratória e motora/assimetria

export interface EvolutionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dados: {
    tipo_evolucao: TipoEvolucao;
    evolucao_respiratoria?: EvolucaoRespiratoria;
    evolucao_motora_assimetria?: EvolucaoMotoraAssimetria;
  }) => Promise<void>;
  tipoServico?: string;
  patientName?: string;
  appointmentId?: string; // ID do agendamento para autosave
  existingData?: {
    tipo_evolucao?: TipoEvolucao;
    evolucao_respiratoria?: EvolucaoRespiratoria;
    evolucao_motora_assimetria?: EvolucaoMotoraAssimetria;
  };
  // AI dev note: última evolução do paciente p/ carry-forward (reaproveita
  // contexto clínico, conduta e orientações ao iniciar uma nova evolução)
  previousData?: {
    evolucao_respiratoria?: EvolucaoRespiratoria;
  };
  previousDate?: string;
  // Evolução motora: áreas da última evolução da criança, já marcadas ao
  // abrir uma evolução nova (a fisio só desmarca ou acrescenta)
  areasSugeridas?: AreaMotora[];
  // Medidas programadas da criança (situação e último registro) e o dia da
  // sessão 'YYYY-MM-DD'. null = não carregado ou sem permissão.
  medidas?: MedidaPaciente[] | null;
  dataSessao?: string;
  // Plano terapêutico e histórico motor da criança (formato 1.3).
  // null = sem permissão ou não carregado: a evolução funciona sem eles.
  planoMotor?: PlanoMotorValor | null;
  mode?: 'create' | 'edit' | 'view';
}

/**
 * Registro anterior às áreas, aberto para editar: passa a ter as áreas que
 * foram preenchidas nele (ou as três, se nada indicar), para o formulário
 * não esconder o que já estava registrado.
 */
const comAreasParaEdicao = (
  ev: EvolucaoMotoraAssimetria
): EvolucaoMotoraAssimetria => {
  if (Array.isArray(ev.areas)) return ev;
  const inferidas = inferirAreasMotoras(ev);
  return {
    ...ev,
    areas: inferidas.length ? inferidas : AREAS_MOTORAS.map((a) => a.id),
  };
};

const motoraInicial = (ev?: EvolucaoMotoraAssimetria) =>
  ev ? comAreasParaEdicao(ev) : criarEvolucaoMotoraAssimetriaVazia();

// Chave para localStorage
const AUTOSAVE_PREFIX = 'evolucao_draft_';

interface AutosaveData {
  tipo_evolucao: TipoEvolucao;
  evolucao_respiratoria?: EvolucaoRespiratoria;
  evolucao_motora_assimetria?: EvolucaoMotoraAssimetria;
  savedAt: string;
  // AI dev note: a pendência de revisão viaja no rascunho — sem isso, fechar e
  // reabrir o modal faria os dados reaproveitados passarem sem conferência
  secoes_pendentes_revisao?: string[];
  reaproveitado_de?: string | null;
}

export const EvolutionFormModal: React.FC<EvolutionFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  tipoServico,
  patientName,
  appointmentId,
  existingData,
  previousData,
  previousDate,
  areasSugeridas,
  medidas = null,
  dataSessao = '',
  planoMotor = null,
  mode = 'create',
}) => {
  // Chave única para autosave baseada no agendamento
  const autosaveKey = useMemo(
    () => (appointmentId ? `${AUTOSAVE_PREFIX}${appointmentId}` : null),
    [appointmentId]
  );

  // Estado do autosave
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // AI dev note: rascunho encontrado ao abrir — decidido via AlertDialog
  // (antes era window.confirm); Escape mantém o rascunho para depois
  const [pendingDraft, setPendingDraft] = useState<AutosaveData | null>(null);
  // Confirmação de saída com alterações não salvas (antes window.confirm)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  // Rascunho no servidor ("Salvar e continuar depois"): abre em qualquer
  // aparelho. Só "Finalizar" grava a evolução (e finaliza a consulta).
  const [rascunhoServidor, setRascunhoServidor] = useState<{
    em: string;
    por: string | null;
  } | null>(null);
  const [salvandoRascunho, setSalvandoRascunho] = useState(false);
  // Itens sem resposta: impedem finalizar (na edição, só avisam)
  const [pendenciasCampos, setPendenciasCampos] = useState<
    PendenciaEvolucao[] | null
  >(null);
  // Determinar tipo de evolução baseado no serviço
  const determinarTipoEvolucao = useCallback((): TipoEvolucao => {
    if (existingData?.tipo_evolucao) return existingData.tipo_evolucao;
    // Serviço motor abre direto na evolução motora; sem pista, respiratória
    return (
      (tipoServico && getTipoEvolucaoPorServico(tipoServico)) || 'respiratoria'
    );
  }, [tipoServico, existingData]);

  const [tipoEvolucao, setTipoEvolucao] = useState<TipoEvolucao>(
    determinarTipoEvolucao
  );
  const [evolucaoRespiratoria, setEvolucaoRespiratoria] =
    useState<EvolucaoRespiratoria>(
      existingData?.evolucao_respiratoria || criarEvolucaoRespiratoriaVazia()
    );
  const [evolucaoMotora, setEvolucaoMotora] =
    useState<EvolucaoMotoraAssimetria>(() =>
      motoraInicial(existingData?.evolucao_motora_assimetria)
    );
  // A fisio já mexeu nas áreas: a sugestão que chega depois não sobrescreve
  const areasTocadasRef = useRef(false);
  const [avisoAreas, setAvisoAreas] = useState(false);
  const [avisoTorcicolo, setAvisoTorcicolo] = useState(false);
  const [pendenciasMedidas, setPendenciasMedidas] = useState<string[]>([]);

  const [currentSection, setCurrentSection] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const isReadOnly = mode === 'view';

  // AI dev note: carry-forward — repete a última evolução do paciente como
  // ponto de partida. As seções copiadas ficam pendentes de revisão até serem
  // editadas ou confirmadas; salvar com pendência é bloqueado (ver handleSave).
  const [carryApplied, setCarryApplied] = useState(false);
  const [secoesPendentesRevisao, setSecoesPendentesRevisao] = useState<
    string[]
  >([]);
  const [reaproveitadoDe, setReaproveitadoDe] = useState<string | null>(null);
  const [showRevisaoPendente, setShowRevisaoPendente] = useState(false);

  const podeReaproveitar =
    mode === 'create' &&
    tipoEvolucao === 'respiratoria' &&
    !!previousData?.evolucao_respiratoria &&
    !carryApplied;

  const aplicarReaproveitamento = useCallback(() => {
    if (!previousData?.evolucao_respiratoria) return;
    setEvolucaoRespiratoria(
      criarEvolucaoRespiratoriaDeAnterior(previousData.evolucao_respiratoria)
    );
    setCarryApplied(true);
    setSecoesPendentesRevisao([...SECOES_REAPROVEITAVEIS_RESPIRATORIA]);
    setReaproveitadoDe(previousDate ?? null);
    setCurrentSection(0);
  }, [previousData, previousDate]);

  const marcarSecaoRevisada = useCallback((secaoId: string) => {
    setSecoesPendentesRevisao((prev) => prev.filter((s) => s !== secaoId));
  }, []);

  const dataReaproveitadaLabel = useMemo(
    () =>
      reaproveitadoDe
        ? new Date(reaproveitadoDe).toLocaleDateString('pt-BR')
        : null,
    [reaproveitadoDe]
  );

  // Scroll to top when section changes
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        '[data-radix-scroll-area-viewport]'
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
      }
    }
  }, [currentSection]);

  // Seções baseadas no tipo. Na motora, só as das áreas marcadas + as comuns.
  const secoes =
    tipoEvolucao === 'respiratoria'
      ? EVOLUCAO_RESPIRATORIA_SECOES
      : secoesMotorasVisiveis(
          evolucaoMotora.areas,
          ehFormatoMotoraV13(evolucaoMotora),
          evolucaoMotora
        );
  const ehMotora = tipoEvolucao === 'motora_assimetria';
  const areasMarcadas = evolucaoMotora.areas ?? [];

  // Desmarcar uma área pode encurtar a lista: não deixar o índice sobrar
  useEffect(() => {
    if (currentSection > secoes.length - 1)
      setCurrentSection(Math.max(0, secoes.length - 1));
  }, [secoes.length, currentSection]);

  const currentSectionData =
    secoes[Math.min(currentSection, secoes.length - 1)];

  const alternarArea = useCallback(
    (area: AreaMotora) => {
      if (isReadOnly) return;
      areasTocadasRef.current = true;
      setAvisoAreas(false);
      setEvolucaoMotora((prev) => {
        const atuais = prev.areas ?? [];
        // Assimetria craniana vem sempre com torcicolo: com ela marcada,
        // torcicolo não sai
        if (
          area === 'torcicolo' &&
          atuais.includes('torcicolo') &&
          atuais.includes('assimetria_craniana')
        ) {
          setAvisoTorcicolo(true);
          return prev;
        }
        setAvisoTorcicolo(false);
        const novas = atuais.includes(area)
          ? atuais.filter((a) => a !== area)
          : normalizarAreas([...atuais, area]);
        // Objetivos de uma área desmarcada saem da sessão
        const objetivos_sessao = (prev.objetivos_sessao || []).filter(
          (o) => !o.area || novas.includes(o.area)
        );
        return { ...prev, areas: novas, objetivos_sessao };
      });
    },
    [isReadOnly]
  );

  // Função para carregar rascunho do localStorage
  const loadDraft = useCallback((): AutosaveData | null => {
    if (!autosaveKey) return null;
    try {
      const saved = localStorage.getItem(autosaveKey);
      if (saved) {
        return JSON.parse(saved) as AutosaveData;
      }
    } catch (e) {
      console.warn('Erro ao carregar rascunho:', e);
    }
    return null;
  }, [autosaveKey]);

  // O que vai no rascunho (local e no servidor)
  const montarRascunho = useCallback(
    (): AutosaveData => ({
      tipo_evolucao: tipoEvolucao,
      evolucao_respiratoria:
        tipoEvolucao === 'respiratoria' ? evolucaoRespiratoria : undefined,
      evolucao_motora_assimetria:
        tipoEvolucao === 'motora_assimetria' ? evolucaoMotora : undefined,
      savedAt: new Date().toISOString(),
      secoes_pendentes_revisao: secoesPendentesRevisao,
      reaproveitado_de: reaproveitadoDe,
    }),
    [
      tipoEvolucao,
      evolucaoRespiratoria,
      evolucaoMotora,
      secoesPendentesRevisao,
      reaproveitadoDe,
    ]
  );

  // Função para salvar rascunho no localStorage
  const saveDraft = useCallback(() => {
    if (!autosaveKey || isReadOnly) return;

    try {
      localStorage.setItem(autosaveKey, JSON.stringify(montarRascunho()));
      setLastSaved(new Date());
    } catch (e) {
      console.warn('Erro ao salvar rascunho:', e);
    }
  }, [autosaveKey, isReadOnly, montarRascunho]);

  // Função para limpar rascunho
  const clearDraft = useCallback(() => {
    if (!autosaveKey) return;
    try {
      localStorage.removeItem(autosaveKey);
      setLastSaved(null);
    } catch (e) {
      console.warn('Erro ao limpar rascunho:', e);
    }
  }, [autosaveKey]);

  // Autosave com debounce quando dados mudam
  // AI dev note: pendingDraft pausa o autosave — sem isso o formulário vazio
  // sobrescreveria o rascunho salvo enquanto o dialog de recuperação está aberto
  useEffect(() => {
    if (!isOpen || isReadOnly || pendingDraft) return;

    // Limpar timer anterior
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    // Salvar após 2 segundos de inatividade
    autosaveTimerRef.current = setTimeout(() => {
      saveDraft();
    }, 2000);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    isOpen,
    isReadOnly,
    pendingDraft,
    mode,
    tipoEvolucao,
    evolucaoRespiratoria,
    evolucaoMotora,
    saveDraft,
  ]);

  // Reset quando modal abre - verificar se há rascunho salvo
  useEffect(() => {
    if (isOpen) {
      const tipoInicial = determinarTipoEvolucao();
      setLastSaved(null);

      // AI dev note: Se estamos criando e há rascunho, abrir AlertDialog para
      // o profissional decidir (recuperar/descartar). O formulário inicializa
      // vazio; se recuperar, o rascunho é aplicado por cima.
      if (mode === 'create' && autosaveKey) {
        const draft = loadDraft();
        if (draft) {
          setPendingDraft(draft);
        }
      }

      // Inicializar normalmente
      setTipoEvolucao(tipoInicial);
      setEvolucaoRespiratoria(
        existingData?.evolucao_respiratoria || criarEvolucaoRespiratoriaVazia()
      );
      setEvolucaoMotora(
        motoraInicial(existingData?.evolucao_motora_assimetria)
      );
      areasTocadasRef.current = false;
      setAvisoAreas(false);
      setPendenciasMedidas([]);
      setCurrentSection(0);
      // AI dev note: sem este reset o carry-forward de um atendimento vazaria
      // para o próximo (o modal não desmonta entre aberturas)
      setCarryApplied(false);
      setSecoesPendentesRevisao([]);
      setReaproveitadoDe(null);
      setRascunhoServidor(null);
      setPendenciasCampos(null);
    } else {
      setPendingDraft(null);
      setShowCloseConfirm(false);
      setShowRevisaoPendente(false);
      setPendenciasCampos(null);
    }
  }, [
    isOpen,
    existingData,
    determinarTipoEvolucao,
    mode,
    autosaveKey,
    loadDraft,
  ]);

  // Áreas da última evolução: marcam se a fisio ainda não escolheu nada.
  // Precisa ficar DEPOIS do efeito que reinicia o formulário ao abrir; antes
  // dele, a marcação era apagada quando a sugestão já estava pronta.
  useEffect(() => {
    if (!isOpen || mode !== 'create' || areasTocadasRef.current) return;
    if (!areasSugeridas?.length) return;
    setEvolucaoMotora((prev) =>
      prev.areas && prev.areas.length > 0
        ? prev
        : { ...prev, areas: normalizarAreas([...areasSugeridas]) }
    );
  }, [isOpen, mode, areasSugeridas]);

  // Aplica um rascunho (do aparelho ou do servidor) por cima do formulário
  const aplicarRascunho = useCallback((d: AutosaveData) => {
    setTipoEvolucao(d.tipo_evolucao);
    if (d.evolucao_respiratoria) {
      setEvolucaoRespiratoria(d.evolucao_respiratoria);
    }
    if (d.evolucao_motora_assimetria) {
      // Rascunho do formato anterior abre na tela nova
      setEvolucaoMotora(
        comAreasParaEdicao(rascunhoMotorParaV14(d.evolucao_motora_assimetria))
      );
      // rascunho já traz a escolha de áreas: não sobrescrever com sugestão
      areasTocadasRef.current = true;
    }
    setLastSaved(new Date(d.savedAt));
    setCurrentSection(0);
    if (d.secoes_pendentes_revisao?.length) {
      setSecoesPendentesRevisao(d.secoes_pendentes_revisao);
      setReaproveitadoDe(d.reaproveitado_de ?? null);
      setCarryApplied(true);
    }
  }, []);

  // Aplicar o rascunho pendente (ação "Recuperar" do AlertDialog)
  const applyPendingDraft = useCallback(() => {
    if (!pendingDraft) return;
    aplicarRascunho(pendingDraft);
    setPendingDraft(null);
  }, [pendingDraft, aplicarRascunho]);

  // Rascunho salvo no servidor: abre direto, a não ser que o deste aparelho
  // seja mais novo (aí fica a pergunta de recuperar o local).
  useEffect(() => {
    if (!isOpen || mode !== 'create' || !appointmentId) return;
    let cancelado = false;
    buscarRascunhoEvolucao(appointmentId)
      .then((r) => {
        if (cancelado || !r) return;
        const local = loadDraft();
        if (
          local &&
          new Date(local.savedAt).getTime() >
            new Date(r.atualizado_em).getTime()
        )
          return;
        aplicarRascunho(r.dados);
        setPendingDraft(null);
        setRascunhoServidor({
          em: r.atualizado_em,
          por: r.atualizado_por_nome,
        });
      })
      .catch((e) => console.warn('Erro ao buscar rascunho:', e));
    return () => {
      cancelado = true;
    };
  }, [isOpen, mode, appointmentId, loadDraft, aplicarRascunho]);

  // Rótulo "há X minutos/horas" do rascunho pendente
  const pendingDraftTimeLabel = useMemo(() => {
    if (!pendingDraft) return '';
    const timeAgo = Math.round(
      (Date.now() - new Date(pendingDraft.savedAt).getTime()) / 1000 / 60
    );
    return timeAgo < 60
      ? `${timeAgo} minuto${timeAgo !== 1 ? 's' : ''}`
      : `${Math.round(timeAgo / 60)} hora${Math.round(timeAgo / 60) !== 1 ? 's' : ''}`;
  }, [pendingDraft]);

  // Handler para atualização de campos respiratórios
  const handleRespiratoriaChange = useCallback(
    (updates: Partial<EvolucaoRespiratoria>) => {
      if (isReadOnly) return;
      setEvolucaoRespiratoria((prev) => ({ ...prev, ...updates }));
      // As chaves de EvolucaoRespiratoria são os próprios ids das seções:
      // mexeu na seção, considera revisada
      const secoesTocadas = Object.keys(updates);
      setSecoesPendentesRevisao((prev) =>
        prev.some((s) => secoesTocadas.includes(s))
          ? prev.filter((s) => !secoesTocadas.includes(s))
          : prev
      );
    },
    [isReadOnly]
  );

  // Handler para atualização de campos motores
  const handleMotoraChange = useCallback(
    (updates: Partial<EvolucaoMotoraAssimetria>) => {
      if (isReadOnly) return;
      setEvolucaoMotora((prev) => ({ ...prev, ...updates }));
      setPendenciasMedidas([]);
    },
    [isReadOnly]
  );

  // Objetivo escolhido do catálogo nesta sessão entra no plano ao finalizar.
  // O id já existe (gerado ao escolher): repetir o salvar não duplica.
  const gravarObjetivosNovos = async (
    ev: EvolucaoMotoraAssimetria
  ): Promise<EvolucaoMotoraAssimetria> => {
    const novos = (ev.objetivos_sessao || []).filter((o) => o.novo_no_plano);
    if (!novos.length || !planoMotor) return ev;
    for (const o of novos)
      await planoMotor.salvarObjetivo({
        id: o.objetivo_id,
        paciente_id: planoMotor.pacienteId,
        descricao: o.novo_no_plano!.descricao,
        areas: o.novo_no_plano!.areas,
        indicador: o.novo_no_plano!.indicador,
        origem: 'evolucao',
        origem_id: planoMotor.agendamentoId ?? appointmentId ?? null,
      });
    const gravado = {
      ...ev,
      objetivos_sessao: (ev.objetivos_sessao || []).map((o) => {
        if (!o.novo_no_plano) return o;
        const sem = { ...o };
        delete sem.novo_no_plano;
        return sem;
      }),
    };
    setEvolucaoMotora(gravado);
    return gravado;
  };

  // "Salvar e continuar depois": guarda no servidor e fecha, sem finalizar
  const salvarRascunho = async () => {
    if (!appointmentId || isReadOnly) return;
    setSalvandoRascunho(true);
    try {
      saveDraft();
      await salvarRascunhoEvolucao(appointmentId, montarRascunho());
      toast({
        title: 'Rascunho salvo',
        description:
          'Dá para continuar depois, em qualquer aparelho. A evolução só conta quando for finalizada.',
      });
      setPendenciasCampos(null);
      setShowCloseConfirm(false);
      onClose();
    } catch (error) {
      console.error('Erro ao salvar rascunho:', error);
      const detalhe =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message: unknown }).message)
          : '';
      toast({
        title: 'O rascunho não foi salvo',
        description: `${detalhe ? `${detalhe}. ` : ''}O que você preencheu continua aqui e guardado neste aparelho. Tente de novo.`,
        variant: 'destructive',
      });
    } finally {
      setSalvandoRascunho(false);
    }
  };

  // Finalizar (ou salvar a edição). `mesmoAssim` só vale na edição.
  const handleSave = async (mesmoAssim = false) => {
    // Bloqueia salvar enquanto houver seção reaproveitada sem conferência
    if (secoesPendentesRevisao.length > 0) {
      setShowRevisaoPendente(true);
      return;
    }
    // Evolução motora precisa de pelo menos uma área trabalhada
    if (tipoEvolucao === 'motora_assimetria' && areasMarcadas.length === 0) {
      setAvisoAreas(true);
      return;
    }
    // Medidas: "Medi hoje" sem o resultado não salva (seria medida feita sem registro)
    if (tipoEvolucao === 'motora_assimetria' && medidas !== null) {
      const pend = pendenciasDasMedicoes(evolucaoMotora);
      if (pend.length > 0) {
        setPendenciasMedidas(pend.map((p) => p.problema));
        scrollAreaRef.current
          ?.querySelector('[data-radix-scroll-area-viewport]')
          ?.scrollTo({ top: 0 });
        return;
      }
    }
    // Item sem resposta: não finaliza (cada um tem a opção de "não fiz")
    const pend =
      tipoEvolucao === 'respiratoria'
        ? pendenciasEvolucaoRespiratoria(evolucaoRespiratoria)
        : pendenciasEvolucaoMotora(evolucaoMotora);
    if (pend.length > 0 && !(mode === 'edit' && mesmoAssim)) {
      setPendenciasCampos(pend);
      return;
    }
    setPendenciasCampos(null);
    setIsSaving(true);
    try {
      let motora = evolucaoMotora;
      if (tipoEvolucao === 'motora_assimetria')
        motora = await gravarObjetivosNovos(evolucaoMotora);
      await onSave({
        tipo_evolucao: tipoEvolucao,
        evolucao_respiratoria:
          tipoEvolucao === 'respiratoria' ? evolucaoRespiratoria : undefined,
        evolucao_motora_assimetria:
          tipoEvolucao === 'motora_assimetria'
            ? ehFormatoMotoraV13(motora)
              ? prepararSessaoV13(motora, {
                  objetivos: planoMotor?.objetivos ?? null,
                  historico: planoMotor?.historico ?? null,
                  dataSessao: planoMotor?.dataSessao || dataSessao,
                  agendamentoId: planoMotor?.agendamentoId ?? appointmentId,
                })
              : motora
            : undefined,
      });
      // Limpar rascunho após salvar com sucesso
      clearDraft();
      if (mode === 'create' && appointmentId)
        apagarRascunhoEvolucao(appointmentId).catch((e) =>
          console.warn('Erro ao apagar rascunho:', e)
        );
      onClose();
    } catch (error) {
      // Antes a falha só ia para o console e o botão parecia não funcionar.
      // O rascunho continua guardado: dá para tentar de novo sem perder nada.
      console.error('Erro ao salvar evolução:', error);
      const detalhe =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String((error as { message: unknown }).message)
            : '';
      toast({
        title: 'A evolução não foi salva',
        description: `${detalhe ? `${detalhe}. ` : ''}O que você preencheu continua aqui. Confira a internet e toque em Salvar de novo.`,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Navegação
  const goToNext = () => {
    if (currentSection < secoes.length - 1) {
      setCurrentSection((prev) => prev + 1);
    }
  };

  const goToPrev = () => {
    if (currentSection > 0) {
      setCurrentSection((prev) => prev - 1);
    }
  };

  // Progresso: só as seções essenciais contam. Seções complementares
  // (medidas, orientações) não baixam o progresso quando ficam em branco e
  // aparecem com outro ícone quando preenchidas.
  const dadosAtuais =
    tipoEvolucao === 'respiratoria' ? evolucaoRespiratoria : evolucaoMotora;
  // A bolinha segue a mesma lista do "falta responder": seção com item sem
  // resposta não fica verde
  const pendenciasAtuais = useMemo(
    () =>
      tipoEvolucao === 'respiratoria'
        ? pendenciasEvolucaoRespiratoria(evolucaoRespiratoria)
        : pendenciasEvolucaoMotora(evolucaoMotora),
    [tipoEvolucao, evolucaoRespiratoria, evolucaoMotora]
  );
  const statusDaSecao = (secaoId: string) => {
    const st = verificarSecaoEvolucaoCompleta(
      tipoEvolucao,
      secaoId,
      dadosAtuais
    );
    return st === 'completo' &&
      pendenciasAtuais.some((p) => p.secaoId === secaoId)
      ? 'parcial'
      : st;
  };
  // Na motora, ser essencial depende das áreas (controle motor só conta
  // quando desenvolvimento motor foi trabalhado)
  const ehComplementar = (s: (typeof secoes)[number]) =>
    ehMotora
      ? !secaoMotoraEssencial(s, evolucaoMotora.areas, evolucaoMotora)
      : !!s.opcional;
  const temComplementares = ehMotora || secoes.some((s) => s.opcional);
  const essenciais = secoes.filter((s) => !ehComplementar(s));
  const essenciaisFeitas = essenciais.filter(
    (s) => statusDaSecao(s.id) === 'completo'
  ).length;
  const complementaresPreenchidas = secoes.filter(
    (s) => ehComplementar(s) && statusDaSecao(s.id) !== 'vazio'
  ).length;
  const progresso =
    essenciais.length === 0
      ? 0
      : Math.round((essenciaisFeitas / essenciais.length) * 100);
  const progressoCurto = temComplementares
    ? `${essenciaisFeitas}/${essenciais.length}`
    : `${progresso}%`;
  const progressoLongo = temComplementares
    ? `${essenciaisFeitas} de ${essenciais.length} essenciais`
    : `${progresso}% completo`;

  // AI dev note: Status textual da seção para aria-label das bolinhas
  const secaoComplementar = (secaoId: string) => {
    const s = secoes.find((x) => x.id === secaoId);
    return s ? ehComplementar(s) : false;
  };

  const getStatusLabel = (secaoId: string): string => {
    const status = statusDaSecao(secaoId);
    const opcional = secaoComplementar(secaoId);
    if (opcional)
      return status === 'vazio'
        ? 'complementar, em branco'
        : 'complementar, preenchida';
    if (status === 'completo') return 'completa';
    if (status === 'parcial') return 'parcial';
    return 'vazia';
  };

  // Obter ícone de status da seção
  const getStatusIcon = (secaoId: string, className?: string) => {
    const status = statusDaSecao(secaoId);
    const opcional = secaoComplementar(secaoId);

    const baseClass = className || 'h-4 w-4';

    // Complementar preenchida: ícone próprio, para não parecer essencial
    if (opcional && status !== 'vazio') {
      return <CircleDot className={cn(baseClass, 'text-sky-500')} />;
    }

    switch (status) {
      case 'completo':
        return <CheckCircle2 className={cn(baseClass, 'text-green-500')} />;
      case 'parcial':
        return <AlertCircle className={cn(baseClass, 'text-yellow-500')} />;
      default:
        return <Circle className={cn(baseClass, 'text-muted-foreground')} />;
    }
  };

  const getTipoLabel = () => {
    return tipoEvolucao === 'respiratoria'
      ? '🫁 Evolução Respiratória'
      : '🦴 Evolução Motora/Assimetria';
  };

  // Handler para fechar com confirmação se houver alterações (AlertDialog)
  const handleClose = useCallback(() => {
    if (lastSaved && !isReadOnly) {
      setShowCloseConfirm(true);
      return;
    }
    onClose();
  }, [lastSaved, isReadOnly, onClose]);

  const contextoMedidas = useMemo(
    () => ({ medidas, dataSessao }),
    [medidas, dataSessao]
  );

  return (
    <PlanoMotorContext.Provider value={planoMotor}>
      <MedidasEvolucaoContext.Provider value={contextoMedidas}>
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <DialogContent className="max-w-[95vw] sm:max-w-[900px] h-[95vh] sm:h-[90vh] flex flex-col p-0">
            {/* pr-12 no celular: espaço para o X de fechar do próprio dialog */}
            <DialogHeader className="pl-4 pr-12 py-3 sm:px-6 sm:py-4 border-b flex-shrink-0 space-y-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <DialogTitle className="text-base sm:text-lg font-semibold truncate">
                      {getTipoLabel()}
                    </DialogTitle>
                    <Badge
                      variant="secondary"
                      className="sm:hidden text-xs shrink-0"
                      aria-label={progressoLongo}
                    >
                      {progressoCurto}
                    </Badge>
                  </div>
                  {patientName && (
                    <span className="text-xs sm:text-sm text-muted-foreground truncate max-w-[200px] sm:max-w-none">
                      Paciente: {patientName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 sm:pb-0">
                  {/* Seletor de tipo - Compacto em mobile */}
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant={
                        tipoEvolucao === 'respiratoria' ? 'default' : 'outline'
                      }
                      size="sm"
                      onClick={() =>
                        !isReadOnly && setTipoEvolucao('respiratoria')
                      }
                      disabled={isReadOnly}
                      className="h-7 text-xs sm:h-9 sm:text-sm px-2 sm:px-4"
                    >
                      <span className="sm:hidden">Resp.</span>
                      <span className="hidden sm:inline">🫁 Respiratória</span>
                    </Button>
                    <Button
                      variant={
                        tipoEvolucao === 'motora_assimetria'
                          ? 'default'
                          : 'outline'
                      }
                      size="sm"
                      onClick={() =>
                        !isReadOnly && setTipoEvolucao('motora_assimetria')
                      }
                      disabled={isReadOnly}
                      className="h-7 text-xs sm:h-9 sm:text-sm px-2 sm:px-4"
                    >
                      <span className="sm:hidden">Motora</span>
                      <span className="hidden sm:inline">🦴 Motora</span>
                    </Button>
                  </div>
                  <Badge variant="secondary" className="hidden sm:inline-flex">
                    {progressoLongo}
                  </Badge>
                  {temComplementares && complementaresPreenchidas > 0 && (
                    <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap">
                      + {complementaresPreenchidas} complementar
                      {complementaresPreenchidas > 1 ? 'es' : ''}
                    </span>
                  )}
                  {/* Indicador de autosave */}
                  {lastSaved && !isReadOnly && (
                    <Badge
                      variant="outline"
                      className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground"
                    >
                      <Cloud className="h-3 w-3 text-green-500" />
                      Rascunho salvo
                    </Badge>
                  )}
                </div>
              </div>
              <Progress
                value={progresso}
                className="h-1 mt-2 hidden sm:block"
              />
            </DialogHeader>

            {/* Conteúdo principal - sem sidebar */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header da seção com indicadores de progresso */}
              <div className="px-4 py-2 sm:px-6 sm:py-3 border-b bg-muted/20 flex-shrink-0">
                {/* Evolução motora: áreas trabalhadas hoje (uma ou mais) */}
                {ehMotora && (
                  <div className="mb-3 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Áreas trabalhadas hoje
                    </p>
                    <div
                      className="flex flex-wrap gap-2"
                      role="group"
                      aria-label="Áreas trabalhadas hoje"
                    >
                      {AREAS_MOTORAS.map((area) => {
                        const marcada = areasMarcadas.includes(area.id);
                        return (
                          <button
                            key={area.id}
                            type="button"
                            aria-pressed={marcada}
                            disabled={isReadOnly}
                            onClick={() => alternarArea(area.id)}
                            title={area.descricao}
                            className={cn(
                              'min-h-9 px-3 rounded-full border-2 text-sm font-medium transition-colors inline-flex items-center gap-1.5',
                              marcada
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'bg-background border-border text-muted-foreground hover:bg-muted',
                              isReadOnly && 'opacity-60 cursor-not-allowed'
                            )}
                          >
                            {marcada && (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            <span className="sm:hidden">{area.curto}</span>
                            <span className="hidden sm:inline">
                              {area.titulo}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {(avisoTorcicolo ||
                      areasMarcadas.includes('assimetria_craniana')) && (
                      <p
                        className={cn(
                          'text-xs',
                          avisoTorcicolo
                            ? 'text-amber-700 font-medium'
                            : 'text-muted-foreground'
                        )}
                      >
                        Assimetria craniana vem sempre com torcicolo.
                      </p>
                    )}
                    {areasMarcadas.length === 0 && (
                      <p
                        className={cn(
                          'text-xs',
                          avisoAreas
                            ? 'text-destructive font-medium'
                            : 'text-muted-foreground'
                        )}
                        role={avisoAreas ? 'alert' : undefined}
                      >
                        {avisoAreas
                          ? 'Marque pelo menos uma área antes de salvar.'
                          : 'Marque as áreas trabalhadas: só as seções delas aparecem.'}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-xl sm:text-2xl shrink-0">
                      {currentSectionData?.icone}
                    </span>
                    <h3 className="text-base sm:text-lg font-medium truncate">
                      {currentSectionData?.titulo}
                    </h3>
                    {ehMotora && currentSectionData?.areas && (
                      <Badge
                        variant="outline"
                        className="hidden sm:inline-flex shrink-0 text-xs font-normal"
                      >
                        {currentSectionData.areas
                          .filter((a) => areasMarcadas.includes(a))
                          .map(
                            (a) => AREAS_MOTORAS.find((x) => x.id === a)?.titulo
                          )
                          .join(' · ')}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap ml-2">
                    {currentSection + 1} / {secoes.length}
                  </span>
                </div>
                {/* Indicadores de seção (bolinhas) */}
                <div className="flex items-center justify-start sm:justify-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                  {secoes.map((secao, index) => (
                    <TooltipProvider key={secao.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setCurrentSection(index)}
                            aria-label={`Seção ${index + 1}: ${secao.titulo} — ${getStatusLabel(secao.id)}${
                              secoesPendentesRevisao.includes(secao.id)
                                ? ', copiada da evolução anterior, aguardando conferência'
                                : ''
                            }`}
                            aria-current={
                              currentSection === index ? 'step' : undefined
                            }
                            className={cn(
                              'flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full transition-all shrink-0',
                              currentSection === index
                                ? 'bg-primary text-primary-foreground scale-110'
                                : 'bg-muted hover:bg-muted',
                              // Complementar: borda tracejada ("quando indicado")
                              secaoComplementar(secao.id) &&
                                currentSection !== index &&
                                'border border-dashed border-muted-foreground/40 bg-transparent',
                              secoesPendentesRevisao.includes(secao.id) &&
                                'ring-2 ring-amber-400 ring-offset-1'
                            )}
                          >
                            {getStatusIcon(secao.id, 'h-3 w-3 sm:h-4 sm:w-4')}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {secao.icone} {secao.titulo}
                          {secaoComplementar(secao.id)
                            ? ' (quando indicado)'
                            : ''}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </div>

              {/* Conteúdo da seção */}
              <ScrollArea className="flex-1" ref={scrollAreaRef}>
                <div className="p-4 sm:p-6">
                  {pendenciasMedidas.length > 0 && (
                    <div
                      className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1"
                      role="alert"
                    >
                      <p className="text-sm font-medium text-destructive">
                        Antes de salvar, complete as medidas:
                      </p>
                      <ul className="list-disc pl-5 text-sm text-destructive">
                        {pendenciasMedidas.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {rascunhoServidor && (
                    <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                      Continuando o rascunho salvo
                      {rascunhoServidor.por
                        ? ` por ${rascunhoServidor.por}`
                        : ''}{' '}
                      em {quandoRascunho(rascunhoServidor.em)}. A evolução só
                      conta quando for finalizada.
                    </div>
                  )}
                  {podeReaproveitar && (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-blue-800">
                          Repetir última evolução
                        </p>
                        <p className="text-xs text-blue-700">
                          {previousDate
                            ? `Última em ${new Date(previousDate).toLocaleDateString('pt-BR')}. `
                            : ''}
                          Traz quadro, exame, técnicas, orientações e conduta
                          como ponto de partida. Sinais vitais e resposta ao
                          tratamento seguem em branco — e você confere seção por
                          seção.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={aplicarReaproveitamento}
                        className="flex-shrink-0"
                      >
                        Repetir
                      </Button>
                    </div>
                  )}

                  {/* Seção veio da última evolução e ainda não foi conferida */}
                  {currentSectionData &&
                    secoesPendentesRevisao.includes(currentSectionData.id) && (
                      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-amber-900">
                            Copiado da evolução anterior
                            {dataReaproveitadaLabel
                              ? ` de ${dataReaproveitadaLabel}`
                              : ''}
                          </p>
                          <p className="text-xs text-amber-800">
                            Confira se ainda descreve a criança hoje. Qualquer
                            ajuste já marca esta seção como conferida.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            marcarSecaoRevisada(currentSectionData.id)
                          }
                          className="flex-shrink-0 border-amber-400 text-amber-900 hover:bg-amber-100"
                        >
                          Conferi
                        </Button>
                      </div>
                    )}
                  <EvolutionSectionContent
                    tipoEvolucao={tipoEvolucao}
                    secaoId={currentSectionData?.id || ''}
                    evolucaoRespiratoria={evolucaoRespiratoria}
                    evolucaoMotora={evolucaoMotora}
                    onRespiratoriaChange={handleRespiratoriaChange}
                    onMotoraChange={handleMotoraChange}
                    disabled={isReadOnly}
                  />
                </div>
              </ScrollArea>

              {/* Footer com navegação */}
              <div className="px-4 py-3 sm:px-6 sm:py-4 border-t bg-background flex-shrink-0">
                {!isReadOnly && mode === 'create' && appointmentId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={salvarRascunho}
                    disabled={isSaving || salvandoRascunho}
                    className="sm:hidden w-full mb-2 h-8 text-muted-foreground"
                  >
                    {salvandoRascunho ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Cloud className="h-4 w-4 mr-2" />
                    )}
                    Salvar e continuar depois
                  </Button>
                )}
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    onClick={goToPrev}
                    disabled={currentSection === 0}
                    className="flex-1 sm:flex-none"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    <span className="sm:inline">Anterior</span>
                  </Button>

                  <div className="hidden sm:flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={handleClose}
                      disabled={isSaving}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancelar
                    </Button>

                    {!isReadOnly && mode === 'create' && appointmentId && (
                      <Button
                        variant="outline"
                        onClick={salvarRascunho}
                        disabled={isSaving || salvandoRascunho}
                      >
                        {salvandoRascunho ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Cloud className="h-4 w-4 mr-2" />
                        )}
                        Salvar rascunho
                      </Button>
                    )}

                    {!isReadOnly && (
                      <Button
                        onClick={() => handleSave()}
                        disabled={isSaving || salvandoRascunho}
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        {mode === 'edit'
                          ? 'Salvar alterações'
                          : 'Finalizar evolução'}
                      </Button>
                    )}
                  </div>

                  {/* Mobile Action Button (Next or Save) */}
                  <div className="flex sm:hidden flex-1 gap-2">
                    {currentSection === secoes.length - 1 ? (
                      !isReadOnly && (
                        <Button
                          onClick={() => handleSave()}
                          disabled={isSaving || salvandoRascunho}
                          className="flex-1"
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          {mode === 'edit' ? 'Salvar' : 'Finalizar'}
                        </Button>
                      )
                    ) : (
                      <Button
                        variant="default" // Mudado para default para destacar "Próximo" em mobile
                        onClick={goToNext}
                        disabled={currentSection === secoes.length - 1}
                        className="flex-1"
                      >
                        Próximo
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    onClick={goToNext}
                    disabled={currentSection === secoes.length - 1}
                    className="hidden sm:flex"
                  >
                    Próximo
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Confirmação de recuperação de rascunho (antes: window.confirm) */}
            <AlertDialog
              open={!!pendingDraft}
              onOpenChange={(open) => {
                // Escape/clique fora: mantém o rascunho salvo para depois
                if (!open) setPendingDraft(null);
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Recuperar rascunho?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Encontramos um rascunho desta evolução salvo há{' '}
                    {pendingDraftTimeLabel}. Deseja recuperá-lo?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    onClick={() => {
                      clearDraft();
                      setPendingDraft(null);
                    }}
                  >
                    Descartar rascunho
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={applyPendingDraft}>
                    Recuperar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Bloqueio de salvamento com seções copiadas ainda não conferidas */}
            <AlertDialog
              open={showRevisaoPendente}
              onOpenChange={setShowRevisaoPendente}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confira antes de salvar</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div>
                      <p>
                        Estas seções vieram da evolução anterior
                        {dataReaproveitadaLabel
                          ? ` de ${dataReaproveitadaLabel}`
                          : ''}{' '}
                        e ainda não foram conferidas:
                      </p>
                      <ul className="mt-2 list-disc pl-5">
                        {secoes
                          .filter((s) => secoesPendentesRevisao.includes(s.id))
                          .map((s) => (
                            <li key={s.id}>
                              {s.icone} {s.titulo}
                            </li>
                          ))}
                      </ul>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      const primeira = secoes.findIndex((s) =>
                        secoesPendentesRevisao.includes(s.id)
                      );
                      if (primeira >= 0) setCurrentSection(primeira);
                      setShowRevisaoPendente(false);
                    }}
                  >
                    Ir para a primeira
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Itens sem resposta: não finaliza (na edição, avisa) */}
            <AlertDialog
              open={!!pendenciasCampos}
              onOpenChange={(open) => !open && setPendenciasCampos(null)}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {mode === 'edit'
                      ? 'Ficaram itens sem resposta'
                      : 'Falta responder para finalizar'}
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2">
                      <p>
                        Quando algo não foi feito, marque a opção própria
                        (&quot;não aferida&quot;, &quot;nenhuma
                        orientação&quot;).
                        {mode === 'create'
                          ? ' Se precisar parar agora, salve o rascunho e termine depois.'
                          : ''}
                      </p>
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {secoes
                          .filter((s) =>
                            (pendenciasCampos ?? []).some(
                              (p) => p.secaoId === s.id
                            )
                          )
                          .map((s) => (
                            <div key={s.id}>
                              <p className="font-medium text-foreground">
                                {s.icone} {s.titulo}
                              </p>
                              <ul className="list-disc pl-5">
                                {(pendenciasCampos ?? [])
                                  .filter((p) => p.secaoId === s.id)
                                  .map((p) => (
                                    <li key={p.item}>{p.item}</li>
                                  ))}
                              </ul>
                            </div>
                          ))}
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  {mode === 'edit' ? (
                    <AlertDialogCancel onClick={() => handleSave(true)}>
                      Salvar mesmo assim
                    </AlertDialogCancel>
                  ) : appointmentId ? (
                    <AlertDialogCancel
                      onClick={(e) => {
                        e.preventDefault();
                        salvarRascunho();
                      }}
                      disabled={salvandoRascunho}
                    >
                      Salvar rascunho
                    </AlertDialogCancel>
                  ) : (
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                  )}
                  <AlertDialogAction
                    onClick={() => {
                      const primeira = secoes.findIndex((s) =>
                        (pendenciasCampos ?? []).some((p) => p.secaoId === s.id)
                      );
                      if (primeira >= 0) setCurrentSection(primeira);
                      setPendenciasCampos(null);
                    }}
                  >
                    Ir para o primeiro
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Confirmação de saída com alterações não salvas (antes: window.confirm) */}
            <AlertDialog
              open={showCloseConfirm}
              onOpenChange={setShowCloseConfirm}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sair da evolução?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {mode === 'create' && appointmentId
                      ? 'A evolução ainda não foi finalizada. O que você preencheu fica guardado só neste aparelho; para continuar em outro, salve o rascunho.'
                      : 'Você tem alterações não salvas. O rascunho foi salvo automaticamente neste aparelho e poderá ser recuperado ao reabrir.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Continuar editando</AlertDialogCancel>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCloseConfirm(false);
                      onClose();
                    }}
                  >
                    Sair
                  </Button>
                  {mode === 'create' && appointmentId && (
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        salvarRascunho();
                      }}
                      disabled={salvandoRascunho}
                    >
                      Salvar rascunho e sair
                    </AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DialogContent>
        </Dialog>
      </MedidasEvolucaoContext.Provider>
    </PlanoMotorContext.Provider>
  );
};

EvolutionFormModal.displayName = 'EvolutionFormModal';
