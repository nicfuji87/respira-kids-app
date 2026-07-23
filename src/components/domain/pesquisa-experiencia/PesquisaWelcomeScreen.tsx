// AI dev note: Tela inicial da pesquisa.
// Aviso de anonimato + botão "Começar". Sem coração/emoji e sem frase de afeto:
// o que aparece antes da 1ª pergunta define o clima em que ela é respondida
// (priming). Aqui a mensagem é a neutralidade — "não existe resposta certa".

import React from 'react';
import { Button } from '@/components/primitives/button';
import { Lock, Clock } from 'lucide-react';

interface PesquisaWelcomeScreenProps {
  onStart: () => void;
}

export const PesquisaWelcomeScreen = React.memo<PesquisaWelcomeScreenProps>(
  ({ onStart }) => {
    return (
      <div className="w-full max-w-xl mx-auto flex flex-col items-center text-center space-y-8 py-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        {/* Ilustração / Logo grande */}
        <div className="relative">
          <div className="absolute inset-0 bg-azul-respira/30 blur-2xl rounded-full animate-respira-pulse" />
          <div className="relative bg-card rounded-full p-6 shadow-lg">
            <img
              src="/images/logos/icone-respira-kids.png"
              alt="Respira Kids"
              className="h-20 w-20 md:h-24 md:w-24"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        </div>

        {/* Mensagem principal */}
        <div className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
            Queremos conhecer melhor sua família
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            Não existe resposta certa nem errada — o que ajuda é a sua opinião
            sincera.
          </p>
        </div>

        {/* Badges de confiança */}
        <div className="flex flex-col sm:flex-row gap-3 text-sm">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-azul-respira/10 text-azul-respira">
            <Clock className="w-4 h-4" />
            <span className="font-medium">Menos de 3 minutos</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-verde-pipa/15 text-roxo-titulo">
            <Lock className="w-4 h-4" />
            <span className="font-medium">100% anônima</span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground/80 max-w-md leading-relaxed">
          Não pedimos seu nome, telefone ou e-mail. Cada resposta nos ajuda a
          cuidar ainda melhor das famílias Respira Kids.
        </p>

        {/* Botão Começar */}
        <Button
          size="lg"
          onClick={onStart}
          className="w-full sm:w-auto min-w-[220px] h-14 text-base rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
        >
          Começar
        </Button>
      </div>
    );
  }
);

PesquisaWelcomeScreen.displayName = 'PesquisaWelcomeScreen';
