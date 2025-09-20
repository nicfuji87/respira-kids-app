import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail } from 'lucide-react';

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
import { cn } from '@/lib/utils';

// AI dev note: ForgotPasswordForm reutiliza primitives Form, Input, Button
// Formulário simples para solicitar recuperação de senha via email

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email é obrigatório')
    .email('Email deve ter formato válido'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

interface ForgotPasswordFormProps {
  onSubmit: (data: ForgotPasswordFormData) => Promise<void>;
  onBackToLogin?: () => void;
  isLoading?: boolean;
  className?: string;
}

export const ForgotPasswordForm = React.memo<ForgotPasswordFormProps>(
  ({ onSubmit, onBackToLogin, isLoading = false, className }) => {
    const form = useForm<ForgotPasswordFormData>({
      resolver: zodResolver(forgotPasswordSchema),
      defaultValues: {
        email: '',
      },
    });

    const handleSubmit = async (data: ForgotPasswordFormData) => {
      try {
        await onSubmit(data);
      } catch (error) {
        console.error('Erro ao solicitar recuperação:', error);
      }
    };

    return (
      <div className={cn('space-y-6', className)}>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
            aria-label="Formulário de recuperação de senha"
          >
            {/* Email Field */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground font-medium">
                    Email
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail
                        className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        {...field}
                        type="email"
                        placeholder="seu.email@exemplo.com"
                        disabled={isLoading}
                        className="pl-10 h-12 theme-transition"
                        aria-describedby="email-error"
                      />
                    </div>
                  </FormControl>
                  <FormMessage id="email-error" />
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 respira-gradient hover:opacity-90 theme-transition font-medium"
              aria-label="Enviar email de recuperação"
            >
              {isLoading ? 'Enviando...' : 'Enviar email de recuperação'}
            </Button>

            {/* Back to Login Link */}
            {onBackToLogin && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={onBackToLogin}
                  disabled={isLoading}
                  className="text-sm text-primary hover:underline disabled:opacity-50"
                  aria-label="Voltar para o login"
                >
                  Voltar para o login
                </button>
              </div>
            )}
          </form>
        </Form>
      </div>
    );
  }
);

ForgotPasswordForm.displayName = 'ForgotPasswordForm';
