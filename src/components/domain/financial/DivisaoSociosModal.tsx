import React from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Users,
  Plus,
  Trash2,
  Calculator,
  AlertCircle,
  Check,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Card,
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
} from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';

// AI dev note: Modal para configurar divisão customizada entre sócios
// Permite definir percentuais diferentes para cada lançamento
// Integra com tabela de pessoas para selecionar sócios

const socioSchema = z.object({
  pessoa_id: z.string().uuid(),
  percentual: z
    .number()
    .min(0, 'Percentual não pode ser negativo')
    .max(100, 'Percentual não pode ser maior que 100'),
});

const divisaoSchema = z.object({
  socios: z
    .array(socioSchema)
    .min(1, 'Adicione pelo menos um sócio')
    .refine(
      (socios) => {
        const total = socios.reduce((sum, socio) => sum + socio.percentual, 0);
        return Math.abs(total - 100) < 0.01; // Tolerância para arredondamento
      },
      {
        message: 'A soma dos percentuais deve ser igual a 100%',
      }
    ),
});

type DivisaoFormData = z.infer<typeof divisaoSchema>;

interface Pessoa {
  id: string;
  nome: string;
  email?: string;
  role: string;
}

interface DivisaoSociosModalProps {
  lancamentoId?: string;
  valorTotal: number;
  divisaoAtual?: {
    pessoa_id: string;
    percentual: number;
    valor: number;
  }[];
  onConfirm: (
    divisao: { pessoa_id: string; percentual: number; valor: number }[]
  ) => void;
  trigger?: React.ReactNode;
}

