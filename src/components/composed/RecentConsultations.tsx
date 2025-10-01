import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, User, ChevronRight } from 'lucide-react';
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
  ({ patientId, onConsultationClick, className, userRole }) => {
    const [consultations, setConsultations] = useState<RecentConsultation[]>(
      []
    );
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
      const loadConsultations = async () => {
        if (!patientId) return;

        try {
          setIsLoading(true);
          setError(null);

          // AI dev note: Buscar consultas recentes reais do Supabase usando view completa
          // Query da view vw_agendamentos_completos para ter dados completos incluindo evolução e comissão
          let query = supabase
            .from('vw_agendamentos_completos')
            .select(
              `
              id,
              data_hora,
              valor_servico,
              servico_nome,
              local_nome,
              status_consulta_nome,
              status_consulta_cor,
              status_pagamento_nome,
              status_pagamento_cor,
              profissional_nome,
              possui_evolucao,
              comissao_tipo_recebimento,
              empresa_fatura_razao_social,
              empresa_fatura_nome_fantasia,
              id_pagamento_externo
            `
            )
            .eq('paciente_id', patientId)
            .eq('ativo', true)
            .order('data_hora', { ascending: false });

          // Aplicar limite apenas se não estiver mostrando todas
          if (!showAll) {
            query = query.limit(5);
          }

          const { data, error: queryError } = await query;

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
              servico_nome: item.servico_nome || 'Serviço não especificado',
              local_nome: item.local_nome || 'Local não especificado',
              valor_servico: parseFloat(item.valor_servico || '0'),
              status_consulta:
                item.status_consulta_nome || 'Status não definido',
              status_pagamento:
                item.status_pagamento_nome || 'Status não definido',
              status_cor_consulta: item.status_consulta_cor || '#gray',
              status_cor_pagamento: item.status_pagamento_cor || '#gray',
              profissional_nome:
                item.profissional_nome || 'Profissional não especificado',
              possui_evolucao: item.possui_evolucao || 'não',
              empresa_fatura_nome:
                item.empresa_fatura_razao_social ||
                item.empresa_fatura_nome_fantasia ||
                'Empresa não especificada',
              id_pagamento_externo: item.id_pagamento_externo || '',
              // AI dev note: Campos de comissão para lógica de exibição
              comissao_tipo_recebimento: item.comissao_tipo_recebimento,
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
    }, [patientId, showAll]);

    // Função para formatar data e hora (sem conversão de timezone)
    const formatDateTime = (dateString: string) => {
      // Parse manual para evitar conversão automática de timezone
      // Formato esperado: "2025-07-29T09:00:00+00:00" ou "2025-07-29 09:00:00+00"
      const [datePart, timePart] =
        dateString.split('T').length > 1
          ? dateString.split('T')
          : dateString.split(' ');

      const [year, month, day] = datePart.split('-');
      const [hour, minute] = timePart.split('+')[0].split(':'); // Remove timezone info

      // Criar data usando valores exatos sem conversão
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

      return {
        date: date.toLocaleDateString('pt-BR'),
        time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
      };
    };

    // Função para formatar valor monetário
    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    };

    // AI dev note: Função para determinar valor correto baseado no role
    // APENAS para profissional: mostrar comissão se configurada, senão valor integral
    // Para TODOS os outros roles: sempre valor integral
    const getDisplayValue = (consultation: RecentConsultation): number => {
      // APENAS profissional tem lógica especial
      if (userRole === 'profissional') {
        // Se tem comissão configurada, mostrar comissão
        if (
          consultation.comissao_tipo_recebimento &&
          consultation.valor_servico !== null &&
          consultation.valor_servico !== undefined
        ) {
          return consultation.valor_servico;
        }
      }

      // Para TODOS os outros casos (outros roles ou profissional sem comissão), mostrar valor integral
      return consultation.valor_servico;
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
            Histórico de Consultas
            {totalCount > 0 && (
              <Badge variant="outline" className="ml-auto">
                {totalCount} {totalCount === 1 ? 'consulta' : 'consultas'}
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
                          {formatCurrency(getDisplayValue(consultation))}
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

          {/* Botão Ver mais / Ver menos */}
          {totalCount > 5 && (
            <div className="text-center pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAll(!showAll);
                }}
              >
                {showAll ? (
                  <>
                    Ver menos
                    <ChevronRight className="h-4 w-4 ml-1 rotate-90" />
                  </>
                ) : (
                  <>
                    Ver todas as {totalCount} consultas
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

RecentConsultations.displayName = 'RecentConsultations';
