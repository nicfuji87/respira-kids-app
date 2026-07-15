// AI dev note: Fluxo de registro de ponto do estagiário (usado inline na aba
// "Ponto eletrônico" e também em tela cheia no tablet). Passos:
//   lista de estagiários -> [se SAÍDA: checklist do turno] -> câmera (foto-
//   comprovante + GPS; se ENTRADA mostra lembrete curto) -> confirmação.
// Roda sob a sessão logada (admin/secretaria); o estagiário não tem acesso.
// registradoPor = qual acesso registrou (auditoria). Checklist só na saída.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Camera,
  CameraOff,
  X,
  CheckCircle2,
  LogIn,
  LogOut,
  RotateCcw,
  MapPin,
  MapPinOff,
  CheckSquare,
  Square,
  ClipboardCheck,
  ListChecks,
  Ban,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Textarea } from '@/components/primitives/textarea';
import { cn } from '@/lib/utils';
import {
  fetchEstagiariosAtivos,
  fetchPontosHoje,
  proximaBatida,
  uploadPontoFoto,
  registrarPonto,
  getGeolocation,
  fetchGeofence,
  avaliarCerca,
  type EstagiarioAtivo,
  type PontoTipo,
  type Coords,
  type GeofenceConfig,
} from '@/lib/estagio-pontos-api';
import {
  CHECKLIST_SAIDA,
  LEMBRETE_ENTRADA,
  type ChecklistData,
} from '@/lib/estagio-ponto-checklist';

interface Props {
  registradoPor: string | null;
  /** Se fornecido, mostra o botão "Sair da tela cheia" (uso no tablet). */
  onClose?: () => void;
}

type View =
  | 'lista'
  | 'verificando'
  | 'bloqueado'
  | 'checklist'
  | 'camera'
  | 'ok';

