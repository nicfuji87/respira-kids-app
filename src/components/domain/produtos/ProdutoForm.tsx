import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Package } from 'lucide-react';
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
} from '@/components/primitives';
import { CurrencyInput } from '@/components/primitives';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: Formulário para cadastro e edição de produtos/serviços
// Integrado com categorias contábeis e fornecedores
// Preço de referência é sugestão (pode variar no lançamento)

// AI dev note: Schema de produto SEM fornecedor_padrao_id
// Fornecedor agora é vinculado via tabela produto_fornecedor (N:N)
const produtoSchema = z.object({
  codigo: z
    .string()
    .min(1, 'Código é obrigatório')
    .max(50, 'Código muito longo')
    .regex(/^[A-Z0-9-_]+$/, 'Use apenas letras maiúsculas, números, - e _'),
  nome: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(200),
  descricao: z.string().max(500).optional(),
  unidade_medida: z.string().min(1, 'Unidade de medida é obrigatória'),
  categoria_contabil_id: z.string().uuid().optional().nullable(),
  preco_referencia: z.number().min(0, 'Preço deve ser maior ou igual a zero'),
  ativo: z.boolean().default(true),
});

type ProdutoFormData = z.infer<typeof produtoSchema>;

const UNIDADES_MEDIDA = [
  'unidade',
  'caixa',
  'pacote',
  'kg',
  'g',
  'litro',
  'ml',
  'metro',
  'cm',
  'hora',
  'dia',
  'mês',
];

interface Categoria {
  id: string;
  codigo: string;
  nome: string;
}

interface ProdutoFormProps {
  produto?: {
    id: string;
    codigo: string;
    nome: string;
    descricao: string | null;
    unidade_medida: string;
    categoria_contabil_id: string | null;
    preco_referencia: number;
    ativo: boolean;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const ProdutoForm = React.memo<ProdutoFormProps>(
  ({ produto, onSuccess, onCancel }) => {
    const [isLoading, setIsLoading] = React.useState(false);
    const [categorias, setCategorias] = React.useState<Categoria[]>([]);
    const { user } = useAuth();
    const { toast } = useToast();

    const form = useForm<ProdutoFormData>({
      resolver: zodResolver(produtoSchema),
      defaultValues: {
        codigo: produto?.codigo || '',
        nome: produto?.nome || '',
        descricao: produto?.descricao || '',
        unidade_medida: produto?.unidade_medida || 'unidade',
        categoria_contabil_id: produto?.categoria_contabil_id || null,
        preco_referencia: produto?.preco_referencia || 0,
        ativo: produto?.ativo ?? true,
      },
    });

    // Carregar categorias
    // AI dev note: Fornecedor não é mais vinculado ao produto
    // Agora é gerenciado via tabela produto_fornecedor (N:N)
    React.useEffect(() => {
      const loadData = async () => {
        try {
          const { data } = await supabase
            .from('categorias_contabeis')
            .select('id, codigo, nome')
            .eq('ativo', true)
            .order('codigo');

          if (data) setCategorias(data);
        } catch (error) {
          console.error('Erro ao carregar dados:', error);
        }
      };

      loadData();
    }, []);

    const onSubmit = async (data: ProdutoFormData) => {
      try {
        setIsLoading(true);

        const produtoData = {
          codigo: data.codigo.toUpperCase(),
          nome: data.nome,
          descricao: data.descricao || null,
          unidade_medida: data.unidade_medida,
          categoria_contabil_id: data.categoria_contabil_id || null,
          preco_referencia: data.preco_referencia,
          ativo: data.ativo,
          atualizado_por: user?.pessoa?.id || null,
        };

        if (produto?.id) {
          // Atualizar
          const { error } = await supabase
            .from('produtos_servicos')
            .update(produtoData)
            .eq('id', produto.id);

          if (error) throw error;

          toast({
            title: 'Produto atualizado',
            description: 'Dados do produto foram atualizados com sucesso.',
          });
        } else {
          // Criar
          const { error } = await supabase.from('produtos_servicos').insert({
            ...produtoData,
            criado_por: user?.pessoa?.id || null,
          });

          if (error) {
            if (error.code === '23505') {
              toast({
                variant: 'destructive',
                title: 'Código duplicado',
                description: 'Já existe um produto com este código.',
              });
              return;
            }
            throw error;
          }

          toast({
            title: 'Produto cadastrado',
            description: 'Novo produto foi cadastrado com sucesso.',
          });
        }

        onSuccess?.();
      } catch (error) {
        console.error('Erro ao salvar produto:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao salvar',
          description: 'Ocorreu um erro ao salvar o produto. Tente novamente.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {produto ? 'Editar Produto' : 'Novo Produto'}
          </CardTitle>
          <CardDescription>
            {produto
              ? 'Atualize os dados do produto'
              : 'Cadastre um novo produto para padronizar lançamentos'}
          </CardDescription>
        </CardHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Código */}
                <FormField
                  control={form.control}
                  name="codigo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="LUVA-M"
                          maxLength={50}
                          onChange={(e) =>
                            field.onChange(e.target.value.toUpperCase())
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Código único (ex: LUVA-M, ALCOOL-70)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Unidade de Medida */}
                <FormField
                  control={form.control}
                  name="unidade_medida"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unidade de Medida</FormLabel>
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
                          {UNIDADES_MEDIDA.map((unidade) => (
                            <SelectItem key={unidade} value={unidade}>
                              {unidade}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Nome */}
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Produto/Serviço</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Luva de procedimento M" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Descrição */}
              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        placeholder="Detalhes adicionais sobre o produto..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                {/* Preço de Referência */}
                <FormField
                  control={form.control}
                  name="preco_referencia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preço de Referência</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="R$ 0,00"
                        />
                      </FormControl>
                      <FormDescription>
                        Preço sugerido (pode variar)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Categoria Padrão */}
                <FormField
                  control={form.control}
                  name="categoria_contabil_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria Padrão (Opcional)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value || ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Nenhuma</SelectItem>
                          {categorias.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.codigo} - {cat.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* AI dev note: Fornecedor removido - agora via tabela produto_fornecedor */}
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
                {produto ? 'Atualizar' : 'Cadastrar'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    );
  }
);

ProdutoForm.displayName = 'ProdutoForm';
