import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Save, X, AlertCircle, CheckCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/primitives/form';
import { Input } from '@/components/primitives/input';
import { Button } from '@/components/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { useCompany } from '@/hooks/useCompany';
import { useToast } from '@/components/primitives/use-toast';
import { REGIMES_TRIBUTARIOS } from '@/types/company';
import { formatCnpj, formatInscricaoEstadual } from '@/lib/utils';
import type { CompanyFormData } from '@/types/company';

// AI dev note: CompanyForm combina primitives para formulário de empresa
// Segue padrão estabelecido no ProfileFormFields.tsx

const companyFormSchema = z.object({
  razao_social: z.string().min(1, 'Razão social é obrigatória'),
  nome_fantasia: z.string().optional(),
  cnpj: z.string().min(14, 'CNPJ deve ter pelo menos 14 caracteres'),
  inscricao_estadual: z.string().optional(),
  regime_tributario: z.enum([
    'simples_nacional',
    'lucro_presumido',
    'lucro_real',
  ]),
  api_token_externo: z.string().optional(),
});

export interface CompanyFormProps {
  className?: string;
}

export const CompanyForm = React.memo<CompanyFormProps>(({ className }) => {
  const {
    company,
    isLoading,
    error,
    loadCompany,
    createNewCompany,
    updateExistingCompany,
    removeAssociation,
    validateToken,
    createInAsaas,
    clearError,
  } = useCompany();

  const { toast } = useToast();
  const [tokenValidation, setTokenValidation] = useState<{
    isValid: boolean;
    message?: string;
  } | null>(null);
  const [isValidatingToken, setIsValidatingToken] = useState(false);

  const form = useForm<CompanyFormData>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      razao_social: '',
      nome_fantasia: undefined,
      cnpj: '',
      inscricao_estadual: undefined,
      regime_tributario: 'simples_nacional',
      api_token_externo: undefined,
    },
  });

  // Carregar dados da empresa ao montar o componente
  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  // Preencher formulário quando empresa é carregada
  useEffect(() => {
    if (company) {
      form.reset({
        razao_social: company.razao_social,
        nome_fantasia: company.nome_fantasia || '',
        cnpj: company.cnpj,
        inscricao_estadual: company.inscricao_estadual || '',
        regime_tributario: company.regime_tributario,
        // AI dev note: Mascarar token existente para segurança - nunca exibir token real no frontend
        api_token_externo: company.api_token_externo ? '**********' : '',
      });
    }
  }, [company, form]);

  // Validação de token em tempo real
  const handleTokenValidation = async (token: string) => {
    if (!token.trim() || token.trim() === '**********') {
      setTokenValidation(null);
      return;
    }

    setIsValidatingToken(true);
    try {
      const result = await validateToken(token);
      setTokenValidation(result);
    } catch {
      setTokenValidation({ isValid: false, message: 'Erro na validação' });
    } finally {
      setIsValidatingToken(false);
    }
  };

  const onSubmit = async (data: CompanyFormData) => {
    try {
      clearError();

      // Converter campos vazios em null
      const formattedData = {
        ...data,
        nome_fantasia: data.nome_fantasia?.trim() || null,
        inscricao_estadual: data.inscricao_estadual?.trim() || null,
        // AI dev note: Se token é mascarado, não enviar (manter o existente no backend)
        api_token_externo:
          data.api_token_externo?.trim() === '**********'
            ? undefined // Não alterar token existente
            : data.api_token_externo?.trim() || null,
      };

      if (company) {
        await updateExistingCompany(formattedData);
        toast({
          title: 'Empresa atualizada',
          description: 'Os dados da empresa foram atualizados com sucesso.',
        });
      } else {
        await createNewCompany(formattedData);
        toast({
          title: 'Empresa cadastrada',
          description: 'A empresa foi cadastrada e associada ao seu perfil.',
        });
      }
    } catch (error) {
      toast({
        title: 'Erro',
        description:
          error instanceof Error ? error.message : 'Erro ao salvar empresa',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveAssociation = async () => {
    try {
      await removeAssociation();
      form.reset();
      setTokenValidation(null);
      toast({
        title: 'Empresa desassociada',
        description: 'A empresa foi desassociada do seu perfil.',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description:
          error instanceof Error
            ? error.message
            : 'Erro ao desassociar empresa',
        variant: 'destructive',
      });
    }
  };

  const handleCreateInAsaas = async () => {
    if (!company || !company.api_token_externo) {
      toast({
        title: 'Erro',
        description: 'Token do Asaas não encontrado',
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await createInAsaas(company.api_token_externo, {
        razao_social: company.razao_social,
        nome_fantasia: company.nome_fantasia,
        cnpj: company.cnpj,
        inscricao_estadual: company.inscricao_estadual,
        regime_tributario: company.regime_tributario,
        api_token_externo: company.api_token_externo,
      });

      if (result.success) {
        toast({
          title: 'Sucesso',
          description: result.message,
        });
      } else {
        toast({
          title: 'Erro',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Erro',
        description: 'Erro inesperado ao criar empresa no Asaas',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {company ? 'Dados da Empresa' : 'Cadastrar Empresa'}
          </CardTitle>
          <CardDescription>
            {company
              ? 'Gerencie os dados fiscais e token de integração da sua empresa.'
              : 'Cadastre sua empresa para emissão de notas fiscais e integrações.'}
          </CardDescription>
        </CardHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="razao_social"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Razão Social *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Nome empresarial oficial"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nome_fantasia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Fantasia</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Nome comercial"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cnpj"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNPJ *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="00.000.000/0000-00"
                          disabled={isLoading}
                          {...field}
                          onChange={(e) => {
                            const formatted = formatCnpj(e.target.value);
                            field.onChange(formatted);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="regime_tributario"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Regime Tributário</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={isLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o regime" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REGIMES_TRIBUTARIOS.map((regime) => (
                            <SelectItem key={regime.value} value={regime.value}>
                              {regime.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="inscricao_estadual"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Inscrição Estadual</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="000.000.000.000"
                          disabled={isLoading}
                          {...field}
                          onChange={(e) => {
                            const formatted = formatInscricaoEstadual(
                              e.target.value
                            );
                            field.onChange(formatted);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="api_token_externo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Token API Asaas</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="Token para integração com Asaas"
                          disabled={isLoading}
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            handleTokenValidation(e.target.value);
                          }}
                        />
                        {isValidatingToken && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                          </div>
                        )}
                        {!isValidatingToken && tokenValidation !== null && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            {tokenValidation.isValid ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-destructive" />
                            )}
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                    {tokenValidation && !tokenValidation.isValid && (
                      <p className="text-sm text-destructive">
                        {tokenValidation.message || 'Token inválido'}
                      </p>
                    )}
                    {tokenValidation && tokenValidation.isValid && (
                      <p className="text-sm text-green-600">
                        {tokenValidation.message || 'Token válido e ativo'}
                      </p>
                    )}
                  </FormItem>
                )}
              />
            </CardContent>

            <CardFooter className="flex justify-between">
              <div className="flex gap-2">
                {company && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRemoveAssociation}
                    disabled={isLoading}
                    className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Desassociar Empresa
                  </Button>
                )}
                {company &&
                  company.api_token_externo &&
                  tokenValidation?.isValid && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCreateInAsaas}
                      disabled={isLoading}
                    >
                      <Building2 className="h-4 w-4 mr-2" />
                      Criar no Asaas
                    </Button>
                  )}
              </div>
              <Button type="submit" disabled={isLoading}>
                <Save className="h-4 w-4 mr-2" />
                {isLoading
                  ? 'Salvando...'
                  : company
                    ? 'Atualizar'
                    : 'Cadastrar'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
});

CompanyForm.displayName = 'CompanyForm';
