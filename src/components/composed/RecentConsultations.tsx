import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, ChevronRight, User } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Badge } from '@/components/primitives/badge';
import { Button } from '@/components/primitives/button';
import { Skeleton } from '@/components/primitives/skeleton';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { supabase } from '@/lib/supabase';

import type {
  RecentConsultationsProps,
  RecentConsultation,
} from '@/types/patient-details';

// AI dev note: RecentConsultations - Component Composed para exibir consultas recentes reais do paciente
// Busca dados reais do Supabase de agendamentos com joins para detalhes completos
// Consolidado em um único card com dados reais

export const RecentConsultations = React.memo<RecentConsultationsProps>(
  ({ patientId, onConsultationClick, className }) => {
    const [consultations, setConsultations] = useState<RecentConsultation[]>(
      []
    );
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      const loadConsultations = async () => {
        if (!patientId) return;

        try {
          setIsLoading(true);
          setError(null);

          // AI dev note: Buscar consultas recentes reais do Supabase usando view completa
          // Query da view vw_agendamentos_completos para ter dados completos incluindo evolução
          const { data, error: queryError } = await supabase
            .from('vw_agendamentos_completos')
            .select(
              `
              id,
              data_hora,
              valor_servico,
              tipo_servico_nome,
              local_atendimento_nome,
              status_consulta_descricao,
              status_consulta_cor,
              status_pagamento_descricao,
              status_pagamento_cor,
              profissional_nome,
              possui_evolucao
            `
            )
            .eq('paciente_id', patientId)
            .eq('ativo', true)
            .order('data_hora', { ascending: false })
            .limit(5);

          if (queryError) {
            throw new Error(queryError.message);
          }

          if (!data) {
            throw new Error('Nenhum dado encontrado');
          }

          // Mapear dados para interface RecentConsultation
          const mappedConsultations: RecentConsultation[] = data.map(
            (item) => ({
              id: item.id,
              data_hora: item.data_hora,
              servico_nome:
                item.tipo_servico_nome || 'Serviço não especificado',
              local_nome:
                item.local_atendimento_nome || 'Local não especificado',
              valor_servico: parseFloat(item.valor_servico || '0'),
              status_consulta:
                item.status_consulta_descricao || 'Status não definido',
              status_pagamento:
                item.status_pagamento_descricao || 'Status não definido',
              status_cor_consulta: item.status_consulta_cor || '#gray',
              status_cor_pagamento: item.status_pagamento_cor || '#gray',
              profissional_nome:
                item.profissional_nome || 'Profissional não especificado',
              possui_evolucao: item.possui_evolucao || 'não',
            })
          );

          setConsultations(mappedConsultations);

          // Buscar total de consultas para exibir contador
          const { count } = await supabase
            .from('vw_agendamentos_completos')
            .select('*', { count: 'exact', head: true })
            .eq('paciente_id', patientId)
            .eq('ativo', true);

          setTotalCount(count || 0);
        } catch (err) {
          console.error('Erro ao carregar consultas recentes:', err);
          setError('Erro ao carregar consultas recentes');
        } finally {
          setIsLoading(false);
        }
      };

      loadConsultations();
    }, [patientId]);

    // Função para formatar data e hora
    const formatDateTime = (dateString: string) => {
      const date = new Date(dateString);
      return {
        date: date.toLocaleDateString('pt-BR'),
        time: date.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    };

    // Função para formatar valor monetário
    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    };

    // Loading state
    if (isLoading) {
      return (
        <Card className={className}>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="flex items-start gap-4 p-4 border rounded-lg"
              >
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
      );
    }

    // Error state
    if (error) {
      return (
        <Alert variant="destructive" className={className}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      );
    }

    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Consultas Recentes
            {totalCount > 0 && (
              <Badge variant="outline" className="ml-auto">
                {totalCount} total
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {consultations.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma consulta encontrada</p>
            </div>
          ) : (
            consultations.map((consultation) => {
              const { date, time } = formatDateTime(consultation.data_hora);

              return (
                <div
                  key={consultation.id}
                  className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => onConsultationClick?.(consultation.id)}
                >
                  {/* Ícone de data */}
                  <div className="flex flex-col items-center justify-center w-12 h-12 bg-blue-100 rounded-lg">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    <span className="text-xs font-medium text-blue-600">
                      {date.split('/')[0]}
                    </span>
                  </div>

                  {/* Detalhes da consulta */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-sm">
                          {consultation.servico_nome}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {date} às {time}
                          </span>
                          {consultation.local_nome && (
                            <>
                              <span>•</span>
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                <span>{consultation.local_nome}</span>
                              </div>
                            </>
                          )}
                        </div>
                        {consultation.profissional_nome && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <User className="h-3 w-3" />
                            <span>{consultation.profissional_nome}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {formatCurrency(consultation.valor_servico)}
                        </div>
                      </div>
                    </div>

                    {/* Status badges */}
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: consultation.status_cor_consulta,
                          color: consultation.status_cor_consulta,
                        }}
                      >
                        {consultation.status_consulta}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: consultation.status_cor_pagamento,
                          color: consultation.status_cor_pagamento,
                        }}
                      >
                        {consultation.status_pagamento}
                      </Badge>

                      {/* Badge de evolução - apenas se não possui */}
                      {consultation.possui_evolucao === 'não' && (
                        <Badge
                          variant="outline"
                          className="text-xs px-1.5 py-0.5 h-5 bg-yellow-50 text-yellow-800 border-yellow-200"
                        >
                          Evoluir Paciente
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Ver mais */}
          {totalCount > consultations.length && (
            <div className="text-center pt-4 border-t">
              <Button variant="outline" size="sm">
                Ver todas as {totalCount} consultas
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

RecentConsultations.displayName = 'RecentConsultations';
