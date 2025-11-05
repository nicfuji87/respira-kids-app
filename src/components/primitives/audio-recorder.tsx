import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Trash2, Play, Pause, Upload, StopCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Progress } from './progress';

// AI dev note: AudioRecorder primitive para gravação de áudio com limite de 5 minutos
// Implementação nativa com MediaRecorder API (compatível com React 19)

export interface AudioRecorderProps {
  onAudioComplete: (audioBlob: Blob) => void;
  disabled?: boolean;
  className?: string;
  maxDuration?: number; // em segundos, default 5 minutos
  error?: string;
}

export const AudioRecorder = React.memo<AudioRecorderProps>(
  ({
    onAudioComplete,
    disabled = false,
    className,
    maxDuration = 300, // 5 minutos
    error,
  }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [permissionError, setPermissionError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Parar gravação
    const stopRecording = useCallback(() => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }

      setIsRecording(false);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, [isRecording]);

    // Iniciar gravação
    const startRecording = useCallback(async () => {
      // Verificar suporte do navegador
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      ) {
        setPermissionError('Seu navegador não suporta gravação de áudio');
        return;
      }

      try {
        setPermissionError(null);

        // Solicitar permissão do microfone
        // AI dev note: Configurações otimizadas para transcrição (menor tamanho de arquivo)
        // Sample rate reduzido de 44100 para 16000 (suficiente para voz)
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000, // Reduzido para economizar espaço (voz não precisa de 44100)
          },
        });

        streamRef.current = stream;
        audioChunksRef.current = [];

        // AI dev note: Configurar MediaRecorder com bitrate otimizado para voz
        // Isso reduz significativamente o tamanho do arquivo
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 32000, // 32kbps é suficiente para transcrição de voz
        });

        mediaRecorderRef.current = mediaRecorder;

        // Event handlers
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: 'audio/webm;codecs=opus',
          });
          setRecordedBlob(audioBlob);

          const url = URL.createObjectURL(audioBlob);
          setAudioUrl(url);

          // Limpar stream
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
        };

        mediaRecorder.onerror = (event) => {
          console.error('Erro na gravação:', event);
          setPermissionError('Erro durante a gravação');
          stopRecording();
        };

        // Iniciar gravação
        mediaRecorder.start(1000); // Chunk a cada 1 segundo
        setIsRecording(true);
        setRecordingTime(0);

        // Timer para contagem de tempo
        intervalRef.current = setInterval(() => {
          setRecordingTime((prevTime) => {
            const newTime = prevTime + 1;

            // Parar automaticamente ao atingir o limite
            if (newTime >= maxDuration) {
              stopRecording();
              return maxDuration;
            }

            return newTime;
          });
        }, 1000);
      } catch (error) {
        console.error('Erro ao acessar microfone:', error);

        if (error instanceof DOMException) {
          switch (error.name) {
            case 'NotAllowedError':
              setPermissionError(
                'Permissão negada. Permita o acesso ao microfone.'
              );
              break;
            case 'NotFoundError':
              setPermissionError('Microfone não encontrado.');
              break;
            case 'NotReadableError':
              setPermissionError(
                'Microfone está sendo usado por outro aplicativo.'
              );
              break;
            default:
              setPermissionError('Erro ao acessar o microfone.');
          }
        } else {
          setPermissionError('Erro desconhecido ao acessar o microfone.');
        }
      }
    }, [maxDuration, stopRecording]);

    // Limpar gravação
    const clearRecording = useCallback(() => {
      setRecordedBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
      setIsPlaying(false);
      setPermissionError(null);

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }, [audioUrl]);

    // Play/Pause áudio
    const togglePlayback = useCallback(() => {
      if (!audioRef.current || !audioUrl) return;

      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }, [isPlaying, audioUrl]);

    // Confirmar uso do áudio
    const handleUseAudio = useCallback(() => {
      if (recordedBlob) {
        onAudioComplete(recordedBlob);
        clearRecording();
      }
    }, [recordedBlob, onAudioComplete, clearRecording]);

    // Formatar tempo
    const formatTime = useCallback((seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }, []);

    // Progress percentage
    const progressPercentage = (recordingTime / maxDuration) * 100;

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }
      };
    }, [audioUrl]);

    return (
      <div
        className={cn(
          'border rounded-lg p-4 space-y-4',
          (error || permissionError) && 'border-destructive',
          className
        )}
      >
        {/* Status da gravação */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic
              className={cn(
                'h-4 w-4',
                isRecording && 'text-red-500 animate-pulse'
              )}
            />
            <span className="text-sm font-medium">
              {isRecording
                ? 'Gravando...'
                : recordedBlob
                  ? 'Áudio gravado'
                  : 'Gravação de áudio'}
            </span>
          </div>

          {(isRecording || recordedBlob) && (
            <div className="text-sm text-muted-foreground">
              {formatTime(recordingTime)} / {formatTime(maxDuration)}
            </div>
          )}
        </div>

        {/* Progress bar durante gravação */}
        {isRecording && (
          <div className="space-y-2">
            <Progress value={progressPercentage} className="w-full" />
            <div className="text-xs text-center text-muted-foreground">
              {progressPercentage >= 80 &&
                'Atenção: próximo do limite de tempo'}
            </div>
          </div>
        )}

        {/* Controles de gravação */}
        {!recordedBlob && (
          <div className="flex justify-center">
            <div className="flex items-center gap-2">
              {!isRecording ? (
                <Button
                  type="button"
                  variant="default"
                  size="lg"
                  onClick={startRecording}
                  disabled={disabled}
                  className="rounded-full w-16 h-16 p-0"
                >
                  <Mic className="h-6 w-6" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  onClick={stopRecording}
                  className="rounded-full w-16 h-16 p-0"
                >
                  <StopCircle className="h-6 w-6" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Controles para áudio gravado */}
        {recordedBlob && audioUrl && (
          <div className="space-y-3">
            {/* Informações do arquivo */}
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              <span>Tamanho: {(recordedBlob.size / 1024).toFixed(1)} KB</span>
              <span>
                {recordedBlob.size > 25 * 1024 * 1024 && (
                  <span className="text-destructive font-semibold">
                    ⚠️ Muito grande! Limite: 25MB
                  </span>
                )}
                {recordedBlob.size <= 25 * 1024 * 1024 && (
                  <span className="text-green-600">✓ Tamanho OK</span>
                )}
              </span>
            </div>

            {/* Player de áudio */}
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />

            {/* Controles de reprodução */}
            <div className="flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={togglePlayback}
                disabled={disabled}
                className="flex items-center gap-2"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {isPlaying ? 'Pausar' : 'Reproduzir'}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearRecording}
                disabled={disabled}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Descartar
              </Button>

              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleUseAudio}
                disabled={disabled}
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Usar áudio
              </Button>
            </div>
          </div>
        )}

        {/* Instruções */}
        {!isRecording && !recordedBlob && !permissionError && (
          <div className="text-center text-sm text-muted-foreground">
            Clique no microfone para iniciar a gravação
            <br />
            Limite máximo: {formatTime(maxDuration)}
          </div>
        )}

        {/* Mensagem de erro de permissão */}
        {permissionError && (
          <div className="text-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            {permissionError}
          </div>
        )}

        {/* Mensagem de erro externa */}
        {error && (
          <p className="text-sm text-destructive text-center" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

AudioRecorder.displayName = 'AudioRecorder';
