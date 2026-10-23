// AI dev note: Ponto pelo celular da estagiária. Rota pública #/ponto (sem login
// do app): ela entra com o login + senha que o admin cadastrou na aba Ponto. Só
// serve para bater ponto e ler/deixar recados entre turnos — mais nada.
// Fluxo: login -> início (recados + batidas de hoje) -> localização (obrigatória,
// precisa estar na cerca da clínica) -> [saída: checklist + recado] -> selfie -> ok.
// A cerca é conferida aqui (para dar o aviso na hora) e de novo no servidor.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  MapPinOff,
  Camera,
  CameraOff,
  RotateCcw,
  CheckCircle2,
  CheckSquare,
  Square,
  MessageSquareText,
  ClipboardCheck,
  Ban,
  Power,
} from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Label } from '@/components/primitives/label';
import { Textarea } from '@/components/primitives/textarea';
import { cn } from '@/lib/utils';
import {
  CelularError,
  fetchStatus,
  getToken,
  login,
  logout,
  pedirLocalizacao,
  registrar,
  type GeoFalha,
  type StatusCelular,
} from '@/lib/estagio-celular-api';
import {
  avaliarCerca,
  type Coords,
  type GeofenceConfig,
  type PontoTipo,
} from '@/lib/estagio-pontos-api';
import {
  CHECKLIST_SAIDA,
  LEMBRETE_ENTRADA,
} from '@/lib/estagio-ponto-checklist';

type Fase =
  | 'carregando'
  | 'login'
  | 'inicio'
  | 'localizando'
  | 'sem_local'
  | 'fora'
  | 'checklist'
  | 'camera'
  | 'ok';

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function quando(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const dia = mesmoDia(d, hoje)
    ? 'hoje'
    : mesmoDia(d, ontem)
      ? 'ontem'
      : d.toLocaleDateString('pt-BR', { weekday: 'long' });
  return `${dia} às ${hora(iso)}`;
}

const MSG_ERRO: Record<string, string> = {
  LOGIN_INVALIDO: 'Login ou senha incorretos.',
  BLOQUEADO:
    'Muitas tentativas erradas. Espere 15 minutos ou peça para a coordenação trocar sua senha.',
  SEM_LOCALIZACAO: 'Não recebemos sua localização. Ative e tente de novo.',
  CERCA_DESLIGADA:
    'A localização da clínica ainda não foi configurada. Avise a coordenação ou use o tablet da recepção.',
  ACABOU_DE_REGISTRAR: 'Você acabou de registrar. Espere um minuto.',
  FALHA: 'Sem conexão com o sistema. Confira a internet e tente de novo.',
};

// =====================================================================
// Câmera frontal (selfie comprimida, como no quiosque)
// =====================================================================
const SelfieCamera: React.FC<{
  onFoto: (blob: Blob) => void;
  disabled?: boolean;
  botao: React.ReactNode;
  onVoltar: () => void;
}> = ({ onFoto, disabled, botao, onVoltar }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancel = false;
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
        setErro(null);
      } catch {
        setErro(
          'Não consegui abrir a câmera. Permita o acesso à câmera para este site e tente de novo.'
        );
      }
    })();
    return () => {
      cancel = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [tentativa]);

  const capturar = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const vw = video.videoWidth || 480;
    const vh = video.videoHeight || 480;
    const size = Math.min(vw, vh);
    // Comprovante: quadrado pequeno + JPEG q0.5 (~10-20KB no bucket).
    const OUT = Math.min(size, 320);
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(
      video,
      (vw - size) / 2,
      (vh - size) / 2,
      size,
      size,
      0,
      0,
      OUT,
      OUT
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.5)
    );
    if (blob) onFoto(blob);
    else setErro('Falha ao tirar a foto. Tente de novo.');
  }, [onFoto]);

  return (
    <div className="space-y-3">
      {erro ? (
        <div className="rounded-2xl border border-vermelho-kids/30 bg-vermelho-kids/5 p-5 text-center space-y-3">
          <CameraOff className="w-8 h-8 text-vermelho-kids mx-auto" />
          <p className="text-sm text-foreground">{erro}</p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setTentativa((t) => t + 1)}
          >
            <RotateCcw className="w-4 h-4" />
            Tentar de novo
          </Button>
        </div>
      ) : (
        <div className="relative w-full max-w-[300px] mx-auto aspect-square rounded-2xl overflow-hidden bg-black/80">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100"
          />
        </div>
      )}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1 h-12"
          onClick={onVoltar}
          disabled={disabled}
        >
          Voltar
        </Button>
        <Button
          className="flex-1 h-12 gap-2"
          onClick={() => void capturar()}
          disabled={disabled || !!erro}
        >
          {botao}
        </Button>
      </div>
    </div>
  );
};