export const DivisaoSociosModal = React.memo<DivisaoSociosModalProps>(
  ({ valorTotal, divisaoAtual, onConfirm, trigger }) => {
    const [open, setOpen] = React.useState(false);
    const [pessoas, setPessoas] = React.useState<Pessoa[]>([]);
    const { toast } = useToast();

    // Carregar configuração padrão se não tiver divisão atual
    const getDefaultDivisao = React.useCallback(async () => {
      try {
        const { data, error } = await supabase
          .from('configuracao_divisao_socios')
          .select('pessoa_id, percentual_divisao')
          .eq('ativo', true)
          .gte('data_fim', new Date().toISOString())
          .lte('data_inicio', new Date().toISOString());

        if (error) throw error;

        if (data && data.length > 0) {
          return data.map((config) => ({
            pessoa_id: config.pessoa_id,
            percentual: config.percentual_divisao,
          }));
        }

        // Se não tiver configuração, dividir igualmente entre profissionais
        const { data: profissionais } = await supabase
          .from('pessoas')
          .select('id')
          .eq('role', 'profissional')
          .eq('ativo', true);

        if (profissionais && profissionais.length > 0) {
          const percentualPorPessoa = 100 / profissionais.length;
          return profissionais.map((p) => ({
            pessoa_id: p.id,
            percentual: percentualPorPessoa,
          }));
        }

        return [];
      } catch (error) {
        console.error('Erro ao buscar configuração padrão:', error);
        return [];
      }
    }, []);

    const form = useForm<DivisaoFormData>({
      resolver: zodResolver(divisaoSchema),
      defaultValues: {
        socios: [],
      },
    });

    const { fields, append, remove } = useFieldArray({
      control: form.control,
      name: 'socios',
    });

    // Carregar pessoas e divisão inicial
    React.useEffect(() => {
      const loadData = async () => {
        try {
          // Carregar pessoas que podem ser sócios (profissionais)
          const { data: pessoasData, error: pessoasError } = await supabase
            .from('pessoas')
            .select('id, nome, email, role')
            .in('role', ['profissional', 'admin'])
            .eq('ativo', true)
            .order('nome');

          if (pessoasError) throw pessoasError;
          setPessoas(pessoasData || []);

          // Definir divisão inicial
          if (divisaoAtual && divisaoAtual.length > 0) {
            form.setValue(
              'socios',
              divisaoAtual.map((d) => ({
                pessoa_id: d.pessoa_id,
                percentual: d.percentual,
              }))
            );
          } else {
            const defaultDivisao = await getDefaultDivisao();
            form.setValue('socios', defaultDivisao);
          }
        } catch (error) {
          console.error('Erro ao carregar dados:', error);
          toast({
            variant: 'destructive',
            title: 'Erro ao carregar dados',
            description:
              'Não foi possível carregar as informações necessárias.',
          });
        }
      };

      if (open) {
        loadData();
      }
    }, [open, divisaoAtual, form, getDefaultDivisao, toast]);

    // Calcular total de percentuais
    const socios = form.watch('socios');
    const totalPercentual = React.useMemo(() => {
      return socios.reduce((sum, socio) => sum + (socio.percentual || 0), 0);
    }, [socios]);

    // Verificar se pessoa já está na lista
    const isPessoaSelecionada = (pessoaId: string, currentIndex: number) => {
      return socios.some(
        (socio, index) => index !== currentIndex && socio.pessoa_id === pessoaId
      );
    };

    // Adicionar novo sócio
    const handleAddSocio = () => {
      // Encontrar primeira pessoa não selecionada
      const pessoaDisponivel = pessoas.find(
        (p) => !socios.some((s) => s.pessoa_id === p.id)
      );

      if (!pessoaDisponivel) {
        toast({
          variant: 'destructive',
          title: 'Limite atingido',
          description: 'Todos os sócios disponíveis já foram adicionados.',
        });
        return;
      }

      // Calcular percentual restante
      const percentualRestante = 100 - totalPercentual;

      append({
        pessoa_id: pessoaDisponivel.id,
        percentual: percentualRestante > 0 ? percentualRestante : 0,
      });
    };

    // Distribuir igualmente
    const handleDistribuirIgualmente = () => {
      if (fields.length === 0) return;

      const percentualPorPessoa = 100 / fields.length;
      fields.forEach((_, index) => {
        form.setValue(`socios.${index}.percentual`, percentualPorPessoa);
      });

      toast({
        title: 'Percentuais distribuídos',
        description:
          'Os percentuais foram distribuídos igualmente entre os sócios.',
      });
    };

    const onSubmit = (data: DivisaoFormData) => {
      const divisaoComValores = data.socios.map((socio) => ({
        ...socio,
        valor: (valorTotal * socio.percentual) / 100,
      }));

      onConfirm(divisaoComValores);
      setOpen(false);

      toast({
        title: 'Divisão configurada',
        description: 'A divisão entre sócios foi aplicada com sucesso.',
      });
    };

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline" size="sm">
              <Users className="mr-2 h-4 w-4" />
              Configurar Divisão
            </Button>
          )}
        </DialogTrigger>

        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Configurar Divisão entre Sócios
            </DialogTitle>
            <DialogDescription>
              Defina como o valor será dividido entre os sócios para este
              lançamento
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Valor Total */}
              <Alert>
                <Calculator className="h-4 w-4" />
                <AlertTitle>Valor Total do Lançamento</AlertTitle>
                <AlertDescription className="mt-2">
                  <span className="text-2xl font-bold">
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    }).format(valorTotal)}
                  </span>
                </AlertDescription>
              </Alert>

              {/* Lista de Sócios */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Sócios e Percentuais</h3>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDistribuirIgualmente}
                      disabled={fields.length === 0}
                    >
                      <Calculator className="mr-2 h-4 w-4" />
                      Dividir Igualmente
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddSocio}
                      disabled={fields.length >= pessoas.length}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Sócio
                    </Button>
                  </div>
                </div>

                {fields.length === 0 ? (
                  <Card className="p-8">
                    <div className="flex flex-col items-center justify-center text-center">
                      <Users className="mb-4 h-12 w-12 text-muted-foreground" />
                      <h4 className="mb-2 text-sm font-medium">
                        Nenhum sócio adicionado
                      </h4>
                      <p className="mb-4 text-sm text-muted-foreground">
                        Adicione sócios para configurar a divisão do valor
                      </p>
                      <Button type="button" size="sm" onClick={handleAddSocio}>
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar Primeiro Sócio
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {fields.map((field, index) => {
                      const socio = form.watch(`socios.${index}`);
                      const valorSocio =
                        (valorTotal * (socio.percentual || 0)) / 100;

                      return (
                        <Card key={field.id} className="p-4">
                          <div className="flex items-start gap-4">
                            <div className="flex-1 grid gap-4 md:grid-cols-2">
                              <FormField
                                control={form.control}
                                name={`socios.${index}.pessoa_id`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Sócio</FormLabel>
                                    <Select
                                      onValueChange={field.onChange}
                                      value={field.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Selecione o sócio" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {pessoas.map((pessoa) => (
                                          <SelectItem
                                            key={pessoa.id}
                                            value={pessoa.id}
                                            disabled={isPessoaSelecionada(
                                              pessoa.id,
                                              index
                                            )}
                                          >
                                            <div className="flex items-center justify-between w-full">
                                              <span>{pessoa.nome}</span>
                                              {isPessoaSelecionada(
                                                pessoa.id,
                                                index
                                              ) && (
                                                <Badge
                                                  variant="secondary"
                                                  className="ml-2"
                                                >
                                                  Já selecionado
                                                </Badge>
                                              )}
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`socios.${index}.percentual`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Percentual (%)</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        {...field}
                                        onChange={(e) =>
                                          field.onChange(
                                            parseFloat(e.target.value) || 0
                                          )
                                        }
                                        min="0"
                                        max="100"
                                        step="0.01"
                                      />
                                    </FormControl>
                                    <FormDescription>
                                      Valor:{' '}
                                      {new Intl.NumberFormat('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                      }).format(valorSocio)}
                                    </FormDescription>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            {fields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => remove(index)}
                                className="mt-8"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Resumo */}
              {fields.length > 0 && (
                <Card
                  className={`p-4 ${Math.abs(totalPercentual - 100) < 0.01 ? 'border-green-600' : 'border-red-600'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {Math.abs(totalPercentual - 100) < 0.01 ? (
                        <Check className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-600" />
                      )}
                      <span className="font-medium">Total dos Percentuais</span>
                    </div>
                    <span
                      className={`text-xl font-bold ${
                        Math.abs(totalPercentual - 100) < 0.01
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {totalPercentual.toFixed(2)}%
                    </span>
                  </div>
                  {Math.abs(totalPercentual - 100) >= 0.01 && (
                    <p className="mt-2 text-sm text-red-600">
                      A soma dos percentuais deve ser igual a 100%
                    </p>
                  )}
                </Card>
              )}

              <FormMessage />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={
                    fields.length === 0 ||
                    Math.abs(totalPercentual - 100) >= 0.01
                  }
                >
                  Confirmar Divisão
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }
);

DivisaoSociosModal.displayName = 'DivisaoSociosModal';
