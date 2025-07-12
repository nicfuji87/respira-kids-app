import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, FileText, Phone, MapPin, Home, Hash } from 'lucide-react';

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
import { useToast } from '@/components/primitives/use-toast';
import { DatePicker } from './DatePicker';
import { cn } from '@/lib/utils';
import {
  validateCPF,
  formatCPF,
  formatCEP,
  formatPhone,
  getAddressByCep,
} from '@/lib/profile';

// AI dev note: CompleteProfileForm para finalizar cadastro de pessoa física
// Campos obrigatórios: nome, CPF, telefone, CEP conforme especificação

const completeProfileSchema = z.object({
  nome: z
    .string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres'),
  cpf_cnpj: z
    .string()
    .min(1, 'CPF é obrigatório')
    .refine(validateCPF, 'CPF inválido'),
  telefone: z
    .string()
    .min(1, 'WhatsApp é obrigatório')
    .regex(
      /^\(\d{2}\) \d{4,5}-\d{4}$/,
      'WhatsApp deve estar no formato (XX) XXXXX-XXXX'
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
    .min(1, 'CEP é obrigatório')
    .regex(/^\d{5}-\d{3}$/, 'CEP deve estar no formato 12345-678'),
  numero_endereco: z.string().min(1, 'Número é obrigatório'),
  complemento_endereco: z.string().optional(),
});

type CompleteProfileFormData = z.infer<typeof completeProfileSchema>;

interface AddressInfo {
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

interface CompleteProfileFormProps {
  onSubmit: (data: CompleteProfileFormData) => Promise<void>;
  isLoading?: boolean;
  initialData?: Partial<CompleteProfileFormData>;
  className?: string;
}

export const CompleteProfileForm = React.memo<CompleteProfileFormProps>(
  ({ onSubmit, isLoading = false, initialData, className }) => {
    const [addressInfo, setAddressInfo] = useState<AddressInfo | null>(null);
    const [loadingCep, setLoadingCep] = useState(false);
    const [whatsappValidation, setWhatsappValidation] = useState<{
      isValidating: boolean;
      isValid: boolean | null;
      message: string;
    }>({
      isValidating: false,
      isValid: null,
      message: '',
    });
    const { toast } = useToast();

    // Validação do WhatsApp com debounce
    const validateWhatsApp = async (telefone: string) => {
      console.log('validateWhatsApp chamada com:', telefone); // Debug log

      // Limpar número: apenas dígitos
      const cleanPhone = telefone.replace(/\D/g, '');
      console.log('Número limpo:', cleanPhone); // Debug log

      // Verificar se tem 11 dígitos (formato brasileiro com DDD)
      if (cleanPhone.length !== 11) {
        console.log('Número não tem 11 dígitos, cancelando validação'); // Debug log
        setWhatsappValidation({
          isValidating: false,
          isValid: null,
          message: '',
        });
        return;
      }

      console.log('Iniciando validação do WhatsApp para:', cleanPhone); // Debug log
      setWhatsappValidation({
        isValidating: true,
        isValid: null,
        message: 'Verificando WhatsApp...',
      });

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        console.log('Fazendo requisição para webhook...'); // Debug log
        const response = await fetch(
          'https://webhooks-i.infusecomunicacao.online/webhook/verificaWhatsApp',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              whatsapp: cleanPhone,
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);
        console.log('Resposta recebida:', response.status); // Debug log

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Dados recebidos:', data); // Debug log

        // Verificar formato esperado: [{ exists: boolean, ... }]
        if (
          Array.isArray(data) &&
          data.length > 0 &&
          typeof data[0].exists === 'boolean'
        ) {
          const isValid = data[0].exists;
          console.log('WhatsApp é válido:', isValid); // Debug log
          setWhatsappValidation({
            isValidating: false,
            isValid,
            message: isValid
              ? 'WhatsApp válido'
              : 'Insira um número válido no WhatsApp',
          });
        } else {
          console.log('Formato de resposta inválido:', data); // Debug log
          throw new Error('Formato de resposta inválido');
        }
      } catch (error) {
        console.error('Erro na validação do WhatsApp:', error);
        setWhatsappValidation({
          isValidating: false,
          isValid: null,
          message: 'Não foi possível verificar o WhatsApp',
        });
      }
    };

    const form = useForm<CompleteProfileFormData>({
      resolver: zodResolver(completeProfileSchema),
      defaultValues: {
        nome: initialData?.nome || '',
        cpf_cnpj: initialData?.cpf_cnpj || '',
        telefone: initialData?.telefone || '',
        data_nascimento: initialData?.data_nascimento || '',
        cep: initialData?.cep || '',
        numero_endereco: initialData?.numero_endereco || '',
        complemento_endereco: initialData?.complemento_endereco || '',
      },
    });

    // Debounce para validação do WhatsApp
    useEffect(() => {
      let timeoutId: NodeJS.Timeout;

      const subscription = form.watch((value, { name }) => {
        if (name === 'telefone') {
          const telefone = value.telefone || '';

          // Limpar timeout anterior
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          if (!telefone) {
            setWhatsappValidation({
              isValidating: false,
              isValid: null,
              message: '',
            });
            return;
          }

          timeoutId = setTimeout(() => {
            console.log('Validando WhatsApp:', telefone); // Debug log
            validateWhatsApp(telefone);
          }, 800); // 800ms debounce
        }
      });

      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        subscription.unsubscribe();
      };
    }, [form]);

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

    const handleSubmit = async (data: CompleteProfileFormData) => {
      try {
        await onSubmit(data);
      } catch (error) {
        console.error('Erro no envio do formulário:', error);
      }
    };

    return (
      <div className={cn('space-y-6', className)}>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
            aria-label="Formulário para completar perfil"
          >
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
                    CPF *
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
                        aria-describedby="cpf-error"
                      />
                    </div>
                  </FormControl>
                  <FormMessage id="cpf-error" />
                </FormItem>
              )}
            />

            {/* WhatsApp */}
            <FormField
              control={form.control}
              name="telefone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    WhatsApp *
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
                        aria-describedby="telefone-error"
                      />
                      {whatsappValidation.isValidating && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage id="telefone-error" />
                  {whatsappValidation.message && (
                    <p
                      className={cn(
                        'text-sm mt-1',
                        whatsappValidation.isValid === true && 'text-green-600',
                        whatsappValidation.isValid === false && 'text-red-600',
                        whatsappValidation.isValid === null &&
                          'text-muted-foreground'
                      )}
                    >
                      {whatsappValidation.message}
                    </p>
                  )}
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
                      value={field.value}
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

            {/* CEP */}
            <FormField
              control={form.control}
              name="cep"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    CEP *
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
                        aria-describedby="cep-error"
                      />
                      {loadingCep && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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

            {/* Número do Endereço */}
            <FormField
              control={form.control}
              name="numero_endereco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    Número *
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
                        aria-describedby="complemento-endereco-error"
                      />
                    </div>
                  </FormControl>
                  <FormMessage id="complemento-endereco-error" />
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading || loadingCep}
              className="w-full h-12 respira-gradient hover:opacity-90 theme-transition font-medium mt-6"
              aria-label="Completar cadastro"
            >
              {isLoading ? 'Salvando...' : 'Completar Cadastro'}
            </Button>
          </form>
        </Form>
      </div>
    );
  }
);

CompleteProfileForm.displayName = 'CompleteProfileForm';
