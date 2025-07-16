import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Loader2 } from 'lucide-react';

import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/primitives/form';
import { AvatarUpload } from '@/components/composed/AvatarUpload';
import { ProfileFormFields } from '@/components/composed/ProfileFormFields';
import { DatePicker } from '@/components/composed/DatePicker';
import { useToast } from '@/components/primitives/use-toast';
import { cn } from '@/lib/utils';
import {
  validateCPF,
  formatCPF,
  formatCEP,
  formatPhone,
  getAddressByCep,
} from '@/lib/profile';
import type { ProfileData } from '@/lib/profile-api';
import type { UserRole } from '@/lib/navigation';
import { User, FileText, Phone, MapPin, Hash, Home } from 'lucide-react';

// AI dev note: EditProfileForm domain combina múltiplos composed components
// Reutiliza validação do CompleteProfileForm + campos extras do ProfileFormFields

const editProfileSchema = z.object({
  nome: z
    .string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres'),
  cpf_cnpj: z
    .string()
    .optional()
    .refine((cpf) => !cpf || validateCPF(cpf), 'CPF inválido'),
  telefone: z
    .string()
    .optional()
    .refine(
      (tel) => !tel || /^\(\d{2}\) \d{4,5}-\d{4}$/.test(tel),
      'Telefone deve estar no formato (XX) XXXXX-XXXX'
    ),
  data_nascimento: z
    .string()
    .optional()
    .refine((date) => {
      if (!date) return true;
      const birthDate = new Date(date);
      const today = new Date();
      return birthDate <= today;
    }, 'Data de nascimento inválida'),
  cep: z
    .string()
    .optional()
    .refine(
      (cep) => !cep || /^\d{5}-\d{3}$/.test(cep),
      'CEP deve estar no formato 12345-678'
    ),
  numero_endereco: z.string().optional(),
  complemento_endereco: z.string().optional(),
  // Campos profissionais
  registro_profissional: z.string().optional(),
  especialidade: z.string().optional(),
  bio_profissional: z
    .string()
    .optional()
    .refine(
      (bio) => !bio || bio.length <= 500,
      'Bio deve ter no máximo 500 caracteres'
    ),
  role: z.enum(['admin', 'profissional', 'secretaria']).optional(),
});

type EditProfileFormData = z.infer<typeof editProfileSchema>;

