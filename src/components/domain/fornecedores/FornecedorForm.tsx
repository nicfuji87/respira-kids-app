import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Building2, User, Loader2 } from 'lucide-react';
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
  RadioGroup,
  RadioGroupItem,
  Textarea,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/primitives';
import { CPFInput, validateCPF } from '@/components/primitives/CPFInput';
import { PhoneInput } from '@/components/primitives/PhoneInput';
import { CepSearch } from '@/components/composed/CepSearch';
import { useToast } from '@/components/primitives/use-toast';
import { supabase } from '@/lib/supabase';
import type { EnderecoViaCepData } from '@/lib/enderecos-api';

// AI dev note: Formulário para cadastro e edição de fornecedores
// Suporta pessoa física (CPF) e jurídica (CNPJ) com validação
// Integração com busca de CEP e validação de documentos

const fornecedorSchema = z
  .object({
    tipo_pessoa: z.enum(['fisica', 'juridica'] as const),
    nome_razao_social: z
      .string()
      .min(3, 'Nome deve ter pelo menos 3 caracteres')
      .max(200, 'Nome muito longo'),
    nome_fantasia: z.string().max(200, 'Nome fantasia muito longo').optional(),
    cpf_cnpj: z.string().min(1, 'CPF/CNPJ é obrigatório'),
    inscricao_estadual: z
      .string()
      .max(50, 'Inscrição estadual muito longa')
      .optional(),
    inscricao_municipal: z
      .string()
      .max(50, 'Inscrição municipal muito longa')
      .optional(),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    telefone: z.string().optional(),
    cep: z.string().optional(),
    numero_endereco: z.string().max(20, 'Número muito longo').optional(),
    complemento_endereco: z
      .string()
      .max(100, 'Complemento muito longo')
      .optional(),
    observacoes: z.string().max(500, 'Observações muito longas').optional(),
    ativo: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.tipo_pessoa === 'fisica') {
        return validateCPF(data.cpf_cnpj);
      } else {
        // Validação básica de CNPJ (14 dígitos)
        const cnpj = data.cpf_cnpj.replace(/\D/g, '');
        return cnpj.length === 14;
      }
    },
    {
      message: 'CPF/CNPJ inválido',
      path: ['cpf_cnpj'],
    }
  );

type FornecedorFormData = z.infer<typeof fornecedorSchema>;