// =====================================================================
// Página
// =====================================================================
export const PontoCelularPage: React.FC = () => {
  const [fase, setFase] = useState<Fase>('carregando');
  const [status, setStatus] = useState<StatusCelular | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // login
  const [loginTxt, setLoginTxt] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);

  // batida
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoFalha, setGeoFalha] = useState<GeoFalha | null>(null);
  const [distancia, setDistancia] = useState<number | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [recado, setRecado] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{
    tipo: PontoTipo;
    registradoEm: string;
    fotoOk: boolean;
  } | null>(null);

  const tratarErro = useCallback((e: unknown) => {
    const codigo = e instanceof CelularError ? e.codigo : 'FALHA';
    if (codigo === 'SESSAO_INVALIDA') {
      setStatus(null);
      setErro('Sua sessão expirou. Entre de novo.');
      setFase('login');
      return;
    }
    if (codigo === 'FORA_DA_CLINICA') {
      const d = (e as CelularError).extra.distancia_m;
      setDistancia(typeof d === 'number' ? d : null);
      setFase('fora');
      return;
    }
    setErro(MSG_ERRO[codigo] ?? MSG_ERRO.FALHA);
  }, []);

  const carregar = useCallback(async () => {
    if (!getToken()) {
      setFase('login');
      return;
    }
    try {
      const s = await fetchStatus();
      setStatus(s);
      setFase('inicio');
    } catch (e) {
      tratarErro(e);
      if (!(e instanceof CelularError && e.codigo === 'SESSAO_INVALIDA')) {
        setFase('inicio');
      }
    }
  }, [tratarErro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Volta sozinho para o início depois de confirmar.
  useEffect(() => {
    if (fase !== 'ok') return;
    const t = setTimeout(() => void carregar(), 8000);
    return () => clearTimeout(t);
  }, [fase, carregar]);

  const entrar = useCallback(async () => {
    setErro(null);
    setEntrando(true);
    try {
      await login(loginTxt, senha);
      setSenha('');
      await carregar();
    } catch (e) {
      tratarErro(e);
    } finally {
      setEntrando(false);
    }
  }, [loginTxt, senha, carregar, tratarErro]);

  const sair = useCallback(async () => {
    await logout();
    setStatus(null);
    setFase('login');
  }, []);

  const iniciarBatida = useCallback(async () => {
    if (!status) return;
    setErro(null);
    setGeoFalha(null);
    setDistancia(null);
    setFase('localizando');
    const r = await pedirLocalizacao();
    if ('falha' in r) {
      setGeoFalha(r.falha);
      setFase('sem_local');
      return;
    }
    const cerca = status.cerca;
    if (!cerca?.ativo) {
      setErro(MSG_ERRO.CERCA_DESLIGADA);
      setFase('inicio');
      return;
    }
    const aval = avaliarCerca(cerca as GeofenceConfig, r.coords);
    if (!aval.dentro) {
      setDistancia(aval.distancia);
      setFase('fora');
      return;
    }
    setCoords(r.coords);
    if (status.proxima === 'saida') {
      const init: Record<string, boolean> = {};
      CHECKLIST_SAIDA.forEach((i) => {
        init[i.id] = false;
      });
      setChecklist(init);
      setRecado('');
      setFase('checklist');
    } else {
      setFase('camera');
    }
  }, [status]);

  const enviar = useCallback(
    async (foto: Blob) => {
      if (!status || !coords) return;
      setEnviando(true);
      setErro(null);
      try {
        const saida = status.proxima === 'saida';
        const r = await registrar({
          coords,
          foto,
          checklist: saida ? { items: checklist } : null,
          recado: saida ? recado : undefined,
          recadosLidos: saida ? undefined : status.recados.map((x) => x.id),
        });
        setResultado(r);
        setFase('ok');
      } catch (e) {
        tratarErro(e);
      } finally {
        setEnviando(false);
      }
    },
    [status, coords, checklist, recado, tratarErro]
  );

  const proxima = status?.proxima ?? 'entrada';
  const primeiroNome = status?.nome.split(' ')[0] ?? '';
  const feitos = CHECKLIST_SAIDA.filter((i) => checklist[i.id]).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-bege-fundo to-background">
      <div className="mx-auto w-full max-w-md px-4 py-5 space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/images/logos/icone-respira-kids.png"
              alt=""
              className="w-9 h-9"
            />
            <div className="leading-tight">
              <p className="font-bold text-roxo-titulo">Ponto do estágio</p>
              <p className="text-xs text-muted-foreground">Respira Kids</p>
            </div>
          </div>
          {status && fase === 'inicio' && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => void sair()}
            >
              <Power className="w-4 h-4" />
              Sair
            </Button>
          )}
        </div>

        {fase === 'carregando' && (
          <div className="flex justify-center py-24 text-muted-foreground">
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        )}

        {/* ---------------- Login ---------------- */}
        {fase === 'login' && (
          <form
            className="rounded-2xl border border-border/60 bg-card p-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void entrar();
            }}
          >
            <div>
              <h1 className="text-xl font-bold text-foreground">Entrar</h1>
              <p className="text-sm text-muted-foreground">
                Use o login e a senha que a coordenação te passou.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ponto-login">Login</Label>
              <Input
                id="ponto-login"
                value={loginTxt}
                onChange={(e) => setLoginTxt(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ponto-senha">Senha</Label>
              <Input
                id="ponto-senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                className="h-12 text-base"
              />
            </div>
            {erro && <p className="text-sm text-vermelho-kids">{erro}</p>}
            <Button
              type="submit"
              className="w-full h-12 text-base"
              disabled={entrando || !loginTxt.trim() || !senha}
            >
              {entrando ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Entrar'
              )}
            </Button>
          </form>
        )}

        {/* ---------------- Início ---------------- */}
        {fase === 'inicio' && status && (
          <>
            <p className="text-lg font-semibold text-foreground">
              Olá, {primeiroNome}!
            </p>

            {status.recados.length > 0 && (
              <div className="rounded-2xl border-2 border-amarelo-pipa bg-amarelo-pipa/15 p-4 space-y-3">
                <div className="flex items-center gap-2 font-semibold text-roxo-titulo">
                  <MessageSquareText className="w-5 h-5" />
                  Recado do turno anterior
                </div>
                {status.recados.map((r) => (
                  <div key={r.id} className="space-y-0.5">
                    <p className="text-base text-foreground whitespace-pre-wrap">
                      {r.texto}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.autor}, {quando(r.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Hoje</p>
              {status.hoje.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma batida ainda.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {status.hoje.map((b) => (
                    <li
                      key={b.registrado_em}
                      className="flex items-center gap-2 text-sm"
                    >
                      {b.tipo === 'entrada' ? (
                        <LogIn className="w-4 h-4 text-verde-pipa" />
                      ) : (
                        <LogOut className="w-4 h-4 text-amarelo-pipa" />
                      )}
                      <span className="font-medium text-foreground">
                        {b.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                      </span>
                      <span className="text-muted-foreground">
                        {hora(b.registrado_em)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                className={cn(
                  'w-full h-14 text-base gap-2',
                  proxima === 'saida' &&
                    'bg-roxo-titulo hover:bg-roxo-titulo/90'
                )}
                onClick={() => void iniciarBatida()}
              >
                {proxima === 'entrada' ? (
                  <LogIn className="w-5 h-5" />
                ) : (
                  <LogOut className="w-5 h-5" />
                )}
                Registrar {proxima === 'entrada' ? 'entrada' : 'saída'}
              </Button>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                Precisa da localização ligada e estar na clínica.
              </p>
              {erro && <p className="text-sm text-vermelho-kids">{erro}</p>}
            </div>

            {status.meu_recado && (
              <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Seu último recado
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {status.meu_recado.texto}
                </p>
                <p className="text-xs text-muted-foreground">
                  {status.meu_recado.lido_por.length
                    ? `Lido por ${status.meu_recado.lido_por
                        .map((l) => `${l.nome} (${quando(l.lido_em)})`)
                        .join(', ')}`
                    : 'Ainda não foi lido.'}
                </p>
              </div>
            )}
          </>
        )}

        {/* Sem sessão carregada (erro de rede no início) */}
        {fase === 'inicio' && !status && (
          <div className="rounded-2xl border border-border/60 bg-card p-5 text-center space-y-3">
            <p className="text-sm text-foreground">{erro ?? MSG_ERRO.FALHA}</p>
            <Button variant="outline" onClick={() => void carregar()}>
              Tentar de novo
            </Button>
          </div>
        )}

        {/* ---------------- Localizando ---------------- */}
        {fase === 'localizando' && (
          <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-azul-respira" />
            <p>Conferindo se você está na clínica...</p>
            <p className="text-xs">
              Se o celular perguntar, toque em <strong>Permitir</strong>.
            </p>
          </div>
        )}

        {/* ---------------- Sem localização ---------------- */}
        {fase === 'sem_local' && (
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amarelo-pipa/20">
                <MapPinOff className="w-8 h-8 text-amarelo-pipa" />
              </div>
              <p className="text-lg font-bold text-foreground">
                Ative a localização
              </p>
              <p className="text-sm text-muted-foreground">
                {geoFalha === 'negado'
                  ? 'O navegador está bloqueando sua localização. Sem ela o ponto não é registrado.'
                  : 'Não conseguimos pegar sua localização. Confira se o GPS está ligado.'}
              </p>
            </div>
            <div className="text-sm text-foreground space-y-2 rounded-xl bg-muted/50 p-3">
              <p>
                <strong>Android (Chrome):</strong> ligue a Localização na barra
                de atalhos do celular. Depois toque no ícone ao lado do endereço
                do site → Permissões → Localização → Permitir.
              </p>
              <p>
                <strong>iPhone:</strong> Ajustes → Privacidade e Segurança →
                Serviços de Localização → ligado; e em Safari (ou Chrome) → “Ao
                Usar o App”. Depois recarregue esta página.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={() => setFase('inicio')}
              >
                Voltar
              </Button>
              <Button
                className="flex-1 h-12 gap-2"
                onClick={() => void iniciarBatida()}
              >
                <RotateCcw className="w-4 h-4" />
                Tentar de novo
              </Button>
            </div>
          </div>
        )}

        {/* ---------------- Fora da clínica ---------------- */}
        {fase === 'fora' && (
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-vermelho-kids/10 mx-auto">
              <Ban className="w-8 h-8 text-vermelho-kids" />
            </div>
            <p className="text-lg font-bold text-foreground">
              Você não está na clínica
            </p>
            <p className="text-sm text-muted-foreground">
              O ponto só pode ser registrado dentro da clínica
              {distancia ? ` (você está a ~${Math.round(distancia)} m)` : ''}.
              Se você já está aqui, espere alguns segundos para o GPS melhorar,
              chegue perto de uma janela e tente de novo.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={() => setFase('inicio')}
              >
                Voltar
              </Button>
              <Button
                className="flex-1 h-12 gap-2"
                onClick={() => void iniciarBatida()}
              >
                <RotateCcw className="w-4 h-4" />
                Tentar de novo
              </Button>
            </div>
          </div>
        )}

        {/* ---------------- Checklist + recado (saída) ---------------- */}
        {fase === 'checklist' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-roxo-titulo font-semibold">
              <ClipboardCheck className="w-5 h-5" />
              Antes de sair, confirme o turno
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
                        : 'border-border/60 bg-card'
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
              <Label
                htmlFor="ponto-recado"
                className="flex items-center gap-1.5"
              >
                <MessageSquareText className="w-4 h-4 text-azul-respira" />
                Recado para o próximo turno (opcional)
              </Label>
              <Textarea
                id="ponto-recado"
                value={recado}
                onChange={(e) => setRecado(e.target.value)}
                placeholder="Ex.: lembrar de finalizar as evoluções da tarde"
                rows={3}
                maxLength={1000}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">
                A estagiária do próximo turno vê quando bater a entrada.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={() => setFase('inicio')}
              >
                Cancelar
              </Button>
              <Button className="flex-1 h-12" onClick={() => setFase('camera')}>
                Continuar ({feitos}/{CHECKLIST_SAIDA.length})
              </Button>
            </div>
          </div>
        )}

        {/* ---------------- Selfie ---------------- */}
        {fase === 'camera' && status && (
          <div className="space-y-3">
            <div
              className={cn(
                'mx-auto w-fit flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-roxo-titulo',
                proxima === 'entrada'
                  ? 'bg-verde-pipa/30'
                  : 'bg-amarelo-pipa/30'
              )}
            >
              {proxima === 'entrada' ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              Registrar {proxima === 'entrada' ? 'ENTRADA' : 'SAÍDA'}
            </div>

            {proxima === 'entrada' && status.recados.length > 0 && (
              <div className="rounded-xl border-2 border-amarelo-pipa bg-amarelo-pipa/15 p-3 space-y-2">
                <p className="text-xs font-semibold text-roxo-titulo">
                  Recado do turno anterior
                </p>
                {status.recados.map((r) => (
                  <p key={r.id} className="text-sm text-foreground">
                    {r.texto}{' '}
                    <span className="text-xs text-muted-foreground">
                      ({r.autor})
                    </span>
                  </p>
                ))}
              </div>
            )}

            {proxima === 'entrada' && (
              <div className="rounded-xl border border-azul-respira/30 bg-azul-respira/5 p-3">
                <p className="text-xs font-semibold text-azul-respira mb-1.5">
                  Lembrete do turno
                </p>
                <ul className="space-y-1">
                  {LEMBRETE_ENTRADA.map((l) => (
                    <li
                      key={l}
                      className="text-xs text-foreground flex gap-1.5"
                    >
                      <span className="text-azul-respira">•</span>
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <SelfieCamera
              onFoto={(b) => void enviar(b)}
              disabled={enviando}
              onVoltar={() =>
                setFase(proxima === 'saida' ? 'checklist' : 'inicio')
              }
              botao={
                enviando ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    Tirar foto e registrar
                  </>
                )
              }
            />
            {coords && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-verde-pipa">
                <MapPin className="w-3.5 h-3.5" />
                Você está na clínica (±{Math.round(coords.precisao)} m)
              </p>
            )}
            {erro && (
              <p className="text-sm text-vermelho-kids text-center">{erro}</p>
            )}
          </div>
        )}

        {/* ---------------- Confirmado ---------------- */}
        {fase === 'ok' && resultado && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="w-20 h-20 text-verde-pipa" />
            <p className="text-2xl font-bold text-foreground">
              {resultado.tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada!
            </p>
            <p className="text-lg text-muted-foreground">
              {hora(resultado.registradoEm)}
            </p>
            {resultado.tipo === 'saida' && recado.trim() && (
              <p className="text-sm text-muted-foreground">
                Seu recado foi deixado para o próximo turno.
              </p>
            )}
            {!resultado.fotoOk && (
              <p className="text-xs text-amarelo-pipa">
                O ponto valeu, mas a foto não subiu (internet fraca).
              </p>
            )}
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => void carregar()}
            >
              Voltar ao início
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PontoCelularPage;
