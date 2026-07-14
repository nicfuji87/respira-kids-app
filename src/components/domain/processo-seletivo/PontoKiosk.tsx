// AI dev note: Quiosque de ponto para o tablet da clínica. Overlay fullscreen
// (cobre a sidebar) aberto pela staff logada; os estagiários batem o ponto sozinhos.
// Fluxo: escolhe o nome -> abre a câmera -> tira a selfie (foto-comprovante) ->
// registra entrada/saída (o tipo é decidido pela última batida do dia).
// A foto é só comprovante visual — sem reconhecimento facial (LGPD leve).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Camera,
  X,
  CheckCircle2,
  LogIn,
  LogOut,
  RotateCcw,
  MapPin,
  MapPinOff,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';
import {
  fetchEstagiariosAtivos,
  fetchPontosHoje,
  proximaBatida,
  uploadPontoFoto,
  registrarPonto,
  getGeolocation,
  type EstagiarioAtivo,
  type PontoTipo,
  type Coords,
} from '@/lib/estagio-pontos-api';

interface Props {
  open: boolean;
  onClose: () => void;
  registradoPor: string | null;
}

type View = 'lista' | 'camera' | 'ok';

function iniciais(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function horaBR(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export const PontoKiosk: React.FC<Props> = ({
  open,
  onClose,
  registradoPor,
}) => {
  const [view, setView] = useState<View>('lista');
  const [estagiarios, setEstagiarios] = useState<EstagiarioAtivo[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [selected, setSelected] = useState<EstagiarioAtivo | null>(null);
  const [tipo, setTipo] = useState<PontoTipo>('entrada');
  const [saving, setSaving] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<Date | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoStatus, setGeoStatus] = useState<'pendente' | 'ok' | 'sem'>(
    'pendente'
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Carrega a lista quando abre.
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLoadingLista(true);
    (async () => {
      try {
        const data = await fetchEstagiariosAtivos();
        if (!cancel) setEstagiarios(data);
      } catch {
        if (!cancel) setErro('Não consegui carregar os estagiários.');
      } finally {
        if (!cancel) setLoadingLista(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Liga/desliga a câmera conforme a view.
  useEffect(() => {
    if (view !== 'camera') return;
    let cancel = false;

    // Pede a localização em paralelo (não bloqueia a câmera).
    setGeoStatus('pendente');
    setCoords(null);
    void getGeolocation().then((c) => {
      if (cancel) return;
      setCoords(c);
      setGeoStatus(c ? 'ok' : 'sem');
    });

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancel) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCamError(null);
      } catch {
        setCamError(
          'Não consegui acessar a câmera. Verifique a permissão do navegador no tablet.'
        );
      }
    })();
    return () => {
      cancel = true;
      stopCamera();
    };
  }, [view, stopCamera]);

  // Some tudo quando fecha.
  useEffect(() => {
    if (!open) {
      stopCamera();
      setView('lista');
      setSelected(null);
      setErro(null);
      setCamError(null);
    }
  }, [open, stopCamera]);

  // Volta para a lista após confirmar.
  useEffect(() => {
    if (view !== 'ok') return;
    const t = setTimeout(() => {
      setView('lista');
      setSelected(null);
    }, 3500);
    return () => clearTimeout(t);
  }, [view]);

  const escolher = useCallback(async (e: EstagiarioAtivo) => {
    setSelected(e);
    setErro(null);
    try {
      const hoje = await fetchPontosHoje(e.id);
      setTipo(proximaBatida(hoje));
    } catch {
      setTipo('entrada');
    }
    setView('camera');
  }, []);

  const capturar = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !selected) return;
    const vw = video.videoWidth || 480;
    const vh = video.videoHeight || 480;
    const size = Math.min(vw, vh);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
    );
    if (!blob) {
      setErro('Falha ao capturar a foto. Tente novamente.');
      return;
    }
    setSaving(true);
    setErro(null);
    try {
      const path = await uploadPontoFoto(selected.id, blob);
      await registrarPonto({
        candidaturaId: selected.id,
        tipo,
        fotoPath: path,
        registradoPor,
        coords,
      });
      stopCamera();
      setDoneAt(new Date());
      setView('ok');
    } catch {
      setErro('Não consegui registrar o ponto. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }, [selected, tipo, registradoPor, coords, stopCamera]);

  const voltarLista = useCallback(() => {
    stopCamera();
    setView('lista');
    setSelected(null);
  }, [stopCamera]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-bege-fundo to-background flex flex-col">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-card/60 backdrop-blur">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            Ponto do estágio
          </h2>
          <p className="text-sm text-muted-foreground">
            Toque no seu nome para registrar entrada ou saída.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-2">
          <X className="w-4 h-4" />
          Sair do quiosque
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* ---- Lista de estagiários ---- */}
        {view === 'lista' && (
          <>
            {loadingLista ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
              </div>
            ) : estagiarios.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                Nenhum estagiário ativo. Aprove candidaturas para habilitar o
                ponto.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
                {estagiarios.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => void escolher(e)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border/60 bg-card p-6 min-h-[160px]',
                      'transition-all hover:border-azul-respira hover:shadow-lg active:scale-95'
                    )}
                  >
                    <span className="flex items-center justify-center w-16 h-16 rounded-full bg-azul-respira/15 text-azul-respira text-xl font-bold">
                      {iniciais(e.nome)}
                    </span>
                    <span className="text-center font-semibold text-foreground leading-tight">
                      {e.nome}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {erro && (
              <p className="text-center text-vermelho-kids text-sm mt-6">
                {erro}
              </p>
            )}
          </>
        )}

        {/* ---- Câmera ---- */}
        {view === 'camera' && selected && (
          <div className="max-w-md mx-auto flex flex-col items-center gap-4">
            <div
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full font-semibold',
                tipo === 'entrada'
                  ? 'bg-verde-pipa/30 text-roxo-titulo'
                  : 'bg-amarelo-pipa/30 text-roxo-titulo'
              )}
            >
              {tipo === 'entrada' ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              Registrar {tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA'}
            </div>
            <p className="text-lg font-bold text-foreground text-center">
              {selected.nome}
            </p>

            <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black/80 border border-border/60">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover -scale-x-100"
              />
              {camError && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white bg-black/70">
                  {camError}
                </div>
              )}
            </div>

            {/* Status da localização (comprova que bateu na clínica) */}
            <div
              className={cn(
                'flex items-center gap-1.5 text-xs',
                geoStatus === 'ok'
                  ? 'text-verde-pipa'
                  : geoStatus === 'sem'
                    ? 'text-amarelo-pipa'
                    : 'text-muted-foreground'
              )}
            >
              {geoStatus === 'sem' ? (
                <MapPinOff className="w-3.5 h-3.5" />
              ) : (
                <MapPin className="w-3.5 h-3.5" />
              )}
              {geoStatus === 'ok' &&
                `Localização capturada${
                  coords ? ` (±${Math.round(coords.precisao)}m)` : ''
                }`}
              {geoStatus === 'pendente' && 'Obtendo localização...'}
              {geoStatus === 'sem' && 'Sem localização (registro sem GPS)'}
            </div>

            {erro && <p className="text-vermelho-kids text-sm">{erro}</p>}

            <div className="flex gap-3 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={voltarLista}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => void capturar()}
                disabled={saving || !!camError}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                Registrar
              </Button>
            </div>
          </div>
        )}

        {/* ---- Confirmação ---- */}
        {view === 'ok' && selected && (
          <div className="max-w-md mx-auto flex flex-col items-center gap-4 py-16 text-center">
            <CheckCircle2 className="w-20 h-20 text-verde-pipa" />
            <p className="text-2xl font-bold text-foreground">
              {tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada!
            </p>
            <p className="text-lg text-muted-foreground">
              {selected.nome}
              {doneAt ? ` · ${horaBR(doneAt)}` : ''}
            </p>
            <Button
              variant="outline"
              className="gap-2 mt-2"
              onClick={voltarLista}
            >
              <RotateCcw className="w-4 h-4" />
              Registrar outro
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

PontoKiosk.displayName = 'PontoKiosk';
