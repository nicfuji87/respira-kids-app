// AI dev note: Tela final emocional da pesquisa.
// Coração animado + mensagem de agradecimento + CTA opcional Instagram.

import React from 'react';
import { Button } from '@/components/primitives/button';
import { Heart, Instagram } from 'lucide-react';

interface PesquisaSuccessScreenProps {
  onInstagramClick?: () => void;
}

export const PesquisaSuccessScreen = React.memo<PesquisaSuccessScreenProps>(
  ({ onInstagramClick }) => {
    const handleInstagram = () => {
      if (onInstagramClick) {
        onInstagramClick();
      } else {
        window.open(
          'https://www.instagram.com/respira.kids/',
          '_blank',
          'noopener,noreferrer'
        );
      }
    };

    return (
      <div className="w-full max-w-xl mx-auto flex flex-col items-center text-center space-y-8 py-6 animate-in fade-in slide-in-from-bottom-3 duration-700">
        {/* Coração pulsante */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-vermelho-kids/30 blur-3xl animate-respira-pulse" />
          <div className="relative bg-card rounded-full p-8 shadow-xl">
            <Heart
              className="w-20 h-20 md:w-24 md:h-24 text-vermelho-kids fill-vermelho-kids animate-respira-pulse"
              strokeWidth={1.5}
            />
          </div>
        </div>

        {/* Mensagem principal */}
        <div className="space-y-3 max-w-lg">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
            Obrigada por compartilhar sua experiência
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            Cada resposta nos ajuda a cuidar ainda melhor das famílias
            Respira&nbsp;Kids. 💙
          </p>
        </div>

        {/* CTA Instagram */}
        <div className="flex flex-col gap-3 w-full sm:w-auto pt-2">
          <Button
            size="lg"
            onClick={handleInstagram}
            className="w-full sm:w-auto min-w-[260px] h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
          >
            <Instagram className="w-5 h-5 mr-2" />
            Acompanhe @respira.kids
          </Button>
        </div>

        <p className="text-xs text-muted-foreground/70 max-w-sm">
          Esta resposta foi enviada de forma totalmente anônima.
        </p>
      </div>
    );
  }
);

PesquisaSuccessScreen.displayName = 'PesquisaSuccessScreen';
