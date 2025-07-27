import React, { useState, useCallback } from 'react';
import { Wand2, FileText, Mic, Loader2 } from 'lucide-react';
import { RichTextEditor, AudioRecorder } from '@/components/primitives';
import { Button } from '@/components/primitives/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/primitives/tabs';
import { Alert, AlertDescription } from '@/components/primitives/alert';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// AI dev note: EvolutionEditor composto que combina RichTextEditor + AudioRecorder + IA
// Interface completa para edição de evoluções médicas com transcrição e enhancement

export interface EvolutionEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  error?: string;
}

interface TranscriptionResult {
  success: boolean;
  transcription?: string;
  error?: string;
}

interface EnhancementResult {
  success: boolean;
  enhancedText?: string;
  error?: string;
}

export const EvolutionEditor = React.memo<EvolutionEditorProps>(
  ({
    value,
    onChange,
    disabled = false,
    className,
    placeholder = 'Digite ou grave a evolução do paciente...',
    error,
  }) => {
    // AI dev note: Usar autenticação completa para Edge Functions
    const { user, isAuthenticated, canAccessDashboard, loading } = useAuth();

    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [transcriptionError, setTranscriptionError] = useState<string | null>(
      null
    );
    const [enhancementError, setEnhancementError] = useState<string | null>(
      null
    );
    const [activeTab, setActiveTab] = useState<'text' | 'audio'>('text');

    // Converter áudio para Base64
    const blobToBase64 = useCallback((blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remover o prefixo data:type;base64,
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }, []);

    // Transcrever áudio usando Edge Function
    const transcribeAudio = useCallback(
      async (audioBlob: Blob) => {
        // AI dev note: Verificar autenticação antes de chamar Edge Function
        if (!isAuthenticated || !canAccessDashboard || !user) {
          setTranscriptionError('Usuário não autenticado ou sem permissões');
          return;
        }

        if (loading) {
          setTranscriptionError('Aguarde... verificando autenticação');
          return;
        }

        console.log(
          '🟢 [FRONTEND] Starting transcribe-audio call for user:',
          user.id
        );

        setIsTranscribing(true);
        setTranscriptionError(null);

        try {
          // Converter para base64
          const audioBase64 = await blobToBase64(audioBlob);
          const audioType = audioBlob.type || 'audio/webm';

          // Chamar Edge Function com autenticação
          console.log('🟢 [FRONTEND] Calling transcribe-audio function...');
          const { data, error } = await supabase.functions.invoke(
            'transcribe-audio',
            {
              body: {
                audioBase64,
                audioType,
                language: 'pt',
              },
            }
          );

          console.log('🟢 [FRONTEND] transcribe-audio response:', {
            data,
            error,
          });

          if (error) {
            console.error('🔴 [FRONTEND] transcribe-audio error:', error);
            throw error;
          }

          const result = data as TranscriptionResult;

          if (result.success && result.transcription) {
            // Adicionar transcrição ao texto existente
            const newText = value
              ? `${value}\n\n${result.transcription}`
              : result.transcription;
            onChange(newText);
            setActiveTab('text'); // Voltar para aba de texto
          } else {
            throw new Error(result.error || 'Erro na transcrição');
          }
        } catch (err) {
          console.error('Erro na transcrição:', err);
          setTranscriptionError(
            err instanceof Error ? err.message : 'Erro ao transcrever áudio'
          );
        } finally {
          setIsTranscribing(false);
        }
      },
      [
        value,
        onChange,
        blobToBase64,
        user,
        isAuthenticated,
        canAccessDashboard,
        loading,
      ]
    );

    // Melhorar texto usando Edge Function
    const enhanceText = useCallback(
      async (action: 'improve' | 'summarize' | 'medical_format') => {
        if (!value.trim()) {
          setEnhancementError('Digite algum texto antes de usar a IA');
          return;
        }

        // AI dev note: Verificar autenticação antes de chamar Edge Function
        if (!isAuthenticated || !canAccessDashboard || !user) {
          setEnhancementError('Usuário não autenticado ou sem permissões');
          return;
        }

        if (loading) {
          setEnhancementError('Aguarde... verificando autenticação');
          return;
        }

        console.log(
          '🟢 [FRONTEND] Starting enhance-text call for user:',
          user.id
        );

        setIsEnhancing(true);
        setEnhancementError(null);

        try {
          // Chamar Edge Function com autenticação
          console.log('🟢 [FRONTEND] Calling enhance-text function...');
          const { data, error } = await supabase.functions.invoke(
            'enhance-text',
            {
              body: {
                text: value,
                action,
              },
            }
          );

          console.log('🟢 [FRONTEND] enhance-text response:', { data, error });

          if (error) {
            console.error('🔴 [FRONTEND] enhance-text error:', error);
            throw error;
          }

          const result = data as EnhancementResult;

          if (result.success && result.enhancedText) {
            onChange(result.enhancedText);
          } else {
            throw new Error(result.error || 'Erro no melhoramento');
          }
        } catch (err) {
          console.error('Erro no melhoramento:', err);
          setEnhancementError(
            err instanceof Error ? err.message : 'Erro ao melhorar texto'
          );
        } finally {
          setIsEnhancing(false);
        }
      },
      [value, onChange, isAuthenticated, canAccessDashboard, loading]
    );

    // Limpar erros quando o usuário interagir
    const handleTextChange = useCallback(
      (newValue: string) => {
        onChange(newValue);
        if (transcriptionError) setTranscriptionError(null);
        if (enhancementError) setEnhancementError(null);
      },
      [onChange, transcriptionError, enhancementError]
    );

    return (
      <div className={cn('space-y-4', className)}>
        {/* Tabs para alternar entre texto e áudio */}
        <Tabs
          value={activeTab}
          onValueChange={(tab) => setActiveTab(tab as 'text' | 'audio')}
        >
          <div className="flex items-center justify-between">
            <TabsList className="grid w-fit grid-cols-2">
              <TabsTrigger value="text" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Texto
              </TabsTrigger>
              <TabsTrigger value="audio" className="flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Áudio
              </TabsTrigger>
            </TabsList>

            {/* Botão de melhoria de texto IA */}
            {value.trim() && !disabled && (
              <Button
                variant="outline"
                size="sm"
                disabled={isEnhancing}
                onClick={() => enhanceText('improve')}
                className="flex items-center gap-2"
              >
                {isEnhancing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Melhorar texto com IA
              </Button>
            )}
          </div>

          {/* Conteúdo das tabs */}
          <TabsContent value="text" className="mt-4">
            <RichTextEditor
              value={value}
              onChange={handleTextChange}
              placeholder={placeholder}
              disabled={disabled || isTranscribing}
              error={error}
              minHeight={150}
              maxHeight={500}
              editorBackgroundColor="white"
            />
          </TabsContent>

          <TabsContent value="audio" className="mt-4">
            <AudioRecorder
              onAudioComplete={transcribeAudio}
              disabled={disabled || isTranscribing}
              maxDuration={300} // 5 minutos
              error={transcriptionError || undefined}
            />

            {isTranscribing && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">
                  Transcrevendo áudio...
                </span>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Alertas de erro */}
        {transcriptionError && (
          <Alert variant="destructive">
            <AlertDescription>{transcriptionError}</AlertDescription>
          </Alert>
        )}

        {enhancementError && (
          <Alert variant="destructive">
            <AlertDescription>{enhancementError}</AlertDescription>
          </Alert>
        )}

        {/* Informações sobre IA */}
        {!disabled && (
          <div className="text-xs text-muted-foreground">
            💡 Dica: Use a gravação de áudio para transcrição automática ou o
            botão IA para melhorar o texto
          </div>
        )}
      </div>
    );
  }
);

EvolutionEditor.displayName = 'EvolutionEditor';