interface AddressInfo {
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface EditProfileFormProps {
  initialData?: ProfileData;
  onSubmit: (data: EditProfileFormData, avatarFile?: File) => Promise<void>;
  onAvatarUpload?: (file: File) => Promise<string>;
  onAvatarRemove?: () => Promise<void>;
  isLoading?: boolean;
  userRole?: UserRole;
  showAllFields?: boolean; // Admin pode editar todos os campos
  className?: string;
}

export const EditProfileForm = React.memo<EditProfileFormProps>(
  ({
    initialData,
    onSubmit,
    onAvatarUpload: _onAvatarUpload, // eslint-disable-line @typescript-eslint/no-unused-vars
    onAvatarRemove,
    isLoading = false,
    userRole,
    showAllFields = false,
    className,
  }) => {
    const [addressInfo, setAddressInfo] = useState<AddressInfo | null>(null);
    const [loadingCep, setLoadingCep] = useState(false);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarError, setAvatarError] = useState<string>('');
    const { toast } = useToast();

    // Preparar dados iniciais
    const getInitialValues = useCallback((): Partial<EditProfileFormData> => {
      if (!initialData) return {};

      return {
        nome: initialData.nome || '',
        cpf_cnpj: initialData.cpf_cnpj || '',
        telefone: initialData.telefone
          ? formatPhone(initialData.telefone.toString())
          : '',
        data_nascimento: initialData.data_nascimento || '',
        cep: initialData.endereco?.cep || '',
        numero_endereco: initialData.numero_endereco || '',
        complemento_endereco: initialData.complemento_endereco || '',
        registro_profissional: initialData.registro_profissional || '',
        especialidade: initialData.especialidade || '',
        bio_profissional: initialData.bio_profissional || '',
        role: (initialData.role as EditProfileFormData['role']) || undefined,
      };
    }, [initialData]);

    const form = useForm<EditProfileFormData>({
      resolver: zodResolver(editProfileSchema),
      defaultValues: getInitialValues(),
    });

    // Atualizar form quando dados iniciais mudarem
    useEffect(() => {
      form.reset(getInitialValues());
    }, [getInitialValues, form]);

    // Carregar endereço inicial se existir
    useEffect(() => {
      if (initialData?.endereco) {
        setAddressInfo({
          logradouro: initialData.endereco.logradouro,
          bairro: initialData.endereco.bairro,
          cidade: initialData.endereco.cidade,
          estado: initialData.endereco.estado,
        });
      }
    }, [initialData]);

    // Buscar endereço quando CEP for preenchido
    const handleCepChange = async (cep: string) => {
      const cleanCep = cep.replace(/\D/g, '');

      if (cleanCep.length === 8) {
        setLoadingCep(true);
        try {
          const address = await getAddressByCep(cleanCep);
          if (address) {
            setAddressInfo({
              logradouro: address.logradouro,
              bairro: address.bairro,
              cidade: address.cidade,
              estado: address.estado,
            });
          }
        } catch (error) {
          console.error('Erro ao buscar CEP:', error);
          setAddressInfo(null);
          toast({
            title: 'CEP não encontrado',
            description: 'Verifique se o CEP está correto',
            variant: 'destructive',
          });
        } finally {
          setLoadingCep(false);
        }
      } else {
        setAddressInfo(null);
      }
    };

    const handleAvatarSelect = async (file: File | null) => {
      setAvatarError('');

      if (!file) {
        setAvatarFile(null);
        return;
      }

      // Validação de arquivo
      if (file.size > 2 * 1024 * 1024) {
        setAvatarError('Arquivo muito grande. Máximo 2MB');
        return;
      }

      if (!file.type.startsWith('image/')) {
        setAvatarError('Apenas imagens são permitidas');
        return;
      }

      setAvatarFile(file);
    };

    const handleSubmit = async (data: EditProfileFormData) => {
      try {
        await onSubmit(data, avatarFile || undefined);

        toast({
          title: 'Perfil atualizado',
          description: 'Suas informações foram atualizadas com sucesso',
          variant: 'default',
        });
      } catch (error) {
        console.error('Erro ao atualizar perfil:', error);

        toast({
          title: 'Erro ao atualizar',
          description:
            error instanceof Error ? error.message : 'Tente novamente',
          variant: 'destructive',
        });
      }
    };

    return (
      <div className={cn('space-y-6', className)}>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6"
            aria-label="Formulário de edição de perfil"
          >
            {/* Avatar Upload */}
            <div className="flex justify-center">
              <AvatarUpload
                value={avatarFile || initialData?.foto_perfil || null}
                onFileSelect={handleAvatarSelect}
                onRemove={onAvatarRemove}
                disabled={isLoading}
                size="xl"
                fallbackText={initialData?.nome}
                error={avatarError}
              />
            </div>

            {/* Dados Básicos */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Dados Pessoais</h3>

              {/* Nome Completo */}
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-medium">
                      Nome Completo *
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          {...field}
                          placeholder="Seu nome completo"
                          disabled={isLoading}
                          className="pl-10 h-12 theme-transition"
                          aria-describedby="nome-error"
                        />
                      </div>
                    </FormControl>
                    <FormMessage id="nome-error" />
                  </FormItem>
                )}
              />

              {/* CPF */}
              <FormField
                control={form.control}
                name="cpf_cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-medium">
                      CPF
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <FileText
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          {...field}
                          placeholder="000.000.000-00"
                          disabled={isLoading}
                          className="pl-10 h-12 theme-transition"
                          onChange={(e) => {
                            const formatted = formatCPF(e.target.value);
                            field.onChange(formatted);
                          }}
                          value={field.value || ''}
                          aria-describedby="cpf-error"
                        />
                      </div>
                    </FormControl>
                    <FormMessage id="cpf-error" />
                  </FormItem>
                )}
              />

              {/* Telefone */}
              <FormField
                control={form.control}
                name="telefone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-medium">
                      Telefone/WhatsApp
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          {...field}
                          placeholder="(11) 99999-9999"
                          disabled={isLoading}
                          className="pl-10 h-12 theme-transition"
                          onChange={(e) => {
                            const formatted = formatPhone(e.target.value);
                            field.onChange(formatted);
                          }}
                          value={field.value || ''}
                          aria-describedby="telefone-error"
                        />
                      </div>
                    </FormControl>
                    <FormMessage id="telefone-error" />
                  </FormItem>
                )}
              />

              {/* Data de Nascimento */}
              <FormField
                control={form.control}
                name="data_nascimento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-medium">
                      Data de Nascimento
                    </FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value || ''}
                        onChange={field.onChange}
                        disabled={isLoading}
                        placeholder="Selecione sua data de nascimento"
                        aria-describedby="data-nascimento-error"
                      />
                    </FormControl>
                    <FormMessage id="data-nascimento-error" />
                  </FormItem>
                )}
              />
            </div>

            {/* Endereço */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Endereço</h3>

              {/* CEP */}
              <FormField
                control={form.control}
                name="cep"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-medium">
                      CEP
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MapPin
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          {...field}
                          placeholder="12345-678"
                          disabled={isLoading || loadingCep}
                          className="pl-10 h-12 theme-transition"
                          onChange={(e) => {
                            const formatted = formatCEP(e.target.value);
                            field.onChange(formatted);
                            handleCepChange(formatted);
                          }}
                          value={field.value || ''}
                          aria-describedby="cep-error"
                        />
                        {loadingCep && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage id="cep-error" />
                    {addressInfo && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {addressInfo.logradouro}, {addressInfo.bairro} -{' '}
                        {addressInfo.cidade}/{addressInfo.estado}
                      </p>
                    )}
                  </FormItem>
                )}
              />

              {/* Número */}
              <FormField
                control={form.control}
                name="numero_endereco"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-medium">
                      Número
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Hash
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          {...field}
                          placeholder="123"
                          disabled={isLoading}
                          className="pl-10 h-12 theme-transition"
                          value={field.value || ''}
                          aria-describedby="numero-endereco-error"
                        />
                      </div>
                    </FormControl>
                    <FormMessage id="numero-endereco-error" />
                  </FormItem>
                )}
              />

              {/* Complemento */}
              <FormField
                control={form.control}
                name="complemento_endereco"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-medium">
                      Complemento
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Home
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          {...field}
                          placeholder="Apto 123, Bloco A"
                          disabled={isLoading}
                          className="pl-10 h-12 theme-transition"
                          value={field.value || ''}
                          aria-describedby="complemento-endereco-error"
                        />
                      </div>
                    </FormControl>
                    <FormMessage id="complemento-endereco-error" />
                  </FormItem>
                )}
              />
            </div>

            {/* Campos Profissionais */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Dados Profissionais</h3>
              <ProfileFormFields
                control={form.control}
                isLoading={isLoading}
                userRole={userRole}
                showAllFields={showAllFields}
              />
            </div>

            {/* Botão de Submit */}
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isLoading} className="min-w-32">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {isLoading ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    );
  }
);

EditProfileForm.displayName = 'EditProfileForm';
