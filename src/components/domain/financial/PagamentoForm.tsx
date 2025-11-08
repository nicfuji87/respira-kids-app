import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import {
  CreditCard,
  Calendar,
  FileText,
  Loader2,
  Info,
  DollarSign,
  Receipt,
  Building,
} from 'lucide-react';
import {
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
  Badge,
  Separator,
} from '@/components/primitives';
import { CurrencyInput } from '@/components/primitives';
import { DatePicker } from '@/components/composed';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { normalizeSelectValue } from '@/lib/form-utils';

// AI dev note: Formulário para registrar pagamento de contas
// Permite selecionar forma de pagamento, conta bancária e adicionar observações
// Valida o valor do pagamento e atualiza o status da conta

const pagamentoSchema = z.object({
  data_pagamento: z.date(),
  valor_pago: z.number().min(0.01, 'Valor deve ser maior que zero'),
  forma_pagamento_id: z.string().uuid(),
  conta_bancaria_id: z.string().uuid().optional().nullable(),
  numero_documento_pagamento: z.string().max(50).optional(),
  observacoes_pagamento: z.string().max(500).optional(),
});

type PagamentoFormData = z.infer<typeof pagamentoSchema>;

interface ContaPagar {
  id: string;
  lancamento_id: string;
  numero_parcela: number;
  total_parcelas: number;
  valor_parcela: number;
  data_vencimento: string;
  lancamento: {
    tipo_lancamento: 'despesa' | 'receita';
    numero_documento?: string | null;
    descricao: string;
    fornecedor?: {
      nome_razao_social: string;
      nome_fantasia?: string | null;
    } | null;
  };
}

interface FormaPagamento {
  id: string;
  nome: string;
  sigla: string;
  requer_conta_bancaria: boolean;
}

interface ContaBancaria {
  id: string;
  nome_conta: string;
  banco_nome: string;
  agencia?: string;
  conta?: string;
  tipo_conta: string;
  titular_nome: string;
  saldo_atual?: number;
}

