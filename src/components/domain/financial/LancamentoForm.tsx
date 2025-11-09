import React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Loader2,
  Plus,
  Trash2,
  Receipt,
  DollarSign,
  Calendar,
  FileUp,
  Users,
  Package,
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
  Badge,
  Separator,
} from '@/components/primitives';
import { CurrencyInput } from '@/components/primitives';
import { DatePicker } from '@/components/composed';
import { FileUpload } from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { normalizeSelectValue } from '@/lib/form-utils';
import {
  ProdutoSelect,
  type ProdutoData,
} from '@/components/composed/ProdutoSelect';

// AI dev note: Formulário completo para lançamentos financeiros
// Suporta múltiplos itens, divisão entre sócios, parcelas e upload de documentos
// Integração com fornecedores e categorias cadastradas

const itemSchema = z.object({
  produto_id: z.string().uuid().optional().nullable(), // AI dev note: Opcional - se NULL, usa descrição livre
  descricao: z.string().min(3, 'Descrição deve ter pelo menos 3 caracteres'),
  quantidade: z.number().min(0.001, 'Quantidade deve ser maior que zero'),
  valor_unitario: z.number().min(0, 'Valor deve ser maior ou igual a zero'),
  valor_total: z.number(),
  categoria_contabil_id: z.string().uuid().optional(),
  observacoes: z.string().max(500).optional(),
});

const lancamentoSchema = z.object({
  tipo_lancamento: z.enum(['despesa', 'receita'] as const),
  numero_documento: z.string().max(50).optional(),
  data_emissao: z.date(),
  data_competencia: z.date(),
  fornecedor_id: z.string().uuid().optional().nullable(),
  categoria_contabil_id: z.string().uuid(),
  descricao: z
    .string()
    .min(3, 'Descrição deve ter pelo menos 3 caracteres')
    .max(200),
  observacoes: z.string().max(500).optional(),
  valor_total: z.number().min(0, 'Valor deve ser maior ou igual a zero'),
  quantidade_parcelas: z.number().int().min(1).max(48).default(1),
  eh_divisao_socios: z.boolean().default(false),
  pessoa_responsavel_id: z.string().uuid().optional().nullable(),
  arquivo: z.any().optional(),
  empresa_fatura: z.string().uuid().optional().nullable(),
  itens: z.array(itemSchema).min(1, 'Adicione pelo menos um item'),
});

type LancamentoFormData = z.infer<typeof lancamentoSchema>;

interface Fornecedor {
  id: string;
  nome_razao_social: string;
  nome_fantasia?: string;
  cpf_cnpj: string;
}

interface Categoria {
  id: string;
  codigo: string;
  nome: string;
  nivel: number;
  categoria_pai_id?: string | null;
}

interface Empresa {
  id: string;
  nome_fantasia: string;
  razao_social: string;
}

