import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  Plus,
  Eye,
  Edit,
  Calendar,
  User,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { Badge } from '@/components/primitives/badge';
import { cn } from '@/lib/utils';
import {
  fetchAvaliacoesByPaciente,
  getLabelGrauSeveridade,
  getCorGrauSeveridade,
} from '@/lib/avaliacoes-clinicas-api';
import type { AvaliacaoClinicaListItem } from '@/types/avaliacoes-clinicas';
import { EvaluationFormModal } from './EvaluationFormModal';

// AI dev note: PatientClinicalEvaluations - Seção de avaliações clínicas TM/AC
// Mostra lista de avaliações existentes e permite criar/editar avaliações

interface PatientClinicalEvaluationsProps {
  patientId: string;
  patientName?: string;
  patientBirthDate?: string | null;
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
  currentUserId?: string;
  className?: string;
}

export const PatientClinicalEvaluations: React.FC<
  PatientClinicalEvaluationsProps
> = ({
  patientId,
  patientName,
  patientBirthDate,
  userRole,
  currentUserId,
  className,
}) => {
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoClinicaListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados do modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAvaliacaoId, setSelectedAvaliacaoId] = useState<string | null>(
    null
  );
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>(
    'create'
  );

  const canEdit = userRole === 'admin' || userRole === 'profissional';

  const loadAvaliacoes = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchAvaliacoesByPaciente(patientId);
      setAvaliacoes(data);
    } catch (err) {
      console.error('Erro ao carregar avaliações:', err);
      setError('Erro ao carregar avaliações clínicas');
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadAvaliacoes();
  }, [loadAvaliacoes]);

  const handleNovaAvaliacao = () => {
    setSelectedAvaliacaoId(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleVerAvaliacao = (id: string) => {
    setSelectedAvaliacaoId(id);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleEditarAvaliacao = (id: string) => {
    setSelectedAvaliacaoId(id);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedAvaliacaoId(null);
  };

  const handleModalSave = () => {
    loadAvaliacoes();
    handleModalClose();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'finalizada':
        return (
          <Badge variant="default" className="bg-emerald-500 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Finalizada
          </Badge>
        );
      case 'revisao':
        return (
          <Badge variant="secondary" className="bg-amber-500 text-white gap-1">
            <AlertTriangle className="h-3 w-3" />
            Em revisão
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Rascunho
          </Badge>
        );
    }
  };

  const getSeverityBadge = (grau: number | null | undefined) => {
    if (!grau) return null;

    const cor = getCorGrauSeveridade(grau);
    const corClasses = {
      green: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      yellow: 'bg-amber-100 text-amber-800 border-amber-300',
      orange: 'bg-orange-100 text-orange-800 border-orange-300',
      red: 'bg-rose-100 text-rose-800 border-rose-300',
      gray: 'bg-gray-100 text-gray-800 border-gray-300',
    };

    return (
      <Badge variant="outline" className={cn('gap-1', corClasses[cor])}>
        Grau {grau}: {getLabelGrauSeveridade(grau)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5 text-primary" />
            Avaliações Clínicas TM/AC
          </CardTitle>
          {canEdit && (
            <Button onClick={handleNovaAvaliacao} size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nova Avaliação</span>
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {error ? (
            <div className="text-center py-6 text-destructive">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{error}</p>
            </div>
          ) : avaliacoes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma avaliação registrada</p>
              {canEdit && (
                <Button
                  variant="outline"
                  onClick={handleNovaAvaliacao}
                  className="mt-4 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Criar primeira avaliação
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {avaliacoes.map((avaliacao) => (
                <div
                  key={avaliacao.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {formatDate(avaliacao.data_avaliacao)}
                      </span>
                      {getStatusBadge(avaliacao.status)}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {getSeverityBadge(avaliacao.grau_severidade)}

                      {avaliacao.tipo_torcicolo && (
                        <Badge variant="secondary" className="capitalize">
                          {avaliacao.tipo_torcicolo}
                        </Badge>
                      )}
                    </div>

                    {avaliacao.avaliador_nome && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Avaliador: {avaliacao.avaliador_nome}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 self-end sm:self-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleVerAvaliacao(avaliacao.id)}
                      className="gap-1"
                    >
                      <Eye className="h-4 w-4" />
                      <span className="hidden sm:inline">Ver</span>
                    </Button>
                    {canEdit && avaliacao.status !== 'finalizada' && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleEditarAvaliacao(avaliacao.id)}
                        className="gap-1"
                      >
                        <Edit className="h-4 w-4" />
                        <span className="hidden sm:inline">Editar</span>
                      </Button>
                    )}
                    {canEdit && avaliacao.status === 'finalizada' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEditarAvaliacao(avaliacao.id)}
                        className="gap-1"
                      >
                        <Edit className="h-4 w-4" />
                        <span className="hidden sm:inline">Revisar</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Avaliação */}
      <EvaluationFormModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={handleModalSave}
        avaliacaoId={selectedAvaliacaoId}
        patientId={patientId}
        patientName={patientName}
        patientBirthDate={patientBirthDate}
        currentUserId={currentUserId}
        mode={modalMode}
      />
    </>
  );
};

PatientClinicalEvaluations.displayName = 'PatientClinicalEvaluations';

