import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  Skeleton,
  Alert,
  AlertDescription,
} from '@/components/primitives';
import { ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ProfissionalData {
  id: string;
  nome: string;
  totalConsultas: number;
  comissao: number;
  faturamentoClinica: number;
  consultasComEvolucao: number;
}

interface RelatorioProfissionaisProps {
  userRole?: 'admin' | 'profissional' | 'secretaria' | null;
  profissionalIdFilter?: string;
  className?: string;
}

export const RelatorioProfissionais = React.memo<RelatorioProfissionaisProps>(
  ({ userRole = 'admin', profissionalIdFilter, className }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<ProfissionalData[]>([]);
    const [mes, setMes] = useState<string>(
      new Date().toISOString().slice(0, 7)
    );
    const [expandedProfissional, setExpandedProfissional] = useState<
      string | null
    >(null);

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    };

    useEffect(() => {
      const loadData = async () => {
        try {
          setIsLoading(true);
          setError(null);

          // AI dev note: Buscar dados de profissionais com métricas de faturamento
          const [mesInicio, mesAno] = mes.split('-');
          const dataInicio = new Date(`${mes}-01T00:00:00`);
          const dataFim = new Date(
            parseInt(mesAno),
            parseInt(mesInicio),
            0,
            23,
            59,
            59
          );

          let query = supabase
            .from('vw_agendamentos_completos')
            .select(
              'profissional_id, profissional_nome, valor_servico, status_consulta_codigo, possui_evolucao'
            )
            .gte(
              'data_hora',
              dataInicio.toISOString().split('T')[0] + 'T00:00:00'
            )
            .lte('data_hora', dataFim.toISOString())
            .eq('ativo', true);

          if (profissionalIdFilter && userRole === 'profissional') {
            query = query.eq('profissional_id', profissionalIdFilter);
          }

          const { data: agendamentos, error: queryError } = await query;

          if (queryError) throw queryError;

          // Agrupar dados por profissional
          const profissionaisMap = new Map<
            string,
            {
              nome: string;
              totalConsultas: number;
              comissao: number;
              faturamentoClinica: number;
              consultasComEvolucao: number;
            }
          >();

          agendamentos?.forEach((agendamento) => {
            const profId = agendamento.profissional_id;
            const profNome =
              agendamento.profissional_nome || 'Sem profissional';
            const valor = parseFloat(agendamento.valor_servico || '0');

            if (!profissionaisMap.has(profId)) {
              profissionaisMap.set(profId, {
                nome: profNome,
                totalConsultas: 0,
                comissao: 0,
                faturamentoClinica: 0,
                consultasComEvolucao: 0,
              });
            }

            const prof = profissionaisMap.get(profId)!;

            // Contar apenas consultas finalizadas ou agendadas
            if (
              agendamento.status_consulta_codigo === 'finalizado' ||
              agendamento.status_consulta_codigo === 'agendado'
            ) {
              prof.totalConsultas += 1;
              prof.faturamentoClinica += valor;

              // AI dev note: Comissão basicamente é o valor da consulta
              // Ajuste esta lógica conforme sua política de comissão
              prof.comissao += valor;

              // Contar consultas com evolução (apenas para admin ver)
              if (
                agendamento.status_consulta_codigo === 'finalizado' &&
                agendamento.possui_evolucao === 'sim'
              ) {
                prof.consultasComEvolucao += 1;
              }
            }
          });

          const profissionaisData = Array.from(profissionaisMap.entries())
            .map(([id, data]) => ({
              id,
              ...data,
            }))
            .sort((a, b) => b.faturamentoClinica - a.faturamentoClinica);

          setData(profissionaisData);
        } catch (err) {
          console.error('Erro ao carregar dados de profissionais:', err);
          setError('Não foi possível carregar os dados dos profissionais');
        } finally {
          setIsLoading(false);
        }
      };

      loadData();
    }, [mes, profissionalIdFilter, userRole]);

    if (isLoading) {
      return (
        <Card className={className}>
          <CardHeader>
            <CardTitle>Relatório de Profissionais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      );
    }

    if (error) {
      return (
        <Card className={className}>
          <CardHeader>
            <CardTitle>Relatório de Profissionais</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      );
    }

    // Calcular totais
    const totalConsultas = data.reduce((sum, p) => sum + p.totalConsultas, 0);
    const totalComissoes = data.reduce((sum, p) => sum + p.comissao, 0);
    const totalFaturamento = data.reduce(
      (sum, p) => sum + p.faturamentoClinica,
      0
    );

    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Relatório de Profissionais</CardTitle>
              <CardDescription>
                Comissões e faturamento por profissional
              </CardDescription>
            </div>
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Últimos 12 meses */}
                {Array.from({ length: 12 }, (_, i) => {
                  const date = new Date();
                  date.setMonth(date.getMonth() - i);
                  const mesStr = date.toISOString().slice(0, 7);
                  const label = new Date(mesStr + '-01').toLocaleDateString(
                    'pt-BR',
                    {
                      month: 'long',
                      year: 'numeric',
                    }
                  );
                  return (
                    <SelectItem key={mesStr} value={mesStr}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">
                Total de Consultas
              </div>
              <div className="text-2xl font-bold">{totalConsultas}</div>
            </div>
            {userRole === 'admin' && (
              <div className="text-center p-4 bg-muted/30 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">
                  Total Comissões
                </div>
                <div className="text-2xl font-bold text-verde-pipa">
                  {formatCurrency(totalComissoes)}
                </div>
              </div>
            )}
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <div className="text-sm text-muted-foreground mb-1">
                Faturamento Clínica
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(totalFaturamento)}
              </div>
            </div>
          </div>

          {/* Lista de profissionais */}
          <div className="space-y-2">
            {data.map((prof) => (
              <div key={prof.id} className="border rounded-lg overflow-hidden">
                {/* Header */}
                <button
                  onClick={() =>
                    setExpandedProfissional(
                      expandedProfissional === prof.id ? null : prof.id
                    )
                  }
                  className="w-full p-4 bg-muted/50 hover:bg-muted flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <div className="font-semibold text-base">{prof.nome}</div>
                    <Badge variant="outline" className="text-xs">
                      {prof.totalConsultas} consulta
                      {prof.totalConsultas !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right mr-4">
                      {userRole === 'admin' && (
                        <div className="text-xs text-muted-foreground">
                          Comissão:{' '}
                          <span className="font-bold text-verde-pipa">
                            {formatCurrency(prof.comissao)}
                          </span>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Faturamento:{' '}
                        <span className="font-bold">
                          {formatCurrency(prof.faturamentoClinica)}
                        </span>
                      </div>
                    </div>
                    {expandedProfissional === prof.id ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </div>
                </button>

                {/* Detalhes */}
                {expandedProfissional === prof.id && (
                  <div className="p-4 bg-muted/20 border-t space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Total de Consultas
                        </p>
                        <p className="text-lg font-semibold">
                          {prof.totalConsultas}
                        </p>
                      </div>

                      {/* Admin: Mostrar com evolução */}
                      {userRole === 'admin' && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              Com Evolução
                            </p>
                            <p className="text-lg font-semibold text-amarelo-pipa">
                              {prof.consultasComEvolucao}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              Total Comissões
                            </p>
                            <p className="text-lg font-semibold text-verde-pipa">
                              {formatCurrency(prof.comissao)}
                            </p>
                          </div>
                        </>
                      )}

                      {/* Profissional: Apenas com evolução (comissão) */}
                      {userRole === 'profissional' && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Comissão (com evolução)
                          </p>
                          <p className="text-lg font-semibold text-verde-pipa">
                            {formatCurrency(prof.comissao)}
                          </p>
                        </div>
                      )}

                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Faturamento Clínica
                        </p>
                        <p className="text-lg font-semibold">
                          {formatCurrency(prof.faturamentoClinica)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {data.length === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Nenhum dado disponível para o período selecionado.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);

RelatorioProfissionais.displayName = 'RelatorioProfissionais';
