import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Loader2,
  AlertCircle,
  Calendar,
  User,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { Badge } from '@/components/primitives/badge';
import { Separator } from '@/components/primitives/separator';
import { cn, formatDateTimeBR } from '@/lib/utils';
import {
  fetchPatientMedicalReports,
  savePatientMedicalReport,
} from '@/lib/patient-api';
import type {
  PatientMedicalReportsProps,
  MedicalReport,
} from '@/types/patient-details';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: PatientMedicalReports - Component Composed para gerenciar relatórios médicos
// Exibe lista de relatórios médicos do paciente (múltiplos permitidos)
// Relatórios médicos são gerados a partir de evoluções

export const PatientMedicalReports = React.memo<PatientMedicalReportsProps>(
  ({ patientId, className }) => {
    const { user } = useAuth();
    const [reports, setReports] = useState<MedicalReport[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // AI dev note: Apenas admin pode gerar/editar/excluir relatórios médicos
    const userRole = user?.pessoa?.role as
      | 'admin'
      | 'profissional'
      | 'secretaria'
      | null;
    const canManageReports = userRole === 'admin';

    useEffect(() => {
      loadReports();
    }, [patientId]);

    const loadReports = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchPatientMedicalReports(patientId);
        setReports(data);
      } catch (err) {
        console.error('Erro ao carregar relatórios médicos:', err);
        setError('Erro ao carregar relatórios médicos');
      } finally {
        setIsLoading(false);
      }
    };

    const handleGenerateReport = async () => {
      if (!user?.pessoa?.id) return;

      try {
        setIsGenerating(true);
        setError(null);

        // TODO: Implementar geração de relatório a partir de evoluções
        // Por enquanto, placeholder
        const reportContent = `Relatório Médico gerado em ${new Date().toLocaleDateString('pt-BR')}`;

        await savePatientMedicalReport(
          patientId,
          reportContent,
          user.pessoa.id
        );
        await loadReports();
      } catch (err) {
        console.error('Erro ao gerar relatório:', err);
        setError('Erro ao gerar relatório médico');
      } finally {
        setIsGenerating(false);
      }
    };

    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Relatórios Médicos
            </CardTitle>
            {canManageReports && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateReport}
                disabled={isGenerating || isLoading}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Gerar Relatório
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error State */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Empty State */}
          {!isLoading && !error && reports.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Nenhum relatório médico gerado ainda.</p>
              <p className="text-xs mt-1">
                Clique em "Gerar Relatório" para criar um novo.
              </p>
            </div>
          )}

          {/* Lista de Relatórios */}
          {!isLoading && !error && reports.length > 0 && (
            <div className="space-y-3">
              {reports.map((report, index) => (
                <div
                  key={report.id}
                  className="border rounded-lg p-4 space-y-2 hover:bg-accent/50 transition-colors"
                >
                  {/* Cabeçalho do relatório */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium text-sm">
                        Relatório #{reports.length - index}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {formatDateTimeBR(report.created_at)}
                    </Badge>
                  </div>

                  {/* Informações de auditoria */}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span>
                        Criado por:{' '}
                        <strong className="text-foreground">
                          {report.criado_por_nome || 'Sistema'}
                        </strong>
                      </span>
                    </div>
                    {report.updated_at !== report.created_at && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>
                          Atualizado em: {formatDateTimeBR(report.updated_at)}{' '}
                          por {report.atualizado_por_nome || 'Sistema'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Preview do conteúdo */}
                  {report.conteudo && (
                    <>
                      <Separator />
                      <div
                        className="text-sm text-muted-foreground line-clamp-3"
                        dangerouslySetInnerHTML={{
                          __html: report.conteudo.substring(0, 200) + '...',
                        }}
                      />
                    </>
                  )}

                  {/* Ações */}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      Ver Completo
                    </Button>
                    {report.pdf_url && (
                      <Button variant="outline" size="sm">
                        Baixar PDF
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

PatientMedicalReports.displayName = 'PatientMedicalReports';
