// AI dev note: Tela final do processo seletivo. Agradece + explica próximos passos
// e apresenta as regras/boas práticas de convivência da Respira Kids (visíveis a
// todo candidato que envia, para mostrar a cultura cedo e alinhar expectativas).

import React from 'react';
import {
  CheckCircle2,
  HeartHandshake,
  Clock,
  Users,
  Lock,
  Sparkles,
  Leaf,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface RegraBloco {
  icon: LucideIcon;
  titulo: string;
  cor: string; // classe de cor do ícone
  fundo: string; // classe de fundo do cartão
  itens: string[];
}

const BLOCOS: RegraBloco[] = [
  {
    icon: HeartHandshake,
    titulo: 'Com as crianças e famílias',
    cor: 'text-azul-respira',
    fundo: 'bg-azul-respira/10',
    itens: [
      'Acolhimento vem primeiro: paciência, calma e um sorriso mudam o atendimento.',
      'Fale com a criança na altura dela, com carinho e sem pressa.',
      'A família confia em nós num momento delicado — trate cada mãe e pai com empatia, mesmo os mais ansiosos.',
      'Nunca prometa resultados ou prazos por conta própria; sempre alinhe com o fisioterapeuta responsável.',
    ],
  },
  {
    icon: Clock,
    titulo: 'Compromisso e pontualidade',
    cor: 'text-roxo-titulo',
    fundo: 'bg-amarelo-pipa/20',
    itens: [
      'Chegue com alguns minutos de antecedência e avise cedo se precisar faltar ou atrasar.',
      'Assumiu um horário ou uma tarefa? A equipe conta com você.',
      'Deixe o espaço e os materiais organizados para o próximo atendimento.',
    ],
  },
  {
    icon: Users,
    titulo: 'Convivência e equipe',
    cor: 'text-roxo-titulo',
    fundo: 'bg-verde-pipa/15',
    itens: [
      'Humildade para aprender e coragem para perguntar — ninguém espera que você já saiba tudo.',
      'Respeito com todos: fisioterapeutas, secretaria, colegas e famílias.',
      'Feedback aqui é cuidado, não crítica. Receba e ofereça com leveza.',
      'Fofoca e conflito não combinam com a nossa casa; fale direto e com respeito.',
    ],
  },
  {
    icon: Lock,
    titulo: 'Sigilo e ética',
    cor: 'text-azul-respira',
    fundo: 'bg-azul-respira/10',
    itens: [
      'Tudo sobre paciente é confidencial: nome, diagnóstico, fotos, conversas. Não sai da clínica.',
      'Não fotografe nem filme crianças sem autorização registrada.',
      'Não comente casos em redes sociais ou grupos, nem de forma "anônima".',
      'Prontuário e sistema são de uso profissional — cada acesso é sua responsabilidade.',
    ],
  },
  {
    icon: Sparkles,
    titulo: 'Postura e apresentação',
    cor: 'text-roxo-titulo',
    fundo: 'bg-amarelo-pipa/20',
    itens: [
      'Higienização das mãos sempre, antes e depois de cada atendimento.',
      'Uniforme limpo, unhas curtas e aparência cuidada.',
      'Celular guardado durante os atendimentos.',
    ],
  },
  {
    icon: Leaf,
    titulo: 'Sua evolução',
    cor: 'text-verde-pipa',
    fundo: 'bg-verde-pipa/15',
    itens: [
      'Anote suas dúvidas e observações; estudar o caso é parte do estágio.',
      'Erros acontecem — o que importa é avisar na hora e aprender.',
      'Traga ideias! Aqui a sua voz conta.',
    ],
  },
];

export const EstagioSuccessScreen = React.memo(() => {
  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center text-center space-y-10 py-6 animate-in fade-in slide-in-from-bottom-3 duration-700">
      {/* Agradecimento */}
      <div className="flex flex-col items-center space-y-8">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-verde-pipa/40 blur-3xl animate-respira-pulse" />
          <div className="relative bg-card rounded-full p-8 shadow-xl">
            <CheckCircle2
              className="w-20 h-20 md:w-24 md:h-24 text-verde-pipa"
              strokeWidth={1.5}
            />
          </div>
        </div>

        <div className="space-y-3 max-w-lg">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
            Recebemos sua candidatura!
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            Obrigada por dedicar seu tempo. Nossa equipe vai analisar suas
            respostas com carinho e, se fizer sentido, entramos em contato pelo
            WhatsApp ou e-mail que você informou. 💙
          </p>
        </div>
      </div>

      {/* Regras e boas práticas */}
      <section className="w-full space-y-6">
        <div className="space-y-2 max-w-lg mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            Como é conviver na Respira Kids
          </h2>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
            Independente do resultado, queremos que você já conheça o nosso dia
            a dia. São combinados simples que fazem toda a diferença para cuidar
            bem das crianças e das famílias — e para que você cresça com a
            gente.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          {BLOCOS.map((bloco) => {
            const Icon = bloco.icon;
            return (
              <div
                key={bloco.titulo}
                className={`rounded-2xl p-5 ${bloco.fundo} flex flex-col gap-3`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-6 h-6 shrink-0 ${bloco.cor}`} />
                  <h3 className="text-base md:text-lg font-semibold text-foreground">
                    {bloco.titulo}
                  </h3>
                </div>
                <ul className="space-y-2">
                  {bloco.itens.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2 text-sm md:text-[0.95rem] text-muted-foreground leading-relaxed"
                    >
                      <span className={`mt-1 shrink-0 ${bloco.cor}`}>•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-xs text-muted-foreground/70 max-w-sm">
        Você já pode fechar esta página. Estamos torcendo por você! 💙
      </p>
    </div>
  );
});

EstagioSuccessScreen.displayName = 'EstagioSuccessScreen';