function iniciais(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function horaBR(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export const PontoRegistro: React.FC<Props> = ({ registradoPor, onClose }) => {
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
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [observacao, setObservacao] = useState('');
  const [camAttempt, setCamAttempt] = useState(0);
  const [geofence, setGeofence] = useState<GeofenceConfig | null>(null);
  const [bloqueio, setBloqueio] = useState<{
    motivo: 'fora' | 'sem_gps';
    distancia?: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Carrega a lista de estagiários ativos.
  useEffect(() => {
    let cancel = false;
    setLoadingLista(true);
    (async () => {
      try {
        const [data, cerca] = await Promise.all([
          fetchEstagiariosAtivos(),
          fetchGeofence(),
        ]);
        if (!cancel) {
          setEstagiarios(data);
          setGeofence(cerca);
        }
      } catch {
        if (!cancel) setErro('Não consegui carregar os estagiários.');
      } finally {
        if (!cancel) setLoadingLista(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Liga a câmera + pede localização quando entra na view de câmera.
  useEffect(() => {
    if (view !== 'camera') return;
    let cancel = false;

    // Com cerca ativa, a localização já foi validada em escolher() e coords já
    // está setado; aqui só pedimos GPS quando NÃO há cerca (registro best-effort).
    if (!geofence?.ativo) {
      setGeoStatus('pendente');
      setCoords(null);
      void getGeolocation().then((c) => {
        if (cancel) return;
        setCoords(c);
        setGeoStatus(c ? 'ok' : 'sem');
      });
    }

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
  }, [view, stopCamera, geofence, camAttempt]);

  // Volta para a lista após confirmar.
  useEffect(() => {
    if (view !== 'ok') return;
    const t = setTimeout(() => {
      setView('lista');
      setSelected(null);
    }, 3500);
    return () => clearTimeout(t);
  }, [view]);

  const voltarLista = useCallback(() => {
    stopCamera();
    setView('lista');
    setSelected(null);
    setChecklist({});
    setObservacao('');
    setErro(null);
    setBloqueio(null);
  }, [stopCamera]);

  const prosseguir = useCallback((t: PontoTipo) => {
    if (t === 'saida') {
      const init: Record<string, boolean> = {};
      CHECKLIST_SAIDA.forEach((i) => {
        init[i.id] = false;
      });
      setChecklist(init);
      setObservacao('');
      setView('checklist');
    } else {
      setView('camera');
    }
  }, []);

  const escolher = useCallback(
    async (e: EstagiarioAtivo) => {
      setSelected(e);
      setErro(null);
      setBloqueio(null);
      setCoords(null);
      setGeoStatus('pendente');
      let t: PontoTipo = 'entrada';
      try {
        const hoje = await fetchPontosHoje(e.id);
        t = proximaBatida(hoje);
      } catch {
        t = 'entrada';
      }
      setTipo(t);

      // Cerca ativa: valida a localização ANTES de abrir a câmera.
      if (geofence?.ativo) {
        setView('verificando');
        const c = await getGeolocation();
        if (!c) {
          setBloqueio({ motivo: 'sem_gps' });
          setView('bloqueado');
          return;
        }
        const res = avaliarCerca(geofence, c);
        if (!res.dentro) {
          setBloqueio({ motivo: 'fora', distancia: res.distancia });
          setView('bloqueado');
          return;
        }
        setCoords(c);
        setGeoStatus('ok');
      }
      prosseguir(t);
    },
    [geofence, prosseguir]
  );

  const capturar = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !selected) return;
    const vw = video.videoWidth || 480;
    const vh = video.videoHeight || 480;
    const size = Math.min(vw, vh);
    // A foto é só comprovante de presença — reduz para um quadrado pequeno e
    // comprime bem (JPEG q0.5) para não ocupar espaço no bucket (~10-20KB).
    const OUT = Math.min(size, 320);
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, OUT, OUT);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.5)
    );
    if (!blob) {
      setErro('Falha ao capturar a foto. Tente novamente.');
      return;
    }
    setSaving(true);
    setErro(null);
    try {
      const path = await uploadPontoFoto(selected.id, blob);
      const checklistData: ChecklistData | null =
        tipo === 'saida'
          ? { items: checklist, observacao: observacao.trim() || undefined }
          : null;
      await registrarPonto({
        candidaturaId: selected.id,
        tipo,
        fotoPath: path,
        registradoPor,
        coords,
        checklist: checklistData,
      });
      stopCamera();
      setDoneAt(new Date());
      setView('ok');
    } catch {
      setErro('Não consegui registrar o ponto. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }, [
    selected,
    tipo,
    checklist,
    observacao,
    registradoPor,
    coords,
    stopCamera,
  ]);

  const feitos = CHECKLIST_SAIDA.filter((i) => checklist[i.id]).length;

  return (
    <div className="flex flex-col">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-border/60">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Ponto eletrônico
          </h2>
          {view === 'lista' && (
            <p className="text-sm text-muted-foreground">
              Toque no seu nome para registrar entrada ou saída.
            </p>
          )}
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-2">
            <X className="w-4 h-4" />
            Sair da tela cheia
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-[260px]">
        {/* ---- Lista ---- */}
        {view === 'lista' &&
          (loadingLista ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
            </div>
          ) : estagiarios.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              Nenhum estagiário ativo. Aprove candidaturas para habilitar o
              ponto.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
                {estagiarios.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => void escolher(e)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-border/60 bg-card p-6 min-h-[150px]',
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
              {erro && (
                <p className="text-center text-vermelho-kids text-sm mt-6">
                  {erro}
                </p>
              )}
            </>
          ))}

        {/* ---- Checklist de saída ---- */}
        {view === 'checklist' && selected && (
          <div className="max-w-lg mx-auto space-y-4">
            <div className="flex items-center gap-2 text-roxo-titulo">
              <ClipboardCheck className="w-5 h-5" />
              <span className="font-semibold">
                Antes de sair, confirme o turno — {selected.nome}
              </span>
            </div>
            <div className="space-y-2">
              {CHECKLIST_SAIDA.map((item) => {
                const on = !!checklist[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setChecklist((p) => ({ ...p, [item.id]: !p[item.id] }))
                    }
                    className={cn(
                      'w-full flex items-start gap-3 text-left rounded-xl border p-3 transition-colors',
                      on
                        ? 'border-verde-pipa bg-verde-pipa/10'
                        : 'border-border/60 bg-card hover:border-azul-respira/50'
                    )}
                  >
                    {on ? (
                      <CheckSquare className="w-5 h-5 text-verde-pipa shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <span className="text-sm text-foreground">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Observações do turno (opcional)
              </label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Algo que a equipe precise saber?"
                rows={2}
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={voltarLista}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={() => setView('camera')}
              >
                <ListChecks className="w-4 h-4" />
                Continuar ({feitos}/{CHECKLIST_SAIDA.length})
              </Button>
            </div>
          </div>
        )}

        {/* ---- Verificando localização ---- */}
        {view === 'verificando' && (
          <div className="max-w-md mx-auto flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-azul-respira" />
            <p>Verificando se você está na clínica...</p>
          </div>
        )}

        {/* ---- Bloqueado (fora da cerca / sem GPS) ---- */}
        {view === 'bloqueado' && selected && (
          <div className="max-w-md mx-auto flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-vermelho-kids/10">
              <Ban className="w-10 h-10 text-vermelho-kids" />
            </div>
            <p className="text-xl font-bold text-foreground">
              Ponto indisponível aqui
            </p>
            <p className="text-muted-foreground">
              {bloqueio?.motivo === 'sem_gps'
                ? 'Não foi possível confirmar sua localização. Ative o GPS/localização do tablet e tente novamente.'
                : `Você está fora do raio da clínica${
                    bloqueio?.distancia
                      ? ` (~${Math.round(bloqueio.distancia)}m de distância)`
                      : ''
                  }. O ponto só pode ser registrado na clínica.`}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={voltarLista}>
                Voltar
              </Button>
              <Button className="gap-2" onClick={() => void escolher(selected)}>
                <RotateCcw className="w-4 h-4" />
                Tentar novamente
              </Button>
            </div>
          </div>
        )}

        {/* ---- Câmera ---- */}
        {view === 'camera' && selected && (
          <div className="max-w-[300px] mx-auto flex flex-col items-center gap-3">
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

            {/* Lembrete das atividades (só na entrada) */}
            {tipo === 'entrada' && (
              <div className="w-full rounded-xl border border-azul-respira/30 bg-azul-respira/5 p-3">
                <p className="text-xs font-semibold text-azul-respira mb-1.5">
                  Lembrete do turno
                </p>
                <ul className="space-y-1">
                  {LEMBRETE_ENTRADA.map((l) => (
                    <li
                      key={l}
                      className="text-xs text-foreground flex items-start gap-1.5"
                    >
                      <span className="text-azul-respira">•</span>
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {camError ? (
              <div className="w-full rounded-2xl border border-vermelho-kids/30 bg-vermelho-kids/5 p-5 text-center space-y-3">
                <CameraOff className="w-8 h-8 text-vermelho-kids mx-auto" />
                <p className="text-sm text-foreground">{camError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    setCamError(null);
                    setCamAttempt((a) => a + 1);
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black/80 border border-border/60">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
              </div>
            )}

            {/* Status da localização */}
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
                onClick={
                  tipo === 'saida' ? () => setView('checklist') : voltarLista
                }
                disabled={saving}
              >
                Voltar
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
          <div className="max-w-md mx-auto flex flex-col items-center gap-4 py-12 text-center">
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

PontoRegistro.displayName = 'PontoRegistro';
