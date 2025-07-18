import React, { useState, useEffect } from 'react';
import { User, Phone, Mail } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { fetchPacientes } from '@/lib/calendar-services';
import type { SupabasePessoa } from '@/types/supabase-calendar';

// AI dev note: PatientDetailsManager - Component Domain para gerenciar detalhes do paciente
// Combina Composed components para exibir informações completas do paciente
// Gerencia estado de loading e dados do paciente selecionado

export interface PatientDetailsManagerProps {
  patientId: string;
  onBack?: () => void;
  className?: string;
}

interface PatientDetails extends SupabasePessoa {
  nomes_responsaveis?: string;
  responsavel_legal_nome?: string;
  responsavel_legal_email?: string;
  responsavel_legal_telefone?: number;
  responsavel_financeiro_nome?: string;
  responsavel_financeiro_email?: string;
  responsavel_financeiro_telefone?: number;
}

export const PatientDetailsManager = React.memo<PatientDetailsManagerProps>(
  ({ patientId, onBack, className }) => {
    const [patient, setPatient] = useState<PatientDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      const loadPatientDetails = async () => {
        if (!patientId) return;

        try {
          setIsLoading(true);
          setError(null);

          // AI dev note: Usar a API existente fetchPacientes para buscar dados
          const patients = await fetchPacientes();
          const foundPatient = patients.find((p) => p.id === patientId);

          if (foundPatient) {
            setPatient(foundPatient as PatientDetails);
          } else {
            setError('Paciente não encontrado');
          }
        } catch (err) {
          console.error('Erro ao carregar detalhes do paciente:', err);
          setError('Erro ao carregar dados do paciente');
        } finally {
          setIsLoading(false);
        }
      };

      loadPatientDetails();
    }, [patientId]);

    if (isLoading) {
      return (
        <div className={className}>
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-48" />
            </div>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    if (error || !patient) {
      return (
        <div className={className}>
          <div className="text-center py-8">
            <p className="text-destructive">
              {error || 'Paciente não encontrado'}
            </p>
            {onBack && (
              <Button variant="outline" onClick={onBack} className="mt-4">
                Voltar
              </Button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className={className}>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack}>
                ← Voltar
              </Button>
            )}
            <h1 className="text-2xl font-bold">{patient.nome}</h1>
          </div>

          {/* Informações básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informações Pessoais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Nome Completo</p>
                    <p className="text-sm text-muted-foreground">
                      {patient.nome}
                    </p>
                  </div>
                </div>

                {patient.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-sm text-muted-foreground">
                        {patient.email}
                      </p>
                    </div>
                  </div>
                )}

                {patient.telefone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Telefone</p>
                      <p className="text-sm text-muted-foreground">
                        {patient.telefone}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Responsáveis */}
          {patient.nomes_responsaveis && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Responsáveis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {patient.responsavel_legal_nome && (
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-1">
                        Legal
                      </Badge>
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {patient.responsavel_legal_nome}
                        </p>
                        {patient.responsavel_legal_email && (
                          <p className="text-sm text-muted-foreground">
                            {patient.responsavel_legal_email}
                          </p>
                        )}
                        {patient.responsavel_legal_telefone && (
                          <p className="text-sm text-muted-foreground">
                            {patient.responsavel_legal_telefone}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {patient.responsavel_financeiro_nome && (
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-1">
                        Financeiro
                      </Badge>
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {patient.responsavel_financeiro_nome}
                        </p>
                        {patient.responsavel_financeiro_email && (
                          <p className="text-sm text-muted-foreground">
                            {patient.responsavel_financeiro_email}
                          </p>
                        )}
                        {patient.responsavel_financeiro_telefone && (
                          <p className="text-sm text-muted-foreground">
                            {patient.responsavel_financeiro_telefone}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Placeholder para desenvolvimento futuro */}
          <Card>
            <CardHeader>
              <CardTitle>Desenvolvimento em Andamento</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-4">
                Mais funcionalidades serão adicionadas em breve...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
);

PatientDetailsManager.displayName = 'PatientDetailsManager';