interface LancamentoFormProps {
  lancamento?: {
    id: string;
    tipo_lancamento: 'despesa' | 'receita';
    numero_documento?: string;
    data_emissao: Date | string;
    data_competencia: Date | string;
    fornecedor_id?: string | null;
    categoria_contabil_id: string;
    descricao: string;
    observacoes?: string;
    valor_total: number;
    quantidade_parcelas: number;
    eh_divisao_socios: boolean;
    pessoa_responsavel_id?: string | null;
    arquivo_url?: string;
    empresa_fatura?: string | null;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const LancamentoForm = React.memo<LancamentoFormProps>(
  ({ lancamento, onSuccess, onCancel }) => {
    const [isLoading, setIsLoading] = React.useState(false);
    const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
    const [categorias, setCategorias] = React.useState<Categoria[]>([]);
    const [empresas, setEmpresas] = React.useState<Empresa[]>([]);
    const [socios, setSocios] = React.useState<{ id: string; nome: string }[]>(
      []
    );
    const [uploadedFileUrl, setUploadedFileUrl] = React.useState<string | null>(
      lancamento?.arquivo_url || null
    );
    const { user } = useAuth();
    const { toast } = useToast();

    const form = useForm<LancamentoFormData>({
      resolver: zodResolver(lancamentoSchema),
      defaultValues: {
        tipo_lancamento: lancamento?.tipo_lancamento || 'despesa',
        numero_documento: lancamento?.numero_documento || '',
        data_emissao: lancamento?.data_emissao
          ? new Date(lancamento.data_emissao)
          : new Date(),
        data_competencia: lancamento?.data_competencia
          ? new Date(lancamento.data_competencia)
          : new Date(),
        fornecedor_id: lancamento?.fornecedor_id || null,
        categoria_contabil_id: lancamento?.categoria_contabil_id || '',
        descricao: lancamento?.descricao || '',
        observacoes: lancamento?.observacoes || '',
        valor_total: lancamento?.valor_total || 0,
        quantidade_parcelas: lancamento?.quantidade_parcelas || 1,
        eh_divisao_socios: lancamento?.eh_divisao_socios || false,
        pessoa_responsavel_id: lancamento?.pessoa_responsavel_id || null,
        empresa_fatura: lancamento?.empresa_fatura || null,
        itens: [
          {
            produto_id: null,
            descricao: '',
            quantidade: 1,
            valor_unitario: 0,
            valor_total: 0,
            categoria_contabil_id: undefined,
            observacoes: '',
          },
        ],
      },
    });

    const { fields, append, remove } = useFieldArray({
      control: form.control,
      name: 'itens',
    });

    const tipoLancamento = form.watch('tipo_lancamento');
    const ehDivisaoSocios = form.watch('eh_divisao_socios');
    const itens = form.watch('itens');

    // Carregar dados auxiliares
    React.useEffect(() => {
      const loadData = async () => {
        try {
          // Carregar fornecedores
          const { data: fornData, error: fornError } = await supabase
            .from('fornecedores')
            .select('id, nome_razao_social, nome_fantasia, cpf_cnpj')
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

          // Carregar empresas para faturamento
          const { data: empData, error: empError } = await supabase
            .from('pessoa_empresas')
            .select('id, nome_fantasia, razao_social')
            .eq('ativo', true)
            .order('razao_social');

          if (empError) throw empError;
          setEmpresas(empData || []);

          // Carregar sócios (admin e profissionais)
          const { data: sociosData, error: sociosError } = await supabase
            .from('pessoas')
            .select('id, nome')
            .in('role', ['admin', 'profissional'])
            .eq('ativo', true)
            .order('nome');

          if (sociosError) throw sociosError;
          setSocios(sociosData || []);
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

    // Carregar itens se editando
    React.useEffect(() => {
      if (lancamento?.id) {
        const loadItens = async () => {
          try {
            const { data, error } = await supabase
              .from('lancamento_itens')
              .select('*')
              .eq('lancamento_id', lancamento.id)
              .order('item_numero');

            if (error) throw error;

            if (data && data.length > 0) {
              form.setValue(
                'itens',
                data.map((item) => ({
                  descricao: item.descricao,
                  quantidade: Number(item.quantidade),
                  valor_unitario: Number(item.valor_unitario),
                  valor_total: Number(item.valor_total),
                  categoria_contabil_id:
                    item.categoria_contabil_id || undefined,
                  observacoes: item.observacoes || '',
                }))
              );
            }
          } catch (error) {
            console.error('Erro ao carregar itens:', error);
          }
        };

        loadItens();
      }
    }, [lancamento?.id, form]);

    // Calcular total geral
    React.useEffect(() => {
      const total = itens.reduce(
        (sum, item) => sum + (item.valor_total || 0),
        0
      );
      form.setValue('valor_total', total);
    }, [itens, form]);

    // Atualizar valor total do item quando quantidade ou valor unitário mudar
    const updateItemTotal = (index: number) => {
      const item = form.getValues(`itens.${index}`);
      const total = item.quantidade * item.valor_unitario;
      form.setValue(`itens.${index}.valor_total`, total);
    };

    // Organizar categorias hierarquicamente
    const categoriasHierarquicas = React.useMemo(() => {
      const grupos = categorias.filter((c) => c.nivel === 1);
      const classificacoes = categorias.filter((c) => c.nivel === 2);
      const subclassificacoes = categorias.filter((c) => c.nivel === 3);

      return { grupos, classificacoes, subclassificacoes };
    }, [categorias]);

    const handleFileUpload = async (file: File) => {
      try {
        // Upload para o bucket de documentos financeiros
        const fileExt = file.name.split('.').pop();
        const fileName = `${user?.id}/${Date.now()}.${fileExt}`;
        const filePath = `financial-documents/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('respira-documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Obter URL pública
        const { data: urlData } = supabase.storage
          .from('respira-documents')
          .getPublicUrl(filePath);

        setUploadedFileUrl(urlData.publicUrl);

        toast({
          title: 'Arquivo enviado',
          description: 'Documento anexado com sucesso.',
        });
      } catch (error) {
        console.error('Erro ao fazer upload:', error);
        toast({
          variant: 'destructive',
          title: 'Erro no upload',
          description: 'Não foi possível enviar o arquivo.',
        });
      }
    };

    const onSubmit = async (data: LancamentoFormData) => {
      try {
        setIsLoading(true);

        const lancamentoData = {
          tipo_lancamento: data.tipo_lancamento,
          numero_documento: data.numero_documento || null,
          data_emissao: format(data.data_emissao, 'yyyy-MM-dd'),
          data_competencia: format(data.data_competencia, 'yyyy-MM-dd'),
          fornecedor_id: data.fornecedor_id || null,
          categoria_contabil_id: data.categoria_contabil_id,
          descricao: data.descricao,
          observacoes: data.observacoes || null,
          valor_total: data.valor_total,
          quantidade_parcelas: data.quantidade_parcelas,
          eh_divisao_socios: data.eh_divisao_socios,
          pessoa_responsavel_id: data.eh_divisao_socios
            ? null
            : data.pessoa_responsavel_id || null,
          status_lancamento: 'validado',
          origem_lancamento: 'manual',
          arquivo_url: uploadedFileUrl,
          empresa_fatura: data.empresa_fatura || null,
          criado_por: user?.pessoa?.id || null,
          atualizado_por: user?.pessoa?.id || null,
        };

        if (lancamento?.id) {
          // Atualizar
          const { error } = await supabase
            .from('lancamentos_financeiros')
            .update(lancamentoData)
            .eq('id', lancamento.id);

          if (error) throw error;

          // Remover itens antigos
          await supabase
            .from('lancamento_itens')
            .delete()
            .eq('lancamento_id', lancamento.id);

          // Inserir novos itens
          const itensData = data.itens.map((item, index) => ({
            lancamento_id: lancamento.id,
            item_numero: index + 1,
            produto_id: item.produto_id || null,
            descricao: item.descricao,
            quantidade: item.quantidade,
            valor_unitario: item.valor_unitario,
            valor_total: item.valor_total,
            categoria_contabil_id: item.categoria_contabil_id || null,
            observacoes: item.observacoes || null,
          }));

          const { error: itensError } = await supabase
            .from('lancamento_itens')
            .insert(itensData);

          if (itensError) throw itensError;

          toast({
            title: 'Lançamento atualizado',
            description: 'Dados do lançamento foram atualizados com sucesso.',
          });
        } else {
          // Criar
          const { data: newLancamento, error } = await supabase
            .from('lancamentos_financeiros')
            .insert(lancamentoData)
            .select()
            .single();

          if (error) throw error;

          // Inserir itens
          const itensData = data.itens.map((item, index) => ({
            lancamento_id: newLancamento.id,
            item_numero: index + 1,
            produto_id: item.produto_id || null,
            descricao: item.descricao,
            quantidade: item.quantidade,
            valor_unitario: item.valor_unitario,
            valor_total: item.valor_total,
            categoria_contabil_id: item.categoria_contabil_id || null,
            observacoes: item.observacoes || null,
          }));

          const { error: itensError } = await supabase
            .from('lancamento_itens')
            .insert(itensData);

          if (itensError) throw itensError;

          // Criar divisão de valores
          if (data.eh_divisao_socios) {
            // Divisão entre sócios - buscar configuração ativa
            const { data: divisaoConfig, error: divisaoError } = await supabase
              .from('configuracao_divisao_socios')
              .select('*')
              .eq('ativo', true);

            if (divisaoError) throw divisaoError;

            if (divisaoConfig && divisaoConfig.length > 0) {
              const divisaoData = divisaoConfig.map((config) => ({
                lancamento_id: newLancamento.id,
                pessoa_id: config.pessoa_id,
                percentual: config.percentual_divisao,
                valor:
                  (data.valor_total * Number(config.percentual_divisao)) / 100,
              }));

              const { error: divisaoInsertError } = await supabase
                .from('lancamento_divisao_socios')
                .insert(divisaoData);

              if (divisaoInsertError) throw divisaoInsertError;
            }
          } else if (data.pessoa_responsavel_id) {
            // Lançamento individual - criar divisão com 100% para uma pessoa
            const { error: divisaoError } = await supabase
              .from('lancamento_divisao_socios')
              .insert({
                lancamento_id: newLancamento.id,
                pessoa_id: data.pessoa_responsavel_id,
                percentual: 100,
                valor: data.valor_total,
              });

            if (divisaoError) throw divisaoError;
          }

          // Criar contas a pagar (uma para cada parcela)
          const contasPagarData = [];
          const valorParcela = data.valor_total / data.quantidade_parcelas;

          for (let i = 0; i < data.quantidade_parcelas; i++) {
            const vencimento = new Date(data.data_emissao);
            vencimento.setMonth(vencimento.getMonth() + i);

            contasPagarData.push({
              lancamento_id: newLancamento.id,
              numero_parcela: i + 1,
              total_parcelas: data.quantidade_parcelas,
              valor_parcela: valorParcela,
              data_vencimento: format(vencimento, 'yyyy-MM-dd'),
              status_pagamento: 'pendente',
            });
          }

          const { error: contasError } = await supabase
            .from('contas_pagar')
            .insert(contasPagarData);

          if (contasError) throw contasError;

          toast({
            title: 'Lançamento criado',
            description: `${data.tipo_lancamento === 'despesa' ? 'Despesa' : 'Receita'} foi cadastrada com sucesso.`,
          });
        }

        onSuccess?.();
      } catch (error) {
        console.error('Erro ao salvar lançamento:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao salvar',
          description:
            'Ocorreu um erro ao salvar o lançamento. Tente novamente.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {lancamento ? 'Editar Lançamento' : 'Novo Lançamento'}
          </CardTitle>
          <CardDescription>
            {lancamento
              ? 'Atualize os dados do lançamento financeiro'
              : 'Preencha os dados para cadastrar um novo lançamento'}
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
                            <Receipt className="h-4 w-4 text-green-500" />
                            Receita
                          </label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                {/* Número do Documento */}
                <FormField
                  control={form.control}
                  name="numero_documento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número do Documento</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="NF-e, recibo, etc." />
                      </FormControl>
                      <FormDescription>
                        Número da nota fiscal ou documento
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Fornecedor */}
                <FormField
                  control={form.control}
                  name="fornecedor_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {tipoLancamento === 'despesa'
                          ? 'Fornecedor'
                          : 'Cliente'}
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

                {/* Data de Emissão */}
                <FormField
                  control={form.control}
                  name="data_emissao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Data de Emissão
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

                {/* Data de Competência */}
                <FormField
                  control={form.control}
                  name="data_competencia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Data de Competência
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
                      <FormDescription>Mês/ano de referência</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Descrição */}
              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Descrição do lançamento" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Categoria Principal */}
              <FormField
                control={form.control}
                name="categoria_contabil_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria Contábil Principal</FormLabel>
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
                              .filter((c) => c.categoria_pai_id === grupo.id)
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
                                      (s) => s.categoria_pai_id === classif.id
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

              {/* Itens do Lançamento */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Itens do Lançamento
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({
                        produto_id: null,
                        descricao: '',
                        quantidade: 1,
                        valor_unitario: 0,
                        valor_total: 0,
                        categoria_contabil_id: undefined,
                        observacoes: '',
                      })
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Item
                  </Button>
                </div>

                {fields.map((field, index) => (
                  <Card key={field.id} className="p-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">
                          Item {index + 1}
                        </h4>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        {/* Produto Select - Híbrido */}
                        <div className="md:col-span-2">
                          <FormLabel>Produto/Serviço</FormLabel>
                          <ProdutoSelect
                            value={form.watch(`itens.${index}.descricao`)}
                            onSelect={(produtoData: ProdutoData) => {
                              form.setValue(
                                `itens.${index}.produto_id`,
                                produtoData.produto_id || null
                              );
                              form.setValue(
                                `itens.${index}.descricao`,
                                produtoData.descricao
                              );
                              form.setValue(
                                `itens.${index}.quantidade`,
                                produtoData.quantidade
                              );
                              form.setValue(
                                `itens.${index}.valor_unitario`,
                                produtoData.valor_unitario
                              );
                              if (produtoData.categoria_contabil_id) {
                                form.setValue(
                                  `itens.${index}.categoria_contabil_id`,
                                  produtoData.categoria_contabil_id
                                );
                              }
                              updateItemTotal(index);
                            }}
                            placeholder="Buscar produto ou digitar descrição livre..."
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            💡 Busque no catálogo ou digite livremente
                          </p>
                        </div>

                        <FormField
                          control={form.control}
                          name={`itens.${index}.descricao`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Descrição (editável)</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`itens.${index}.quantidade`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Quantidade</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) => {
                                    field.onChange(
                                      parseFloat(e.target.value) || 0
                                    );
                                    updateItemTotal(index);
                                  }}
                                  min="0.001"
                                  step="0.001"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`itens.${index}.valor_unitario`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Valor Unitário</FormLabel>
                              <FormControl>
                                <CurrencyInput
                                  value={field.value}
                                  onChange={(value) => {
                                    field.onChange(value || 0);
                                    updateItemTotal(index);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`itens.${index}.valor_total`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Valor Total</FormLabel>
                              <FormControl>
                                <CurrencyInput
                                  value={field.value}
                                  onChange={() => {}}
                                  disabled
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`itens.${index}.categoria_contabil_id`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>
                                Categoria do Item (opcional)
                              </FormLabel>
                              <Select
                                onValueChange={(value) => {
                                  const normalized =
                                    normalizeSelectValue(value);
                                  field.onChange(normalized);
                                }}
                                value={field.value || '__use_main__'}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Usar categoria principal" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="__use_main__">
                                    Usar categoria principal
                                  </SelectItem>
                                  {categoriasHierarquicas.classificacoes.map(
                                    (cat) => (
                                      <SelectItem key={cat.id} value={cat.id}>
                                        {cat.nome}
                                      </SelectItem>
                                    )
                                  )}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Deixe vazio para usar a categoria principal
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <Separator />

              {/* Valor Total */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-medium">Valor Total</span>
                  <span className="text-2xl font-bold">
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    }).format(form.watch('valor_total') || 0)}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Parcelas */}
                <FormField
                  control={form.control}
                  name="quantidade_parcelas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de Parcelas</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value) || 1)
                          }
                          min={1}
                          max={48}
                        />
                      </FormControl>
                      <FormDescription>
                        Valor por parcela:{' '}
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(
                          (form.watch('valor_total') || 0) / field.value
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Empresa para Faturamento */}
                <FormField
                  control={form.control}
                  name="empresa_fatura"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Empresa para Faturamento</FormLabel>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(normalizeSelectValue(value))
                        }
                        value={field.value || '__none__'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a empresa" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhuma</SelectItem>
                          {empresas.map((empresa) => (
                            <SelectItem key={empresa.id} value={empresa.id}>
                              {empresa.razao_social}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Para emissão de nota fiscal
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                          ? 'Esta despesa será dividida entre os sócios conforme percentuais configurados'
                          : 'Esta receita será dividida entre os sócios conforme percentuais configurados'}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          // Limpar pessoa_responsavel_id ao ativar divisão
                          if (checked) {
                            form.setValue('pessoa_responsavel_id', null);
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Pessoa Responsável - aparece quando NÃO é divisão */}
              {!ehDivisaoSocios && (
                <FormField
                  control={form.control}
                  name="pessoa_responsavel_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Responsável pelo Pagamento
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
                            <SelectValue placeholder="Selecione o responsável" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Selecione...</SelectItem>
                          {socios.map((socio) => (
                            <SelectItem key={socio.id} value={socio.id}>
                              {socio.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Pessoa que ficará responsável por este{' '}
                        {tipoLancamento === 'despesa'
                          ? 'pagamento'
                          : 'recebimento'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Upload de Documento */}
              <FormField
                control={form.control}
                name="arquivo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <div className="flex items-center gap-2">
                        <FileUp className="h-4 w-4" />
                        Documento Anexo
                      </div>
                    </FormLabel>
                    <FormControl>
                      <FileUpload
                        onFileSelect={(file) => {
                          if (file) {
                            field.onChange(file);
                            handleFileUpload(file);
                          }
                        }}
                        accept=".pdf,.jpg,.jpeg,.png"
                        maxSize={5 * 1024 * 1024} // 5MB
                      />
                    </FormControl>
                    <FormDescription>PDF, JPG ou PNG até 5MB</FormDescription>
                    {uploadedFileUrl && (
                      <div className="mt-2">
                        <Badge variant="secondary">Arquivo anexado</Badge>
                      </div>
                    )}
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
                        placeholder="Informações adicionais sobre o lançamento..."
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
                {lancamento ? 'Atualizar' : 'Cadastrar'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    );
  }
);

LancamentoForm.displayName = 'LancamentoForm';
