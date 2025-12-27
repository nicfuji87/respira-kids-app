import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Save,
  CheckCircle2,
  Circle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PanelLeftClose,
  PanelLeft,
  List,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';
import { Progress } from '@/components/primitives/progress';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/primitives/sheet';
import { ScrollArea } from '@/components/primitives/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/primitives/tooltip';
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
import { cn } from '@/lib/utils';
import {
  fetchAvaliacaoById,
  createAvaliacao,
  updateAvaliacao,
  autoSaveAvaliacao,
  calcularIdadeSemanas,
  verificarSecaoCompletaDetalhado,
  getNomeCampo,
  calcularProgressoAvaliacao,
  finalizarAvaliacao,
  deleteAvaliacao,
  formatarIdade,
} from '@/lib/avaliacoes-clinicas-api';
import type {
  AvaliacaoClinica,
  AvaliacaoClinicaUpdate,
  GrupoSecao,
} from '@/types/avaliacoes-clinicas';
import {
  AVALIACOES_SECOES,
  GRUPOS_SECOES,
  getCorCategoria,
} from '@/types/avaliacoes-clinicas';
import { EvaluationSectionContent } from './EvaluationSectionContent';

// AI dev note: EvaluationFormModal - Modal de formulário de avaliação com navegação por índice
// Usa sidebar/índice lateral para navegação rápida entre seções
// Auto-save debounced para não perder dados

interface EvaluationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  avaliacaoId: string | null;
  patientId: string;
  patientName?: string;
  patientBirthDate?: string | null;
  currentUserId?: string;
  mode: 'create' | 'edit' | 'view';
}

