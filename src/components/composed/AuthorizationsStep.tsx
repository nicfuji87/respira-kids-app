import React, { useState, useCallback } from 'react';
import { Button } from '@/components/primitives/button';
import { Label } from '@/components/primitives/label';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertCircle, Check } from 'lucide-react';

// AI dev note: AuthorizationsStep - Etapa de consentimentos e autorizações
// Todas as autorizações são obrigatórias para prosseguir
// Dados salvos em: autorizacao_uso_cientifico, autorizacao_uso_redes_sociais, autorizacao_uso_do_nome

export interface AuthorizationsData {
  usoCientifico: boolean | null;
  usoRedesSociais: boolean | null;
  usoNome: boolean | null;
}

export interface AuthorizationsStepProps {
  onContinue: (data: AuthorizationsData) => void;
  onBack?: () => void;
  initialData?: Partial<AuthorizationsData>;
  className?: string;
}

export const AuthorizationsStep = React.memo<AuthorizationsStepProps>(
  ({ onContinue, onBack, initialData, className }) => {
    const [usoCientifico, setUsoCientifico] = useState<boolean | null>(
      initialData?.usoCientifico ?? null
    );
    const [usoRedesSociais, setUsoRedesSociais] = useState<boolean | null>(
      initialData?.usoRedesSociais ?? null
    );
    const [usoNome, setUsoNome] = useState<boolean | null>(
      initialData?.usoNome ?? null
    );
    const [error, setError] = useState('');

    console.log('✅ [AuthorizationsStep] Renderizado');

    const allAnswered =
      usoCientifico !== null && usoRedesSociais !== null && usoNome !== null;

    const handleContinue = useCallback(() => {
      console.log('➡️ [AuthorizationsStep] handleContinue');

      if (!allAnswered) {
        setError(
          'Por favor, responda todas as autorizações (Sim ou Não) para continuar'
        );
        return;
      }

      const authorizationsData: AuthorizationsData = {
        usoCientifico: usoCientifico!,
        usoRedesSociais: usoRedesSociais!,
        usoNome: usoNome!,
      };

      console.log('✅ [AuthorizationsStep] Dados válidos:', authorizationsData);
      onContinue(authorizationsData);
    }, [allAnswered, usoCientifico, usoRedesSociais, usoNome, onContinue]);

    return (
      <div className={cn('w-full max-w-md mx-auto space-y-6', className)}>
        {/* Título */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            Autorizações e Consentimentos
          </h2>
          <p className="text-base text-muted-foreground">
            Precisamos da sua autorização para alguns usos específicos
          </p>
        </div>

        <Card className="p-6 space-y-5">
          {/* Explicação */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Por que precisamos dessas autorizações?
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Estas autorizações nos ajudam a melhorar nossos serviços e
                  compartilhar os resultados positivos do tratamento, sempre
                  respeitando sua privacidade.
                </p>
              </div>
            </div>
          </div>

          {/* Lista de autorizações */}
          <div className="space-y-4">
            {/* Uso Científico */}
            <div className="p-4 rounded-lg border-2 border-border space-y-3">
              <Label className="font-semibold text-base">
                Autorização para uso científico{' '}
                <span className="text-destructive">*</span>
              </Label>
              <p className="text-sm text-muted-foreground">
                Autorizo o uso de informações do tratamento para fins
                científicos, estudos e pesquisas. Os dados serão anonimizados e
                sua identidade será protegida.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setUsoCientifico(true);
                    setError('');
                  }}
                  className={cn(
                    'flex-1 py-2 px-4 rounded-lg border-2 transition-all font-medium',
                    usoCientifico === true
                      ? 'bg-green-50 dark:bg-green-950/20 border-green-500 text-green-700 dark:text-green-300'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  {usoCientifico === true && (
                    <Check className="inline w-4 h-4 mr-2" />
                  )}
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUsoCientifico(false);
                    setError('');
                  }}
                  className={cn(
                    'flex-1 py-2 px-4 rounded-lg border-2 transition-all font-medium',
                    usoCientifico === false
                      ? 'bg-gray-100 dark:bg-gray-900 border-gray-400 text-gray-700 dark:text-gray-300'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  {usoCientifico === false && (
                    <Check className="inline w-4 h-4 mr-2" />
                  )}
                  Não
                </button>
              </div>
            </div>

            {/* Uso Redes Sociais */}
            <div className="p-4 rounded-lg border-2 border-border space-y-3">
              <Label className="font-semibold text-base">
                Autorização para uso em redes sociais{' '}
                <span className="text-destructive">*</span>
              </Label>
              <p className="text-sm text-muted-foreground">
                Autorizo o uso de imagens e vídeos em redes sociais e materiais
                de divulgação da clínica, respeitando os direitos de imagem.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setUsoRedesSociais(true);
                    setError('');
                  }}
                  className={cn(
                    'flex-1 py-2 px-4 rounded-lg border-2 transition-all font-medium',
                    usoRedesSociais === true
                      ? 'bg-green-50 dark:bg-green-950/20 border-green-500 text-green-700 dark:text-green-300'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  {usoRedesSociais === true && (
                    <Check className="inline w-4 h-4 mr-2" />
                  )}
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUsoRedesSociais(false);
                    setError('');
                  }}
                  className={cn(
                    'flex-1 py-2 px-4 rounded-lg border-2 transition-all font-medium',
                    usoRedesSociais === false
                      ? 'bg-gray-100 dark:bg-gray-900 border-gray-400 text-gray-700 dark:text-gray-300'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  {usoRedesSociais === false && (
                    <Check className="inline w-4 h-4 mr-2" />
                  )}
                  Não
                </button>
              </div>
            </div>

            {/* Uso do Nome */}
            <div className="p-4 rounded-lg border-2 border-border space-y-3">
              <Label className="font-semibold text-base">
                Autorização para uso do nome{' '}
                <span className="text-destructive">*</span>
              </Label>
              <p className="text-sm text-muted-foreground">
                Autorizo o uso do nome do paciente em publicações, depoimentos e
                materiais de divulgação, quando aplicável.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setUsoNome(true);
                    setError('');
                  }}
                  className={cn(
                    'flex-1 py-2 px-4 rounded-lg border-2 transition-all font-medium',
                    usoNome === true
                      ? 'bg-green-50 dark:bg-green-950/20 border-green-500 text-green-700 dark:text-green-300'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  {usoNome === true && (
                    <Check className="inline w-4 h-4 mr-2" />
                  )}
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUsoNome(false);
                    setError('');
                  }}
                  className={cn(
                    'flex-1 py-2 px-4 rounded-lg border-2 transition-all font-medium',
                    usoNome === false
                      ? 'bg-gray-100 dark:bg-gray-900 border-gray-400 text-gray-700 dark:text-gray-300'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  {usoNome === false && (
                    <Check className="inline w-4 h-4 mr-2" />
                  )}
                  Não
                </button>
              </div>
            </div>
          </div>

          {/* Erro */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/50 rounded-lg">
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </p>
            </div>
          )}

          {/* Status */}
          {allAnswered && (
            <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
              <p className="text-sm text-green-900 dark:text-green-100 flex items-center gap-2">
                <Check className="w-4 h-4" />
                Todas as autorizações foram respondidas. Você pode prosseguir!
              </p>
            </div>
          )}

          {/* Observação */}
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>Importante:</strong> Estas autorizações são necessárias
              para completar o cadastro. Todas as informações serão tratadas com
              confidencialidade e de acordo com a LGPD (Lei Geral de Proteção de
              Dados).
            </p>
          </div>
        </Card>

        {/* Botões de navegação */}
        <div className="flex gap-3">
          {onBack && (
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              size="lg"
              className="flex-1 h-12 text-base"
            >
              Voltar
            </Button>
          )}
          <Button
            onClick={handleContinue}
            size="lg"
            className="flex-1 h-12 text-base font-semibold"
            disabled={!allAnswered}
          >
            {allAnswered ? 'Continuar' : 'Responda todas as autorizações'}
          </Button>
        </div>
      </div>
    );
  }
);

AuthorizationsStep.displayName = 'AuthorizationsStep';