interface PagamentoFormProps {
  conta: ContaPagar;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const PagamentoForm = React.memo<PagamentoFormProps>(
  ({ conta, onSuccess, onCancel }) => {
    const [open, setOpen] = React.useState(true);
    const [isLoading, setIsLoading] = React.useState(false);
    const [formasPagamento, setFormasPagamento] = React.useState<
      FormaPagamento[]
    >([]);
    const [contasBancarias, setContasBancarias] = React.useState<
      ContaBancaria[]
    >([]);
    const { user } = useAuth();
    const { toast } = useToast();

    const form = useForm<PagamentoFormData>({
      resolver: zodResolver(pagamentoSchema),
      defaultValues: {
        data_pagamento: new Date(),
        valor_pago: conta.valor_parcela,
        forma_pagamento_id: '',
        conta_bancaria_id: null,
        numero_documento_pagamento: '',
        observacoes_pagamento: '',
      },
    });

    const formaPagamentoSelecionada = formasPagamento.find(
      (f) => f.id === form.watch('forma_pagamento_id')
    );

    // Carregar formas de pagamento e contas bancárias
    React.useEffect(() => {
      const loadData = async () => {
        try {
          // Carregar formas de pagamento
          const { data: formasData, error: formasError } = await supabase
            .from('formas_pagamento')
            .select('*')
            .eq('ativo', true)
            .order('ordem_exibicao')
            .order('nome');

          if (formasError) throw formasError;
          setFormasPagamento(formasData || []);

          // Carregar contas bancárias
          const { data: contasData, error: contasError } = await supabase
            .from('contas_bancarias')
            .select('*')
            .eq('ativo', true)
            .order('nome_conta');

          if (contasError) throw contasError;
          setContasBancarias(contasData || []);

          // Se só tiver uma forma de pagamento, selecionar automaticamente
          if (formasData && formasData.length === 1) {
            form.setValue('forma_pagamento_id', formasData[0].id);
          }

          // Se só tiver uma conta bancária, selecionar automaticamente
          if (contasData && contasData.length === 1) {
            form.setValue('conta_bancaria_id', contasData[0].id);
          }
        } catch (error) {
          console.error('Erro ao carregar dados:', error);
          toast({
            variant: 'destructive',
            title: 'Erro ao carregar dados',
            description: 'Não foi possível carregar as opções de pagamento.',
          });
        }
      };

      loadData();
    }, [form, toast]);

    const onSubmit = async (data: PagamentoFormData) => {
      try {
        setIsLoading(true);

        // Atualizar conta a pagar
        const { error: contaError } = await supabase
          .from('contas_pagar')
          .update({
            status_pagamento: 'pago',
            data_pagamento: format(data.data_pagamento, 'yyyy-MM-dd'),
            valor_pago: data.valor_pago,
            forma_pagamento_id: data.forma_pagamento_id,
            conta_bancaria_id: data.conta_bancaria_id || null,
            numero_documento_pagamento: data.numero_documento_pagamento || null,
            observacoes_pagamento: data.observacoes_pagamento || null,
            pago_por: user?.id,
            atualizado_por: user?.id,
          })
          .eq('id', conta.id);

        if (contaError) throw contaError;

        // Se usar conta bancária, registrar movimentação
        if (data.conta_bancaria_id) {
          const { error: movError } = await supabase
            .from('movimentacoes_bancarias')
            .insert({
              conta_bancaria_id: data.conta_bancaria_id,
              tipo_movimentacao:
                conta.lancamento.tipo_lancamento === 'despesa'
                  ? 'saida'
                  : 'entrada',
              valor: data.valor_pago,
              data_movimentacao: format(data.data_pagamento, 'yyyy-MM-dd'),
              descricao: `Pagamento - ${conta.lancamento.descricao}`,
              conta_pagar_id: conta.id,
              criado_por: user?.id,
            });

          if (movError) throw movError;
        }

        toast({
          title: 'Pagamento registrado',
          description: 'O pagamento foi registrado com sucesso.',
        });

        onSuccess?.();
        setOpen(false);
      } catch (error) {
        console.error('Erro ao registrar pagamento:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao registrar pagamento',
          description:
            'Ocorreu um erro ao registrar o pagamento. Tente novamente.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    const handleClose = () => {
      setOpen(false);
      onCancel?.();
    };

    const diasAtraso = React.useMemo(() => {
      const hoje = new Date();
      const vencimento = new Date(conta.data_vencimento);
      const diffTime = hoje.getTime() - vencimento.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 0;
    }, [conta.data_vencimento]);

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Registrar Pagamento
            </DialogTitle>
            <DialogDescription>
              Registre o pagamento da conta selecionada
            </DialogDescription>
          </DialogHeader>

          {/* Informações da Conta */}
          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tipo:</span>
                  <div className="flex items-center gap-2">
                    {conta.lancamento.tipo_lancamento === 'despesa' ? (
                      <DollarSign className="h-4 w-4 text-red-500" />
                    ) : (
                      <Receipt className="h-4 w-4 text-green-500" />
                    )}
                    <span className="font-medium">
                      {conta.lancamento.tipo_lancamento === 'despesa'
                        ? 'Despesa'
                        : 'Receita'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Descrição:</span>
                  <span className="font-medium text-right line-clamp-2 max-w-[250px]">
                    {conta.lancamento.descricao}
                  </span>
                </div>

                {conta.lancamento.fornecedor && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {conta.lancamento.tipo_lancamento === 'despesa'
                        ? 'Fornecedor:'
                        : 'Cliente:'}
                    </span>
                    <span className="font-medium">
                      {conta.lancamento.fornecedor.nome_fantasia ||
                        conta.lancamento.fornecedor.nome_razao_social}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Parcela:</span>
                  <Badge variant="outline">
                    {conta.numero_parcela} de {conta.total_parcelas}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Vencimento:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {format(new Date(conta.data_vencimento), 'dd/MM/yyyy')}
                    </span>
                    {diasAtraso > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {diasAtraso} dias de atraso
                      </Badge>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <span className="text-base font-medium">
                    Valor da Parcela:
                  </span>
                  <span className="text-lg font-bold">
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    }).format(conta.valor_parcela)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Data do Pagamento */}
                <FormField
                  control={form.control}
                  name="data_pagamento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Data do Pagamento
                        </div>
                      </FormLabel>
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

                {/* Valor Pago */}
                <FormField
                  control={form.control}
                  name="valor_pago"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Valor Pago
                        </div>
                      </FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      {field.value !== conta.valor_parcela && (
                        <FormDescription className="text-orange-600">
                          <Info className="inline h-3 w-3 mr-1" />
                          Valor diferente do valor da parcela
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Forma de Pagamento */}
                <FormField
                  control={form.control}
                  name="forma_pagamento_id"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Forma de Pagamento</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a forma de pagamento" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {formasPagamento.map((forma) => (
                            <SelectItem key={forma.id} value={forma.id}>
                              {forma.nome}
                              {forma.sigla && (
                                <span className="ml-2 text-muted-foreground">
                                  ({forma.sigla})
                                </span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Conta Bancária */}
                {formaPagamentoSelecionada?.requer_conta_bancaria && (
                  <FormField
                    control={form.control}
                    name="conta_bancaria_id"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4" />
                            Conta Bancária
                          </div>
                        </FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(normalizeSelectValue(value))
                          }
                          value={field.value || '__none__'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a conta bancária" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhuma</SelectItem>
                            {contasBancarias.map((conta) => (
                              <SelectItem key={conta.id} value={conta.id}>
                                <div className="flex flex-col">
                                  <span>{conta.nome_conta}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {conta.banco_nome} -{' '}
                                    {conta.tipo_conta === 'conta_corrente'
                                      ? 'CC'
                                      : 'Poup.'}
                                    {conta.agencia &&
                                      conta.conta &&
                                      ` ${conta.agencia}/${conta.conta}`}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Conta bancária utilizada para o pagamento
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Número do Documento */}
                <FormField
                  control={form.control}
                  name="numero_documento_pagamento"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Número do Documento/Comprovante
                        </div>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Ex: Nº do cheque, ID da transação..."
                        />
                      </FormControl>
                      <FormDescription>
                        Opcional: número de referência do pagamento
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Observações */}
              <FormField
                control={form.control}
                name="observacoes_pagamento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="Informações adicionais sobre o pagamento..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isLoading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Registrar Pagamento
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }
);

PagamentoForm.displayName = 'PagamentoForm';