export const EvaluationFormModal: React.FC<EvaluationFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  avaliacaoId,
  patientId,
  patientName,
  patientBirthDate,
  currentUserId,
  mode,
}) => {
  const [avaliacao, setAvaliacao] = useState<AvaliacaoClinica | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false); // Sidebar começa recolhida

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef<Partial<AvaliacaoClinicaUpdate>>({});

  const isReadOnly = mode === 'view';

  // Carregar avaliação existente ou criar nova
  useEffect(() => {
    if (!isOpen) return;

    const loadOrCreate = async () => {
      setIsLoading(true);
      try {
        if (avaliacaoId) {
          const data = await fetchAvaliacaoById(avaliacaoId);
          setAvaliacao(data);
        } else {
          // Criar nova avaliação
          const idadeSemanas = patientBirthDate
            ? calcularIdadeSemanas(patientBirthDate)
            : null;
          const novaAvaliacao = await createAvaliacao({
            pessoa_id: patientId,
            data_avaliacao: new Date().toISOString().split('T')[0],
            idade_semanas: idadeSemanas,
            status: 'rascunho',
            avaliador_id: currentUserId || undefined,
            criado_por: currentUserId || undefined,
          });
          setAvaliacao(novaAvaliacao);
        }
      } catch (error) {
        console.error('Erro ao carregar/criar avaliação:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadOrCreate();
    setCurrentSection(0);

    return () => {
      // Limpar timeout de auto-save ao fechar
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [isOpen, avaliacaoId, patientId, patientBirthDate, currentUserId]);

  // Auto-save com debounce
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      if (
        avaliacao?.id &&
        Object.keys(pendingChangesRef.current).length > 0 &&
        !isReadOnly
      ) {
        try {
          await autoSaveAvaliacao(avaliacao.id, pendingChangesRef.current);
          pendingChangesRef.current = {};
        } catch (error) {
          console.error('Erro no auto-save:', error);
        }
      }
    }, 1000); // 1 segundo de debounce
  }, [avaliacao?.id, isReadOnly]);

  // Handler para atualização de campos
  const handleFieldChange = useCallback(
    (updates: Partial<AvaliacaoClinicaUpdate>) => {
      if (isReadOnly) return;

      setAvaliacao((prev) => (prev ? { ...prev, ...updates } : null));
      pendingChangesRef.current = { ...pendingChangesRef.current, ...updates };
      scheduleAutoSave();
    },
    [isReadOnly, scheduleAutoSave]
  );

  // Salvar e fechar
  const handleSaveAndClose = async () => {
    if (!avaliacao?.id || isReadOnly) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      // Salvar mudanças pendentes
      if (Object.keys(pendingChangesRef.current).length > 0) {
        await updateAvaliacao(avaliacao.id, pendingChangesRef.current);
        pendingChangesRef.current = {};
      }
      onSave();
    } catch (error) {
      console.error('Erro ao salvar:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Finalizar avaliação
  const handleFinalizar = async () => {
    if (!avaliacao?.id) return;

    setIsSaving(true);
    try {
      // Salvar mudanças pendentes primeiro
      if (Object.keys(pendingChangesRef.current).length > 0) {
        await updateAvaliacao(avaliacao.id, pendingChangesRef.current);
        pendingChangesRef.current = {};
      }
      await finalizarAvaliacao(avaliacao.id);
      onSave();
    } catch (error) {
      console.error('Erro ao finalizar:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Excluir avaliação (apenas rascunhos)
  const handleDelete = async () => {
    if (!avaliacao?.id) return;

    setIsDeleting(true);
    try {
      await deleteAvaliacao(avaliacao.id);
      onSave(); // Atualiza a lista e fecha o modal
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Erro ao excluir avaliação. Apenas rascunhos podem ser excluídos.');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  // Verificar status de preenchimento de cada seção
  const getSectionStatus = (
    secaoIndex: number
  ): 'completo' | 'parcial' | 'vazio' => {
    if (!avaliacao) return 'vazio';
    const secao = AVALIACOES_SECOES[secaoIndex];
    const resultado = verificarSecaoCompletaDetalhado(avaliacao, secao.campos);
    return resultado.status;
  };

  // Obter detalhes dos campos faltantes de uma seção
  const getSectionDetails = (
    secaoIndex: number
  ): { camposFaltantes: string[]; total: number; preenchidos: number } => {
    if (!avaliacao) return { camposFaltantes: [], total: 0, preenchidos: 0 };
    const secao = AVALIACOES_SECOES[secaoIndex];
    const resultado = verificarSecaoCompletaDetalhado(avaliacao, secao.campos);
    return {
      camposFaltantes: resultado.camposFaltantes,
      total: resultado.camposObrigatorios.length,
      preenchidos: resultado.camposPreenchidos.length,
    };
  };

  // Calcular progresso geral
  const progresso = avaliacao ? calcularProgressoAvaliacao(avaliacao) : null;

  // Navegação entre seções
  const handlePreviousSection = () => {
    setCurrentSection((prev) => Math.max(0, prev - 1));
  };

  const handleNextSection = () => {
    setCurrentSection((prev) =>
      Math.min(AVALIACOES_SECOES.length - 1, prev + 1)
    );
  };

  const handleSectionClick = (index: number) => {
    setCurrentSection(index);
    setSidebarOpen(false);
  };

  // Renderizar ícone de status da seção
  const renderSectionStatusIcon = (
    status: 'completo' | 'parcial' | 'vazio'
  ) => {
    switch (status) {
      case 'completo':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'parcial':
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground/40" />;
    }
  };

  // Estado para controlar grupos colapsados
  const [collapsedGroups, setCollapsedGroups] = useState<Set<GrupoSecao>>(
    new Set()
  );

  const toggleGroup = (grupo: GrupoSecao) => {
    setCollapsedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(grupo)) {
        newSet.delete(grupo);
      } else {
        newSet.add(grupo);
      }
      return newSet;
    });
  };

  // Agrupa as seções por grupo
  const secoesAgrupadas = GRUPOS_SECOES.map((grupo) => ({
    ...grupo,
    secoes: AVALIACOES_SECOES.filter((s) => s.grupo === grupo.id),
  }));

  // Componente do índice lateral - versão completa para mobile sheet
  const SidebarContentFull = () => (
    <div className="h-full flex flex-col">
      {/* Progresso Geral */}
      {progresso && (
        <div className="p-4 border-b space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progresso</span>
            <span className="font-medium">{progresso.percentual}%</span>
          </div>
          <Progress value={progresso.percentual} className="h-2" />
        </div>
      )}

      {/* Legenda de cores */}
      <div className="px-4 py-2 border-b flex flex-wrap gap-2 text-xs">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Torcicolo</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-sky-500" />
          <span className="text-muted-foreground">Crânio</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-muted-foreground">Comum</span>
        </span>
      </div>

      {/* Lista de Seções Agrupadas */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {secoesAgrupadas.map((grupo) => {
            const isCollapsed = collapsedGroups.has(grupo.id);
            const grupoTemSecaoAtiva = grupo.secoes.some(
              (s) =>
                AVALIACOES_SECOES.findIndex((sec) => sec.id === s.id) ===
                currentSection
            );

            // Calcular progresso do grupo
            const secoesCompletas = grupo.secoes.filter(
              (s) =>
                getSectionStatus(
                  AVALIACOES_SECOES.findIndex((sec) => sec.id === s.id)
                ) === 'completo'
            ).length;
            const progressoGrupo = Math.round(
              (secoesCompletas / grupo.secoes.length) * 100
            );

            return (
              <div
                key={grupo.id}
                className={cn(
                  'rounded-lg border overflow-hidden',
                  grupo.corBorder
                )}
              >
                {/* Header do Grupo */}
                <button
                  onClick={() => toggleGroup(grupo.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-left transition-colors',
                    grupo.corBg,
                    grupoTemSecaoAtiva && 'ring-2 ring-primary ring-inset'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{grupo.icone}</span>
                    <div>
                      <p className={cn('font-semibold text-sm', grupo.cor)}>
                        {grupo.titulo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {grupo.secoes.length} seções • {progressoGrupo}%
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 transition-transform',
                      grupo.cor,
                      !isCollapsed && 'rotate-90'
                    )}
                  />
                </button>

                {/* Seções do Grupo */}
                {!isCollapsed && (
                  <div className="border-t bg-background p-1 space-y-0.5">
                    {grupo.secoes.map((secao) => {
                      const index = AVALIACOES_SECOES.findIndex(
                        (s) => s.id === secao.id
                      );
                      const status = getSectionStatus(index);
                      const isActive = currentSection === index;
                      const corCategoria = getCorCategoria(secao.categoria);
                      const details = getSectionDetails(index);

                      return (
                        <button
                          key={secao.id}
                          onClick={() => handleSectionClick(index)}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors text-sm',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-accent',
                            !isActive && `border-l-3 ${corCategoria.border}`
                          )}
                          style={{
                            borderLeftWidth: isActive ? 0 : '3px',
                            borderLeftColor: isActive
                              ? undefined
                              : secao.categoria === 'tmc'
                                ? '#10b981'
                                : secao.categoria === 'assimetria_craniana'
                                  ? '#0ea5e9'
                                  : '#9ca3af',
                          }}
                        >
                          {renderSectionStatusIcon(status)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className={cn(
                                  'font-medium truncate',
                                  isActive ? 'text-primary-foreground' : ''
                                )}
                              >
                                {secao.numero}. {secao.titulo}
                              </p>
                              {/* Contador de campos */}
                              {details.total > 0 && (
                                <span
                                  className={cn(
                                    'text-[10px] px-1.5 py-0.5 rounded-full',
                                    isActive
                                      ? 'bg-primary-foreground/20 text-primary-foreground'
                                      : status === 'completo'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : status === 'parcial'
                                          ? 'bg-amber-100 text-amber-700'
                                          : 'bg-muted text-muted-foreground'
                                  )}
                                >
                                  {details.preenchidos}/{details.total}
                                </span>
                              )}
                            </div>
                            {/* Mostrar campos faltantes em vez de descrição se houver */}
                            {status === 'parcial' &&
                            details.camposFaltantes.length > 0 ? (
                              <p
                                className={cn(
                                  'text-xs truncate',
                                  isActive ? 'text-amber-200' : 'text-amber-600'
                                )}
                                title={details.camposFaltantes
                                  .map((c) => getNomeCampo(c))
                                  .join(', ')}
                              >
                                ⚠️ Falta:{' '}
                                {details.camposFaltantes
                                  .slice(0, 2)
                                  .map((c) => getNomeCampo(c))
                                  .join(', ')}
                                {details.camposFaltantes.length > 2 &&
                                  ` +${details.camposFaltantes.length - 2}`}
                              </p>
                            ) : (
                              secao.descricao && (
                                <p
                                  className={cn(
                                    'text-xs truncate',
                                    isActive
                                      ? 'text-primary-foreground/70'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  {secao.descricao}
                                </p>
                              )
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  // Componente do índice lateral - versão compacta/colapsável para desktop
  const SidebarContentCollapsible = ({ expanded }: { expanded: boolean }) => (
    <TooltipProvider delayDuration={100}>
      <div className="h-full flex flex-col">
        {/* Botão de toggle */}
        <div className="p-2 border-b flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarExpanded(!expanded)}
            className="w-full justify-center"
          >
            {expanded ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Progresso Geral */}
        {progresso && (
          <div className={cn('border-b', expanded ? 'p-3' : 'p-2')}>
            {expanded ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-medium">{progresso.percentual}%</span>
                </div>
                <Progress value={progresso.percentual} className="h-1.5" />
              </div>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center gap-1">
                    <div className="relative w-8 h-8">
                      <svg className="w-8 h-8 -rotate-90">
                        <circle
                          cx="16"
                          cy="16"
                          r="12"
                          stroke="currentColor"
                          strokeWidth="3"
                          fill="none"
                          className="text-muted"
                        />
                        <circle
                          cx="16"
                          cy="16"
                          r="12"
                          stroke="currentColor"
                          strokeWidth="3"
                          fill="none"
                          strokeDasharray={75.4}
                          strokeDashoffset={
                            75.4 - (75.4 * progresso.percentual) / 100
                          }
                          className="text-primary"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
                        {progresso.percentual}
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Progresso: {progresso.percentual}%</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Lista de Seções Agrupadas */}
        <ScrollArea className="flex-1">
          <div className={cn('space-y-1', expanded ? 'p-2' : 'p-1')}>
            {expanded
              ? // Versão expandida com grupos
                secoesAgrupadas.map((grupo) => {
                  const isCollapsed = collapsedGroups.has(grupo.id);
                  const grupoTemSecaoAtiva = grupo.secoes.some(
                    (s) =>
                      AVALIACOES_SECOES.findIndex((sec) => sec.id === s.id) ===
                      currentSection
                  );

                  return (
                    <div
                      key={grupo.id}
                      className={cn(
                        'rounded-md border overflow-hidden',
                        grupo.corBorder
                      )}
                    >
                      {/* Header do Grupo */}
                      <button
                        onClick={() => toggleGroup(grupo.id)}
                        className={cn(
                          'w-full flex items-center justify-between px-2 py-1.5 text-left transition-colors',
                          grupo.corBg,
                          grupoTemSecaoAtiva && 'ring-1 ring-primary ring-inset'
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{grupo.icone}</span>
                          <p className={cn('font-medium text-xs', grupo.cor)}>
                            {grupo.titulo}
                          </p>
                        </div>
                        <ChevronRight
                          className={cn(
                            'h-3 w-3 transition-transform',
                            grupo.cor,
                            !isCollapsed && 'rotate-90'
                          )}
                        />
                      </button>

                      {/* Seções do Grupo */}
                      {!isCollapsed && (
                        <div className="bg-background p-0.5 space-y-0.5">
                          {grupo.secoes.map((secao) => {
                            const index = AVALIACOES_SECOES.findIndex(
                              (s) => s.id === secao.id
                            );
                            const status = getSectionStatus(index);
                            const isActive = currentSection === index;

                            return (
                              <button
                                key={secao.id}
                                onClick={() => setCurrentSection(index)}
                                className={cn(
                                  'w-full flex items-center gap-1.5 px-2 py-1 rounded text-left transition-colors text-xs',
                                  isActive
                                    ? 'bg-primary text-primary-foreground'
                                    : 'hover:bg-accent'
                                )}
                                style={{
                                  borderLeftWidth: isActive ? 0 : '2px',
                                  borderLeftColor: isActive
                                    ? undefined
                                    : secao.categoria === 'tmc'
                                      ? '#10b981'
                                      : secao.categoria ===
                                          'assimetria_craniana'
                                        ? '#0ea5e9'
                                        : '#d1d5db',
                                }}
                              >
                                {renderSectionStatusIcon(status)}
                                <span className="flex-1 truncate">
                                  {secao.numero}. {secao.titulo}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              : // Versão compacta - ícones de grupo com números
                secoesAgrupadas.map((grupo) => (
                  <div key={grupo.id} className="space-y-0.5">
                    {/* Ícone do Grupo */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            'flex items-center justify-center py-1 rounded-md text-sm',
                            grupo.corBg
                          )}
                        >
                          {grupo.icone}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p className="font-medium">{grupo.titulo}</p>
                        <p className="text-xs text-muted-foreground">
                          {grupo.secoes.length} seções
                        </p>
                      </TooltipContent>
                    </Tooltip>

                    {/* Números das seções */}
                    {grupo.secoes.map((secao) => {
                      const index = AVALIACOES_SECOES.findIndex(
                        (s) => s.id === secao.id
                      );
                      const status = getSectionStatus(index);
                      const isActive = currentSection === index;

                      return (
                        <Tooltip key={secao.id}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setCurrentSection(index)}
                              className={cn(
                                'w-full flex items-center justify-center p-1 rounded transition-colors',
                                isActive
                                  ? 'bg-primary text-primary-foreground'
                                  : 'hover:bg-accent'
                              )}
                            >
                              <span
                                className={cn(
                                  'text-[10px] font-medium w-5 h-5 flex items-center justify-center rounded-full',
                                  status === 'completo' &&
                                    !isActive &&
                                    'bg-emerald-100 text-emerald-700',
                                  status === 'parcial' &&
                                    !isActive &&
                                    'bg-amber-100 text-amber-700',
                                  status === 'vazio' &&
                                    !isActive &&
                                    'bg-muted text-muted-foreground'
                                )}
                                style={{
                                  boxShadow: isActive
                                    ? undefined
                                    : secao.categoria === 'tmc'
                                      ? 'inset 0 0 0 2px #10b981'
                                      : secao.categoria ===
                                          'assimetria_craniana'
                                        ? 'inset 0 0 0 2px #0ea5e9'
                                        : undefined,
                                }}
                              >
                                {secao.numero}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="right"
                            className="max-w-[280px]"
                          >
                            <p className="font-medium">
                              {secao.numero}. {secao.titulo}
                            </p>
                            {secao.descricao && (
                              <p className="text-xs text-muted-foreground">
                                {secao.descricao}
                              </p>
                            )}
                            {/* Mostrar campos faltantes se status for parcial */}
                            {(() => {
                              const details = getSectionDetails(index);
                              if (
                                status === 'parcial' &&
                                details.camposFaltantes.length > 0
                              ) {
                                return (
                                  <div className="mt-2 pt-2 border-t border-amber-200">
                                    <p className="text-xs font-medium text-amber-600">
                                      Faltam {details.camposFaltantes.length}{' '}
                                      campo(s):
                                    </p>
                                    <ul className="text-xs text-amber-500 mt-1 space-y-0.5">
                                      {details.camposFaltantes
                                        .slice(0, 5)
                                        .map((c) => (
                                          <li key={c}>• {getNomeCampo(c)}</li>
                                        ))}
                                      {details.camposFaltantes.length > 5 && (
                                        <li className="italic">
                                          ... e mais{' '}
                                          {details.camposFaltantes.length - 5}
                                        </li>
                                      )}
                                    </ul>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                ))}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && handleSaveAndClose()}
    >
      <DialogContent className="w-[95vw] max-w-[95vw] md:w-[90vw] md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl h-[95vh] md:h-[90vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <DialogHeader className="p-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Botão do menu em mobile */}
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <List className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <SidebarContentFull />
                </SheetContent>
              </Sheet>

              <div>
                <DialogTitle className="text-lg">
                  {mode === 'create'
                    ? 'Nova Avaliação TM/AC'
                    : mode === 'edit'
                      ? 'Editar Avaliação TM/AC'
                      : 'Visualizar Avaliação TM/AC'}
                </DialogTitle>
                {patientName && (
                  <p className="text-sm text-muted-foreground">
                    Paciente: {patientName}
                    {patientBirthDate &&
                      ` • ${formatarIdade(patientBirthDate)}`}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isReadOnly && avaliacao?.status !== 'finalizada' && (
                <Badge variant="outline" className="gap-1 hidden sm:flex">
                  <Circle className="h-2 w-2 fill-amber-500 text-amber-500" />
                  Rascunho
                </Badge>
              )}
              {avaliacao?.status === 'finalizada' && (
                <Badge variant="default" className="bg-emerald-500 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Finalizada
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Conteúdo */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - Desktop (colapsável) */}
          <div
            className={cn(
              'hidden md:block border-r bg-muted/30 transition-all duration-200',
              sidebarExpanded ? 'w-56' : 'w-14'
            )}
          >
            <SidebarContentCollapsible expanded={sidebarExpanded} />
          </div>

          {/* Área Principal */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : avaliacao ? (
              <>
                {/* Conteúdo da Seção */}
                <ScrollArea className="flex-1 p-4 md:p-6">
                  <EvaluationSectionContent
                    secao={AVALIACOES_SECOES[currentSection]}
                    avaliacao={avaliacao}
                    onChange={handleFieldChange}
                    isReadOnly={isReadOnly}
                    patientName={patientName}
                    patientAgeInMonths={
                      patientBirthDate
                        ? Math.floor(
                            (new Date().getTime() -
                              new Date(patientBirthDate).getTime()) /
                              (1000 * 60 * 60 * 24 * 30.44)
                          )
                        : 0
                    }
                  />
                </ScrollArea>

                {/* Footer com Navegação */}
                <div className="flex-shrink-0 border-t bg-background">
                  {/* Layout em duas linhas para caber tudo */}
                  <div className="p-2 space-y-2">
                    {/* Linha 1: Navegação entre seções */}
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePreviousSection}
                        disabled={currentSection === 0}
                        className="h-8 px-2"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden sm:inline ml-1">Anterior</span>
                      </Button>
                      <span className="text-sm text-muted-foreground font-medium min-w-[50px] text-center">
                        {currentSection + 1} / {AVALIACOES_SECOES.length}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextSection}
                        disabled={
                          currentSection === AVALIACOES_SECOES.length - 1
                        }
                        className="h-8 px-2"
                      >
                        <span className="hidden sm:inline mr-1">Próxima</span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Linha 2: Ações */}
                    <div className="flex items-center justify-center gap-2">
                      {/* Botão Excluir - apenas para rascunhos */}
                      {!isReadOnly && avaliacao.status === 'rascunho' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDeleteDialog(true)}
                          disabled={isDeleting}
                          className="h-8 px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="hidden sm:inline ml-1.5">
                            Excluir
                          </span>
                        </Button>
                      )}

                      {/* Botão Salvar */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSaveAndClose}
                        disabled={isSaving}
                        className="h-8 px-3"
                      >
                        {isSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        <span className="ml-1.5">
                          {isReadOnly ? 'Fechar' : 'Salvar'}
                        </span>
                      </Button>

                      {/* Botão Finalizar - apenas para não finalizadas */}
                      {!isReadOnly && avaliacao.status !== 'finalizada' && (
                        <Button
                          size="sm"
                          onClick={handleFinalizar}
                          disabled={isSaving}
                          className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="ml-1.5">Finalizar</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Erro ao carregar avaliação
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir avaliação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A avaliação será permanentemente
              excluída do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

EvaluationFormModal.displayName = 'EvaluationFormModal';
