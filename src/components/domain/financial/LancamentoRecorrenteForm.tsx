import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Loader2,
  Repeat,
  Calendar,
  DollarSign,
  Info,
  CalendarDays,
  Users,
} from 'lucide-react';
import {
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
  Textarea,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  RadioGroup,
  RadioGroupItem,
  Switch,
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/primitives';
import { CurrencyInput } from '@/components/primitives';
import { DatePicker } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { format, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { normalizeSelectValue } from '@/lib/form-utils';

// AI dev note: Formulário para criar lançamentos recorrentes
// Permite configurar despesas fixas que se repetem automaticamente
// Suporta diferentes frequências e ajustes de data

const lancamentoRecorrenteSchema = z.object({
  tipo_lancamento: z.enum(['despesa', 'receita'] as const),
  descricao: z
    .string()
    .min(3, 'Descrição deve ter pelo menos 3 caracteres')
    .max(200),
  valor: z.number().min(0.01, 'Valor deve ser maior que zero'),
  fornecedor_id: z.string().uuid().optional().nullable(),
  categoria_contabil_id: z.string().uuid(),
  frequencia_recorrencia: z.enum([
    'mensal',
    'bimestral',
    'trimestral',
    'semestral',
    'anual',
  ] as const),
  dia_vencimento: z
    .number()
    .int()
    .min(1, 'Dia deve ser entre 1 e 31')
    .max(31, 'Dia deve ser entre 1 e 31'),
  ajustar_fim_semana: z.boolean().default(true),
  data_inicio: z.date(),
  data_fim: z.date().optional().nullable(),
  eh_divisao_socios: z.boolean().default(false),
  ativo: z.boolean().default(true),
  observacoes: z.string().max(500).optional(),
});

type LancamentoRecorrenteFormData = z.infer<typeof lancamentoRecorrenteSchema>;

interface Fornecedor {
  id: string;
  nome_razao_social: string;
  nome_fantasia?: string;
}

interface Categoria {
  id: string;
  codigo: string;
  nome: string;
  nivel: number;
  categoria_pai_id?: string | null;
}

interface LancamentoRecorrenteFormProps {
  lancamento?: {
    id: string;
    tipo_lancamento: 'despesa' | 'receita';
    descricao: string;
    valor: number;
    fornecedor_id?: string | null;
    categoria_contabil_id: string;
    frequencia_recorrencia: string;
    dia_vencimento: number;
    ajustar_fim_semana: boolean;
    data_inicio: Date | string;
    data_fim?: Date | string | null;
    eh_divisao_socios: boolean;
    ativo: boolean;
    observacoes?: string;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const LancamentoRecorrenteForm =
  React.memo<LancamentoRecorrenteFormProps>(
    ({ lancamento, onSuccess, onCancel }) => {
      const [isLoading, setIsLoading] = React.useState(false);
      const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
      const [categorias, setCategorias] = React.useState<Categoria[]>([]);
      const { user } = useAuth();
      const { toast } = useToast();

      const form = useForm<LancamentoRecorrenteFormData>({
        resolver: zodResolver(lancamentoRecorrenteSchema),
        defaultValues: {
          tipo_lancamento: lancamento?.tipo_lancamento || 'despesa',
          descricao: lancamento?.descricao || '',
          valor: lancamento?.valor || 0,
          fornecedor_id: lancamento?.fornecedor_id || null,
          categoria_contabil_id: lancamento?.categoria_contabil_id || '',
          frequencia_recorrencia:
            (lancamento?.frequencia_recorrencia as
              | 'mensal'
              | 'bimestral'
              | 'trimestral'
              | 'semestral'
              | 'anual') || 'mensal',
          dia_vencimento: lancamento?.dia_vencimento || 10,
          ajustar_fim_semana: lancamento?.ajustar_fim_semana ?? true,
          data_inicio: lancamento?.data_inicio
            ? new Date(lancamento.data_inicio)
            : new Date(),
          data_fim: lancamento?.data_fim ? new Date(lancamento.data_fim) : null,
          eh_divisao_socios: lancamento?.eh_divisao_socios || false,
          ativo: lancamento?.ativo ?? true,
          observacoes: lancamento?.observacoes || '',
        },
      });

      const tipoLancamento = form.watch('tipo_lancamento');
      const frequencia = form.watch('frequencia_recorrencia');
      const dataInicio = form.watch('data_inicio');
      const dataFim = form.watch('data_fim');

      // Carregar dados auxiliares
      React.useEffect(() => {
        const loadData = async () => {
          try {
            // Carregar fornecedores
            const { data: fornData, error: fornError } = await supabase
              .from('fornecedores')
              .select('id, nome_razao_social, nome_fantasia')
              .eq('ativo', true)
              .order('nome_razao_social');

            if (fornError) throw fornError;
            setFornecedores(fornData || []);

            // Carregar categorias
            const { data: catData, error: catError } = await supabase
              .from('categorias_contabeis')
              .select('*')
              .eq('ativo', true)
              .order('nivel')
              .order('ordem_exibicao')
              .order('nome');

            if (catError) throw catError;
            setCategorias(catData || []);
          } catch (error) {
            console.error('Erro ao carregar dados:', error);
            toast({
              variant: 'destructive',
              title: 'Erro ao carregar dados',
              description: 'Não foi possível carregar os dados auxiliares.',
            });
          }
        };

        loadData();
      }, [toast]);

      // Organizar categorias hierarquicamente
      const categoriasHierarquicas = React.useMemo(() => {
        const grupos = categorias.filter((c) => c.nivel === 1);
        const classificacoes = categorias.filter((c) => c.nivel === 2);
        const subclassificacoes = categorias.filter((c) => c.nivel === 3);

        return { grupos, classificacoes, subclassificacoes };
      }, [categorias]);

      // Calcular próximas ocorrências
      const proximasOcorrencias = React.useMemo(() => {
        if (!dataInicio) return [];

        const ocorrencias = [];
        let dataAtual = new Date(dataInicio);
        const hoje = new Date();
        const limite = dataFim || addMonths(hoje, 12);

        // Mapear frequência para meses
        const mesesPorFrequencia = {
          mensal: 1,
          bimestral: 2,
          trimestral: 3,
          semestral: 6,
          anual: 12,
        };

        const meses = mesesPorFrequencia[frequencia] || 1;

        // Gerar próximas 5 ocorrências
        for (let i = 0; i < 5; i++) {
          if (dataAtual > limite) break;

          ocorrencias.push(new Date(dataAtual));
          dataAtual = addMonths(dataAtual, meses);
        }

        return ocorrencias;
      }, [dataInicio, dataFim, frequencia]);

      const onSubmit = async (data: LancamentoRecorrenteFormData) => {
        try {
          setIsLoading(true);

          const lancamentoData = {
            tipo_lancamento: data.tipo_lancamento,
            descricao: data.descricao,
            valor: data.valor,
            fornecedor_id: data.fornecedor_id || null,
            categoria_contabil_id: data.categoria_contabil_id,
            frequencia_recorrencia: data.frequencia_recorrencia,
            dia_vencimento: data.dia_vencimento,
            ajustar_fim_semana: data.ajustar_fim_semana,
            data_inicio: format(data.data_inicio, 'yyyy-MM-dd'),
            data_fim: data.data_fim
              ? format(data.data_fim, 'yyyy-MM-dd')
              : null,
            data_proxima_recorrencia: format(data.data_inicio, 'yyyy-MM-dd'),
            eh_divisao_socios: data.eh_divisao_socios,
            ativo: data.ativo,
            observacoes: data.observacoes || null,
            criado_por: user?.id,
            atualizado_por: user?.id,
          };

          if (lancamento?.id) {
            // Atualizar
            const { error } = await supabase
              .from('lancamentos_recorrentes')
              .update(lancamentoData)
              .eq('id', lancamento.id);

            if (error) throw error;

            toast({
              title: 'Lançamento recorrente atualizado',
              description: 'As configurações foram atualizadas com sucesso.',
            });
          } else {
            // Criar
            const { error } = await supabase
              .from('lancamentos_recorrentes')
              .insert(lancamentoData);

            if (error) throw error;

            toast({
              title: 'Lançamento recorrente criado',
              description:
                'O lançamento recorrente foi cadastrado com sucesso.',
            });
          }

          onSuccess?.();
        } catch (error) {
          console.error('Erro ao salvar lançamento recorrente:', error);
          toast({
            variant: 'destructive',
            title: 'Erro ao salvar',
            description: 'Ocorreu um erro ao salvar o lançamento recorrente.',
          });
        } finally {
          setIsLoading(false);
        }
      };

      const getFrequenciaText = (freq: string) => {
        const labels = {
          mensal: 'Mensalmente',
          bimestral: 'A cada 2 meses',
          trimestral: 'A cada 3 meses',
          semestral: 'A cada 6 meses',
          anual: 'Anualmente',
        };
        return labels[freq as keyof typeof labels] || freq;
      };

      return (
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <Repeat className="h-5 w-5" />
                {lancamento
                  ? 'Editar Lançamento Recorrente'
                  : 'Novo Lançamento Recorrente'}
              </div>
            </CardTitle>
            <CardDescription>
              Configure despesas ou receitas que se repetem automaticamente
            </CardDescription>
          </CardHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardContent className="space-y-6">
                {/* Tipo de Lançamento */}
                <FormField
                  control={form.control}
                  name="tipo_lancamento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Lançamento</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="despesa" id="despesa" />
                            <label
                              htmlFor="despesa"
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <DollarSign className="h-4 w-4 text-red-500" />
                              Despesa
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="receita" id="receita" />
                            <label
                              htmlFor="receita"
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <DollarSign className="h-4 w-4 text-green-500" />
                              Receita
                            </label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Descrição e Valor */}
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="descricao"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descrição</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Ex: Aluguel, Energia, Internet..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="valor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor</FormLabel>
                        <FormControl>
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Fornecedor e Categoria */}
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="fornecedor_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {tipoLancamento === 'despesa'
                            ? 'Fornecedor'
                            : 'Cliente'}{' '}
                          (opcional)
                        </FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(normalizeSelectValue(value))
                          }
                          value={field.value || '__none__'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhum</SelectItem>
                            {fornecedores.map((fornecedor) => (
                              <SelectItem
                                key={fornecedor.id}
                                value={fornecedor.id}
                              >
                                {fornecedor.nome_fantasia ||
                                  fornecedor.nome_razao_social}
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
                    name="categoria_contabil_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoria Contábil</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a categoria" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categoriasHierarquicas.grupos.map((grupo) => (
                              <React.Fragment key={grupo.id}>
                                <SelectItem
                                  value={grupo.id}
                                  className="font-semibold"
                                >
                                  {grupo.nome}
                                </SelectItem>
                                {categoriasHierarquicas.classificacoes
                                  .filter(
                                    (c) => c.categoria_pai_id === grupo.id
                                  )
                                  .map((classif) => (
                                    <React.Fragment key={classif.id}>
                                      <SelectItem
                                        value={classif.id}
                                        className="pl-6"
                                      >
                                        {classif.nome}
                                      </SelectItem>
                                      {categoriasHierarquicas.subclassificacoes
                                        .filter(
                                          (s) =>
                                            s.categoria_pai_id === classif.id
                                        )
                                        .map((sub) => (
                                          <SelectItem
                                            key={sub.id}
                                            value={sub.id}
                                            className="pl-12"
                                          >
                                            {sub.nome}
                                          </SelectItem>
                                        ))}
                                    </React.Fragment>
                                  ))}
                              </React.Fragment>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Configuração de Recorrência */}
                <Card className="border-primary/20">
                  <CardHeader className="pb-4">
                    <h3 className="text-base font-medium flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      Configuração de Recorrência
                    </h3>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <FormField
                        control={form.control}
                        name="frequencia_recorrencia"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Frequência</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="mensal">Mensal</SelectItem>
                                <SelectItem value="bimestral">
                                  Bimestral
                                </SelectItem>
                                <SelectItem value="trimestral">
                                  Trimestral
                                </SelectItem>
                                <SelectItem value="semestral">
                                  Semestral
                                </SelectItem>
                                <SelectItem value="anual">Anual</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="dia_vencimento"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dia do Vencimento</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) =>
                                  field.onChange(parseInt(e.target.value) || 1)
                                }
                                min={1}
                                max={31}
                              />
                            </FormControl>
                            <FormDescription>Entre 1 e 31</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="ajustar_fim_semana"
                        render={({ field }) => (
                          <FormItem className="flex flex-col justify-end">
                            <div className="flex items-center space-x-2">
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <FormLabel className="cursor-pointer">
                                Ajustar para dia útil
                              </FormLabel>
                            </div>
                            <FormDescription>
                              Se cair no fim de semana
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="data_inicio"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Data de Início
                              </div>
                            </FormLabel>
                            <FormControl>
                              <DatePicker
                                value={
                                  field.value
                                    ? format(field.value, 'yyyy-MM-dd')
                                    : ''
                                }
                                onChange={(date) =>
                                  field.onChange(
                                    date ? new Date(date) : undefined
                                  )
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="data_fim"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                Data de Término (opcional)
                              </div>
                            </FormLabel>
                            <FormControl>
                              <DatePicker
                                value={
                                  field.value
                                    ? format(field.value, 'yyyy-MM-dd')
                                    : ''
                                }
                                onChange={(date) =>
                                  field.onChange(date ? new Date(date) : null)
                                }
                              />
                            </FormControl>
                            <FormDescription>
                              Deixe vazio para continuar indefinidamente
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Preview das próximas ocorrências */}
                {proximasOcorrencias.length > 0 && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Próximas Ocorrências</AlertTitle>
                    <AlertDescription className="mt-2">
                      <p className="mb-2">
                        Este lançamento será gerado{' '}
                        {getFrequenciaText(frequencia).toLowerCase()} no dia{' '}
                        {form.watch('dia_vencimento')}:
                      </p>
                      <ul className="space-y-1">
                        {proximasOcorrencias.map((data, index) => (
                          <li
                            key={index}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Calendar className="h-3 w-3" />
                            {format(data, "dd 'de' MMMM 'de' yyyy", {
                              locale: ptBR,
                            })}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Divisão entre Sócios */}
                <FormField
                  control={form.control}
                  name="eh_divisao_socios"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          <FormLabel className="text-base">
                            Dividir entre Sócios
                          </FormLabel>
                        </div>
                        <FormDescription>
                          {tipoLancamento === 'despesa'
                            ? 'Esta despesa será dividida entre os sócios'
                            : 'Esta receita será dividida entre os sócios'}
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

                {/* Status Ativo */}
                {lancamento && (
                  <FormField
                    control={form.control}
                    name="ativo"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Lançamento Ativo
                          </FormLabel>
                          <FormDescription>
                            Desative para pausar a geração automática
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
                )}

                {/* Observações */}
                <FormField
                  control={form.control}
                  name="observacoes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={3}
                          placeholder="Informações adicionais sobre o lançamento recorrente..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>

              <CardFooter className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isLoading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {lancamento ? 'Atualizar' : 'Cadastrar'}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      );
    }
  );

LancamentoRecorrenteForm.displayName = 'LancamentoRecorrenteForm';
