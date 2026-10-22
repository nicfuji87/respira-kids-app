// AI dev note: Player das reuniões com as estagiárias. Overlay em tela cheia
// (cobre a sidebar, igual ao quiosque do ponto) + Fullscreen API best-effort.
// Navegação: setas/espaço/PageUp/PageDown, Home/End, Esc sai; no tablet,
// deslizar para os lados ou tocar nas metades da tela. Os números ao vivo vêm
// de fn_estagio_bonus_evolucoes e atualizam a cada 60s.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/utils';
import type { Reuniao } from '@/lib/estagio-reunioes';
import {
  fetchBonusEvolucoes,
  type BonusEvolucoes,
} from '@/lib/estagio-reunioes-api';
import { ReuniaoSlide, type DadosAoVivo } from './ReuniaoSlides';

const ATUALIZAR_MS = 60_000;

interface Props {
  reuniao: Reuniao;
  onClose: () => void;
}

export const ApresentacaoReuniao: React.FC<Props> = ({ reuniao, onClose }) => {
  const total = reuniao.slides.length;
  const [indice, setIndice] = useState(0);
  const [direcao, setDirecao] = useState<1 | -1>(1);
  const [dados, setDados] = useState<BonusEvolucoes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const toqueX = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const d = await fetchBonusEvolucoes();
      setDados(d);
      setErro(null);
    } catch (err) {
      console.error('[ApresentacaoReuniao] erro ao carregar números:', err);
      setErro('Verifique a conexão e toque em atualizar.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), ATUALIZAR_MS);
    return () => clearInterval(t);
  }, [carregar]);

  const ir = useCallback(
    (novo: number) => {
      const alvo = Math.max(0, Math.min(total - 1, novo));
      if (alvo === indice) return;
      setDirecao(alvo > indice ? 1 : -1);
      setIndice(alvo);
    },
    [total, indice]
  );

  const proximo = useCallback(() => ir(indice + 1), [ir, indice]);
  const anterior = useCallback(() => ir(indice - 1), [ir, indice]);

  const sair = useCallback(async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
    onClose();
  }, [onClose]);

  // Tela cheia do navegador ao abrir (best-effort; o overlay já cobre o app).
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        proximo();
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        anterior();
      } else if (e.key === 'Home') {
        ir(0);
      } else if (e.key === 'End') {
        ir(total - 1);
      } else if (e.key === 'Escape') {
        void sair();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [proximo, anterior, ir, total, sair]);

  const simulacao = dados ? dados.mes < reuniao.bonusInicio : false;
  const vivo: DadosAoVivo = { dados, carregando, erro, simulacao };
  const slide = reuniao.slides[indice];
  const progresso = ((indice + 1) / total) * 100;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-br from-bege-fundo via-background to-background"
      onTouchStart={(e) => {
        toqueX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const inicio = toqueX.current;
        toqueX.current = null;
        const fim = e.changedTouches[0]?.clientX;
        if (inicio == null || fim == null) return;
        const dx = fim - inicio;
        if (Math.abs(dx) > 60) {
          if (dx < 0) proximo();
          else anterior();
        }
      }}
    >
      {/* Progresso dos slides */}
      <div className="h-1.5 w-full bg-roxo-titulo/10">
        <div
          className="h-full bg-gradient-to-r from-azul-respira to-verde-pipa transition-[width] duration-500 ease-out"
          style={{ width: `${progresso}%` }}
        />
      </div>

      {/* Barra superior */}
      <div className="flex items-center gap-3 px-4 md:px-8 py-3">
        <p className="flex-1 min-w-0 truncate text-sm text-muted-foreground">
          {reuniao.titulo}
        </p>
        <span className="text-sm tabular-nums text-muted-foreground">
          {indice + 1} / {total}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void carregar()}
          disabled={carregando}
          aria-label="Atualizar números"
          title="Atualizar números"
        >
          <RefreshCw className={cn('w-5 h-5', carregando && 'animate-spin')} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void sair()}
          aria-label="Sair da apresentação"
          title="Sair (Esc)"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Slide */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="min-h-full flex items-center">
          <div
            key={indice}
            className={cn(
              'w-full max-w-5xl mx-auto px-5 md:px-10 py-4 md:py-6',
              'animate-in fade-in duration-300',
              direcao === 1 ? 'slide-in-from-right-8' : 'slide-in-from-left-8'
            )}
          >
            <ReuniaoSlide slide={slide} reuniao={reuniao} vivo={vivo} />
          </div>
        </div>
      </div>

      {/* Navegação */}
      <div className="flex items-center justify-between gap-4 px-4 md:px-8 py-4">
        <Button
          variant="outline"
          onClick={anterior}
          disabled={indice === 0}
          className="gap-2"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="hidden sm:inline">Anterior</span>
        </Button>
        <div className="flex items-center gap-1.5 overflow-hidden">
          {reuniao.slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => ir(i)}
              aria-label={`Ir para o slide ${i + 1}`}
              className={cn(
                'h-2.5 rounded-full transition-all',
                i === indice
                  ? 'w-7 bg-azul-respira'
                  : 'w-2.5 bg-roxo-titulo/20 hover:bg-roxo-titulo/40'
              )}
            />
          ))}
        </div>
        <Button
          onClick={indice === total - 1 ? () => void sair() : proximo}
          className="gap-2"
        >
          <span className="hidden sm:inline">
            {indice === total - 1 ? 'Encerrar' : 'Próximo'}
          </span>
          {indice === total - 1 ? (
            <X className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </Button>
      </div>
    </div>
  );
};

ApresentacaoReuniao.displayName = 'ApresentacaoReuniao';