interface FornecedorFormProps {
  fornecedor?: {
    id: string;
    tipo_pessoa: 'fisica' | 'juridica';
    nome_razao_social: string;
    nome_fantasia?: string;
    cpf_cnpj: string;
    inscricao_estadual?: string;
    inscricao_municipal?: string;
    email?: string;
    telefone?: string;
    id_endereco?: string;
    numero_endereco?: string;
    complemento_endereco?: string;
    observacoes?: string;
    ativo: boolean;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const FornecedorForm = React.memo<FornecedorFormProps>(
  ({ fornecedor, onSuccess, onCancel }) => {
    const [isLoading, setIsLoading] = React.useState(false);
    const [enderecoId, setEnderecoId] = React.useState<string | null>(
      fornecedor?.id_endereco || null
    );
    const { toast } = useToast();

    const form = useForm<FornecedorFormData>({
      resolver: zodResolver(fornecedorSchema),
      defaultValues: {
        tipo_pessoa: fornecedor?.tipo_pessoa || 'juridica',
        nome_razao_social: fornecedor?.nome_razao_social || '',
        nome_fantasia: fornecedor?.nome_fantasia || '',
        cpf_cnpj: fornecedor?.cpf_cnpj || '',
        inscricao_estadual: fornecedor?.inscricao_estadual || '',
        inscricao_municipal: fornecedor?.inscricao_municipal || '',
        email: fornecedor?.email || '',
        telefone: fornecedor?.telefone || '',
        numero_endereco: fornecedor?.numero_endereco || '',
        complemento_endereco: fornecedor?.complemento_endereco || '',
        observacoes: fornecedor?.observacoes || '',
        ativo: fornecedor?.ativo ?? true,
      },
    });

    const tipoPessoa = form.watch('tipo_pessoa');

    const handleAddressFound = async (addressData: EnderecoViaCepData) => {
      try {
        // Salvar endereço no banco primeiro
        const { data: endereco, error } = await supabase
          .from('enderecos')
          .insert({
            cep: addressData.cep.replace(/\D/g, ''),
            logradouro: addressData.logradouro,
            bairro: addressData.bairro,
            cidade: addressData.cidade,
            estado: addressData.estado,
          })
          .select()
          .single();

        if (error) throw error;
        if (endereco) {
          setEnderecoId(endereco.id);
        }
      } catch (error) {
        console.error('Erro ao salvar endereço:', error);
      }
    };

    const onSubmit = async (data: FornecedorFormData) => {
      try {
        setIsLoading(true);

        // Limpar telefone se vazio
        const telefoneNumerico = data.telefone?.replace(/\D/g, '') || null;

        const fornecedorData = {
          tipo_pessoa: data.tipo_pessoa,
          nome_razao_social: data.nome_razao_social,
          nome_fantasia: data.nome_fantasia || null,
          cpf_cnpj: data.cpf_cnpj.replace(/\D/g, ''),
          inscricao_estadual: data.inscricao_estadual || null,
          inscricao_municipal: data.inscricao_municipal || null,
          email: data.email || null,
          telefone: telefoneNumerico ? parseInt(telefoneNumerico) : null,
          id_endereco: enderecoId,
          numero_endereco: data.numero_endereco || null,
          complemento_endereco: data.complemento_endereco || null,
          observacoes: data.observacoes || null,
          ativo: data.ativo,
        };

        if (fornecedor?.id) {
          // Atualizar
          const { error } = await supabase
            .from('fornecedores')
            .update(fornecedorData)
            .eq('id', fornecedor.id);

          if (error) throw error;

          toast({
            title: 'Fornecedor atualizado',
            description: 'Dados do fornecedor foram atualizados com sucesso.',
          });
        } else {
          // Criar
          const { error } = await supabase
            .from('fornecedores')
            .insert(fornecedorData);

          if (error) throw error;

          toast({
            title: 'Fornecedor cadastrado',
            description: 'Novo fornecedor foi cadastrado com sucesso.',
          });
        }

        onSuccess?.();
      } catch (error) {
        console.error('Erro ao salvar fornecedor:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao salvar',
          description:
            'Ocorreu um erro ao salvar o fornecedor. Tente novamente.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {fornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'}
          </CardTitle>
          <CardDescription>
            {fornecedor
              ? 'Atualize os dados do fornecedor'
              : 'Preencha os dados para cadastrar um novo fornecedor'}
          </CardDescription>
        </CardHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              {/* Tipo de Pessoa */}
              <FormField
                control={form.control}
                name="tipo_pessoa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Pessoa</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="juridica" id="juridica" />
                          <label
                            htmlFor="juridica"
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Building2 className="h-4 w-4" />
                            Pessoa Jurídica
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="fisica" id="fisica" />
                          <label
                            htmlFor="fisica"
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <User className="h-4 w-4" />
                            Pessoa Física
                          </label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                {/* Nome/Razão Social */}
                <FormField
                  control={form.control}
                  name="nome_razao_social"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>
                        {tipoPessoa === 'fisica'
                          ? 'Nome Completo'
                          : 'Razão Social'}
                      </FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Nome Fantasia (apenas PJ) */}
                {tipoPessoa === 'juridica' && (
                  <FormField
                    control={form.control}
                    name="nome_fantasia"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Nome Fantasia</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormDescription>
                          Nome comercial da empresa (opcional)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* CPF/CNPJ */}
                <FormField
                  control={form.control}
                  name="cpf_cnpj"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {tipoPessoa === 'fisica' ? 'CPF' : 'CNPJ'}
                      </FormLabel>
                      <FormControl>
                        {tipoPessoa === 'fisica' ? (
                          <CPFInput
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="000.000.000-00"
                          />
                        ) : (
                          <Input
                            {...field}
                            placeholder="00.000.000/0000-00"
                            maxLength={18}
                          />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Inscrição Estadual (apenas PJ) */}
                {tipoPessoa === 'juridica' && (
                  <FormField
                    control={form.control}
                    name="inscricao_estadual"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inscrição Estadual</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Inscrição Municipal (apenas PJ) */}
                {tipoPessoa === 'juridica' && (
                  <FormField
                    control={form.control}
                    name="inscricao_municipal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inscrição Municipal</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Email */}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Telefone */}
                <FormField
                  control={form.control}
                  name="telefone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <PhoneInput
                          value={field.value || ''}
                          onChange={field.onChange}
                          placeholder="(00) 00000-0000"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Endereço */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-medium">Endereço (opcional)</h3>

                <FormField
                  control={form.control}
                  name="cep"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CEP</FormLabel>
                      <FormControl>
                        <CepSearch
                          cep={field.value || ''}
                          onCepChange={field.onChange}
                          onAddressFound={handleAddressFound}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="numero_endereco"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="complemento_endereco"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Complemento</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

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
                        placeholder="Informações adicionais sobre o fornecedor..."
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
                {fornecedor ? 'Atualizar' : 'Cadastrar'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    );
  }
);

FornecedorForm.displayName = 'FornecedorForm';
