import React from 'react';
import { format } from 'date-fns';
import {
  Users,
  Plus,
  Edit,
  Trash2,
  UserCheck,
  UserX,
  Calendar,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Switch,
  Alert,
  AlertDescription,
} from '@/components/primitives';
import { DatePicker } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// AI dev note: Componente para gerenciar configuração de divisão de custos entre sócios
// Permite adicionar, editar e remover sócios da divisão padrão
// Controla percentuais, status e período de vigência

interface ConfiguracaoSocio {
  id: string;
  pessoa_id: string;
  pessoa: {
    nome: string;
    email?: string;
  };
  percentual_divisao: number;
  ativo: boolean;
  data_inicio: string;
  data_fim?: string | null;
  created_at: string;
}

const socioSchema = z.object({
  pessoa_id: z.string().uuid({ message: 'Selecione um sócio' }),
  percentual_divisao: z
    .number()
    .min(0.01, 'Percentual deve ser maior que 0')
    .max(100, 'Percentual não pode ser maior que 100'),
  ativo: z.boolean().default(true),
  data_inicio: z.date(),
  data_fim: z.date().nullable().optional(),
});

type SocioFormData = z.infer<typeof socioSchema>;

interface ConfiguracaoDivisaoSociosProps {
  className?: string;
}

export const ConfiguracaoDivisaoSocios =
  React.memo<ConfiguracaoDivisaoSociosProps>(({ className }) => {
    const [configuracoes, setConfiguracoes] = React.useState<
      ConfiguracaoSocio[]
    >([]);
    const [pessoas, setPessoas] = React.useState<
      { id: string; nome: string; email?: string }[]
    >([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [showForm, setShowForm] = React.useState(false);
    const [editingSocio, setEditingSocio] =
      React.useState<ConfiguracaoSocio | null>(null);
    const { toast } = useToast();

    const form = useForm<SocioFormData>({
      resolver: zodResolver(socioSchema),
      defaultValues: {
        pessoa_id: '',
        percentual_divisao: 50,
        ativo: true,
        data_inicio: new Date(),
        data_fim: null,
      },
    });

    // Carregar configurações
    const loadConfiguracoes = React.useCallback(async () => {
      try {
        setIsLoading(true);

        const { data, error } = await supabase
          .from('configuracao_divisao_socios')
          .select(
            `
            *,
            pessoa:pessoa_id (
              nome,
              email
            )
          `
          )
          .order('ativo', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) throw error;
        setConfiguracoes(data || []);
      } catch (error) {
        console.error('Erro ao carregar configurações:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar',
          description: 'Não foi possível carregar as configurações de divisão.',
        });
      } finally {
        setIsLoading(false);
      }
    }, [toast]);

    // Carregar pessoas (admin e profissionais que podem ser sócios)
    const loadPessoas = React.useCallback(async () => {
      try {
        const { data, error } = await supabase
          .from('pessoas')
          .select('id, nome, email')
          .in('role', ['admin', 'profissional'])
          .eq('ativo', true)
          .order('nome');

        if (error) throw error;
        setPessoas(data || []);
      } catch (error) {
        console.error('Erro ao carregar pessoas:', error);
      }
    }, []);

    React.useEffect(() => {
      loadConfiguracoes();
      loadPessoas();
    }, [loadConfiguracoes, loadPessoas]);

    // Calcular total de percentuais ativos
    const totalPercentualAtivo = React.useMemo(() => {
      return configuracoes
        .filter((c) => c.ativo)
        .reduce((sum, c) => sum + Number(c.percentual_divisao), 0);
    }, [configuracoes]);

    // Abrir formulário para novo sócio
    const handleNovo = () => {
      form.reset({
        pessoa_id: '',
        percentual_divisao: 50,
        ativo: true,
        data_inicio: new Date(),
        data_fim: null,
      });
      setEditingSocio(null);
      setShowForm(true);
    };

    // Abrir formulário para editar
    const handleEditar = (config: ConfiguracaoSocio) => {
      form.reset({
        pessoa_id: config.pessoa_id,
        percentual_divisao: Number(config.percentual_divisao),
        ativo: config.ativo,
        data_inicio: new Date(config.data_inicio),
        data_fim: config.data_fim ? new Date(config.data_fim) : null,
      });
      setEditingSocio(config);
      setShowForm(true);
    };

    // Salvar configuração
    const handleSalvar = async (data: SocioFormData) => {
      try {
        const payload = {
          pessoa_id: data.pessoa_id,
          percentual_divisao: data.percentual_divisao,
          ativo: data.ativo,
          data_inicio: format(data.data_inicio, 'yyyy-MM-dd'),
          data_fim: data.data_fim ? format(data.data_fim, 'yyyy-MM-dd') : null,
        };

        if (editingSocio) {
          // Atualizar
          const { error } = await supabase
            .from('configuracao_divisao_socios')
            .update(payload)
            .eq('id', editingSocio.id);

          if (error) throw error;

          toast({
            title: 'Configuração atualizada',
            description: 'A configuração do sócio foi atualizada com sucesso.',
          });
        } else {
          // Criar novo
          const { error } = await supabase
            .from('configuracao_divisao_socios')
            .insert(payload);

          if (error) throw error;

          toast({
            title: 'Sócio adicionado',
            description: 'O sócio foi adicionado à divisão de custos.',
          });
        }

        setShowForm(false);
        setEditingSocio(null);
        loadConfiguracoes();
      } catch (error) {
        console.error('Erro ao salvar:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao salvar',
          description:
            'Não foi possível salvar a configuração. Tente novamente.',
        });
      }
    };

    // Ativar/desativar sócio
    const handleToggleAtivo = async (config: ConfiguracaoSocio) => {
      try {
        const { error } = await supabase
          .from('configuracao_divisao_socios')
          .update({
            ativo: !config.ativo,
            data_fim: !config.ativo ? null : format(new Date(), 'yyyy-MM-dd'),
          })
          .eq('id', config.id);

        if (error) throw error;

        toast({
          title: config.ativo ? 'Sócio desativado' : 'Sócio ativado',
          description: `${config.pessoa.nome} foi ${config.ativo ? 'removido' : 'adicionado'} da divisão de custos.`,
        });

        loadConfiguracoes();
      } catch (error) {
        console.error('Erro ao alterar status:', error);
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não foi possível alterar o status do sócio.',
        });
      }
    };

    // Excluir configuração
    const handleExcluir = async (config: ConfiguracaoSocio) => {
      if (
        !confirm(
          `Deseja realmente excluir ${config.pessoa.nome} da divisão de custos?`
        )
      ) {
        return;
      }

      try {
        const { error } = await supabase
          .from('configuracao_divisao_socios')
          .delete()
          .eq('id', config.id);

        if (error) throw error;

        toast({
          title: 'Configuração excluída',
          description: 'A configuração foi removida com sucesso.',
        });

        loadConfiguracoes();
      } catch (error) {
        console.error('Erro ao excluir:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao excluir',
          description: 'Não foi possível excluir a configuração.',
        });
      }
    };

    return (
      <div className={className}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Configuração de Divisão de Custos
                </CardTitle>
                <CardDescription>
                  Gerencie os sócios que participam da divisão de custos da
                  clínica
                </CardDescription>
              </div>
              <Button onClick={handleNovo}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Sócio
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Alerta de validação de percentual */}
            {totalPercentualAtivo !== 100 &&
              configuracoes.some((c) => c.ativo) && (
                <Alert
                  variant={
                    totalPercentualAtivo > 100 ? 'destructive' : 'default'
                  }
                >
                  <AlertDescription>
                    {totalPercentualAtivo > 100 ? (
                      <>
                        ⚠️ O total de percentuais ativos é{' '}
                        <strong>{totalPercentualAtivo}%</strong>, mas deveria
                        ser 100%.
                      </>
                    ) : totalPercentualAtivo < 100 ? (
                      <>
                        ℹ️ O total de percentuais ativos é{' '}
                        <strong>{totalPercentualAtivo}%</strong>. Faltam{' '}
                        <strong>{100 - totalPercentualAtivo}%</strong> para
                        completar 100%.
                      </>
                    ) : null}
                  </AlertDescription>
                </Alert>
              )}

            {/* Tabela de configurações */}
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando configurações...
              </div>
            ) : configuracoes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum sócio configurado</p>
                <p className="text-sm">
                  Clique em "Adicionar Sócio" para começar
                </p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sócio</TableHead>
                      <TableHead>Percentual</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {configuracoes.map((config) => (
                      <TableRow key={config.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {config.pessoa.nome}
                            </div>
                            {config.pessoa.email && (
                              <div className="text-sm text-muted-foreground">
                                {config.pessoa.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">
                            {config.percentual_divisao}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={config.ativo ? 'default' : 'secondary'}
                          >
                            {config.ativo ? (
                              <>
                                <UserCheck className="mr-1 h-3 w-3" />
                                Ativo
                              </>
                            ) : (
                              <>
                                <UserX className="mr-1 h-3 w-3" />
                                Inativo
                              </>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(
                                new Date(config.data_inicio),
                                'dd/MM/yyyy'
                              )}
                            </div>
                            {config.data_fim && (
                              <div className="text-muted-foreground">
                                até{' '}
                                {format(
                                  new Date(config.data_fim),
                                  'dd/MM/yyyy'
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditar(config)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleAtivo(config)}
                            >
                              {config.ativo ? (
                                <UserX className="h-4 w-4" />
                              ) : (
                                <UserCheck className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleExcluir(config)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog de formulário */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingSocio ? 'Editar Sócio' : 'Adicionar Sócio'}
              </DialogTitle>
              <DialogDescription>
                Configure a participação do sócio na divisão de custos
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSalvar)}
                className="space-y-4"
              >
                {/* Sócio */}
                <FormField
                  control={form.control}
                  name="pessoa_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sócio/Profissional</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          disabled={!!editingSocio}
                        >
                          <option value="">Selecione...</option>
                          {pessoas.map((pessoa) => (
                            <option key={pessoa.id} value={pessoa.id}>
                              {pessoa.nome}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Percentual */}
                <FormField
                  control={form.control}
                  name="percentual_divisao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Percentual de Divisão (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Percentual que este sócio assume nos custos divididos
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Data Início */}
                <FormField
                  control={form.control}
                  name="data_inicio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Início</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={
                            field.value ? format(field.value, 'yyyy-MM-dd') : ''
                          }
                          onChange={(date) =>
                            field.onChange(date ? new Date(date) : undefined)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Data Fim */}
                <FormField
                  control={form.control}
                  name="data_fim"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Fim (Opcional)</FormLabel>
                      <FormControl>
                        <DatePicker
                          value={
                            field.value ? format(field.value, 'yyyy-MM-dd') : ''
                          }
                          onChange={(date) =>
                            field.onChange(date ? new Date(date) : null)
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Deixe em branco se não houver data fim definida
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Ativo */}
                <FormField
                  control={form.control}
                  name="ativo"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Ativo</FormLabel>
                        <FormDescription>
                          Participar da divisão de custos atualmente
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingSocio ? 'Atualizar' : 'Adicionar'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    );
  });

ConfiguracaoDivisaoSocios.displayName = 'ConfiguracaoDivisaoSocios';
