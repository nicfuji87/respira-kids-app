import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Building, User } from 'lucide-react';
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
} from '@/components/primitives';
import { CurrencyInput } from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: Formulário para cadastro e edição de contas bancárias
// Suporta contas de pessoas (sócios) ou da clínica
// Integração com lista de bancos brasileiros

const contaBancariaSchema = z.object({
  pessoa_id: z.string().uuid().optional().nullable(),
  tipo_conta: z.enum(['corrente', 'poupanca', 'investimento'] as const),
  banco_codigo: z.string().min(1, 'Selecione um banco'),
  banco_nome: z.string().min(1, 'Nome do banco é obrigatório'),
  agencia: z
    .string()
    .min(1, 'Agência é obrigatória')
    .regex(
      /^\d+(-\d)?$/,
      'Formato inválido. Use apenas números ou formato 0000-0'
    ),
  conta: z
    .string()
    .min(1, 'Conta é obrigatória')
    .regex(/^\d+$/, 'Use apenas números'),
  digito: z
    .string()
    .min(1, 'Dígito é obrigatório')
    .max(2, 'Dígito muito longo'),
  titular: z
    .string()
    .min(3, 'Nome do titular deve ter pelo menos 3 caracteres')
    .max(200, 'Nome muito longo'),
  saldo_inicial: z.number().default(0),
  observacoes: z.string().max(500, 'Observações muito longas').optional(),
  ativo: z.boolean().default(true),
});

type ContaBancariaFormData = z.infer<typeof contaBancariaSchema>;

// Lista de principais bancos brasileiros
const BANCOS = [
  { codigo: '001', nome: 'Banco do Brasil' },
  { codigo: '033', nome: 'Santander' },
  { codigo: '104', nome: 'Caixa Econômica Federal' },
  { codigo: '237', nome: 'Bradesco' },
  { codigo: '341', nome: 'Itaú' },
  { codigo: '356', nome: 'Banco Real' },
  { codigo: '422', nome: 'Banco Safra' },
  { codigo: '745', nome: 'Citibank' },
  { codigo: '077', nome: 'Banco Inter' },
  { codigo: '260', nome: 'Nubank' },
  { codigo: '212', nome: 'Banco Original' },
  { codigo: '290', nome: 'PagBank' },
  { codigo: '323', nome: 'Mercado Pago' },
  { codigo: '336', nome: 'C6 Bank' },
  { codigo: '633', nome: 'Banco Rendimento' },
];

interface Pessoa {
  id: string;
  nome: string;
  cpf_cnpj: string;
}

interface ContaBancariaFormProps {
  conta?: {
    id: string;
    pessoa_id?: string | null;
    tipo_conta: 'corrente' | 'poupanca' | 'investimento';
    banco_codigo: string;
    banco_nome: string;
    agencia: string;
    conta: string;
    digito: string;
    titular: string;
    saldo_inicial: number;
    observacoes?: string;
    ativo: boolean;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const ContaBancariaForm = React.memo<ContaBancariaFormProps>(
  ({ conta, onSuccess, onCancel }) => {
    const [isLoading, setIsLoading] = React.useState(false);
    const [pessoas, setPessoas] = React.useState<Pessoa[]>([]);
    const [tipoTitular, setTipoTitular] = React.useState<'clinica' | 'pessoa'>(
      conta?.pessoa_id ? 'pessoa' : 'clinica'
    );
    const { user } = useAuth();
    const { toast } = useToast();

    const form = useForm<ContaBancariaFormData>({
      resolver: zodResolver(contaBancariaSchema),
      defaultValues: {
        pessoa_id: conta?.pessoa_id || null,
        tipo_conta: conta?.tipo_conta || 'corrente',
        banco_codigo: conta?.banco_codigo || '',
        banco_nome: conta?.banco_nome || '',
        agencia: conta?.agencia || '',
        conta: conta?.conta || '',
        digito: conta?.digito || '',
        titular: conta?.titular || '',
        saldo_inicial: conta?.saldo_inicial || 0,
        observacoes: conta?.observacoes || '',
        ativo: conta?.ativo ?? true,
      },
    });

    const bancoCodigo = form.watch('banco_codigo');

    // Atualizar nome do banco quando código mudar
    React.useEffect(() => {
      const banco = BANCOS.find((b) => b.codigo === bancoCodigo);
      if (banco) {
        form.setValue('banco_nome', banco.nome);
      }
    }, [bancoCodigo, form]);

    // Carregar pessoas (possíveis titulares)
    React.useEffect(() => {
      const loadPessoas = async () => {
        try {
          const { data, error } = await supabase
            .from('pessoas')
            .select('id, nome, cpf_cnpj')
            .in('role', ['admin', 'profissional'])
            .eq('ativo', true)
            .order('nome');

          if (error) throw error;

          setPessoas(data || []);
        } catch (error) {
          console.error('Erro ao carregar pessoas:', error);
          toast({
            variant: 'destructive',
            title: 'Erro ao carregar pessoas',
            description: 'Não foi possível carregar a lista de pessoas.',
          });
        }
      };

      loadPessoas();
    }, [toast]);

    const onSubmit = async (data: ContaBancariaFormData) => {
      try {
        setIsLoading(true);

        const contaData = {
          pessoa_id: tipoTitular === 'pessoa' ? data.pessoa_id : null,
          tipo_conta: data.tipo_conta,
          banco_codigo: data.banco_codigo,
          banco_nome: data.banco_nome,
          agencia: data.agencia,
          conta: data.conta,
          digito: data.digito,
          titular: data.titular,
          saldo_inicial: data.saldo_inicial,
          observacoes: data.observacoes || null,
          ativo: data.ativo,
          criado_por: user?.id,
          atualizado_por: user?.id,
        };

        if (conta?.id) {
          // Atualizar
          const { error } = await supabase
            .from('contas_bancarias')
            .update(contaData)
            .eq('id', conta.id);

          if (error) throw error;

          toast({
            title: 'Conta atualizada',
            description:
              'Dados da conta bancária foram atualizados com sucesso.',
          });
        } else {
          // Criar
          const { error } = await supabase
            .from('contas_bancarias')
            .insert(contaData);

          if (error) throw error;

          toast({
            title: 'Conta cadastrada',
            description: 'Nova conta bancária foi cadastrada com sucesso.',
          });
        }

        onSuccess?.();
      } catch (error) {
        console.error('Erro ao salvar conta:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao salvar',
          description:
            'Ocorreu um erro ao salvar a conta bancária. Tente novamente.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {conta ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}
          </CardTitle>
          <CardDescription>
            {conta
              ? 'Atualize os dados da conta bancária'
              : 'Preencha os dados para cadastrar uma nova conta bancária'}
          </CardDescription>
        </CardHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              {/* Tipo de Titular */}
              {!conta && (
                <div>
                  <div className="mb-2 text-sm font-medium">
                    Titular da Conta
                  </div>
                  <RadioGroup
                    value={tipoTitular}
                    onValueChange={(value) => {
                      setTipoTitular(value as 'clinica' | 'pessoa');
                      if (value === 'clinica') {
                        form.setValue('pessoa_id', null);
                      }
                    }}
                  >
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="clinica" id="clinica" />
                        <label
                          htmlFor="clinica"
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Building className="h-4 w-4" />
                          Conta da Clínica
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="pessoa" id="pessoa" />
                        <label
                          htmlFor="pessoa"
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <User className="h-4 w-4" />
                          Conta de Sócio
                        </label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {/* Seleção de Pessoa */}
              {tipoTitular === 'pessoa' && (
                <FormField
                  control={form.control}
                  name="pessoa_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sócio Titular</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value || ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o sócio" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {pessoas.map((pessoa) => (
                            <SelectItem key={pessoa.id} value={pessoa.id}>
                              {pessoa.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {/* Banco */}
                <FormField
                  control={form.control}
                  name="banco_codigo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Banco</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o banco" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BANCOS.map((banco) => (
                            <SelectItem key={banco.codigo} value={banco.codigo}>
                              {banco.codigo} - {banco.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tipo de Conta */}
                <FormField
                  control={form.control}
                  name="tipo_conta"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Conta</FormLabel>
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
                          <SelectItem value="corrente">
                            Conta Corrente
                          </SelectItem>
                          <SelectItem value="poupanca">
                            Conta Poupança
                          </SelectItem>
                          <SelectItem value="investimento">
                            Conta Investimento
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Agência */}
                <FormField
                  control={form.control}
                  name="agencia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agência</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="0000" maxLength={6} />
                      </FormControl>
                      <FormDescription>
                        Número da agência (com ou sem dígito)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Conta e Dígito */}
                <div className="grid grid-cols-3 gap-2">
                  <FormField
                    control={form.control}
                    name="conta"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Conta</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="00000"
                            maxLength={20}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="digito"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dígito</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="0"
                            maxLength={2}
                            className="text-center"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Titular */}
              <FormField
                control={form.control}
                name="titular"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Titular</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Nome completo do titular"
                      />
                    </FormControl>
                    <FormDescription>
                      Nome como aparece no banco
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Saldo Inicial */}
              <FormField
                control={form.control}
                name="saldo_inicial"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Saldo Inicial</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="R$ 0,00"
                      />
                    </FormControl>
                    <FormDescription>
                      Saldo inicial para controle interno
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                        placeholder="Informações adicionais sobre a conta..."
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
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {conta ? 'Atualizar' : 'Cadastrar'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    );
  }
);

ContaBancariaForm.displayName = 'ContaBancariaForm';
