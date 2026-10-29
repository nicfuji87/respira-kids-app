// Figuras das explicações ("?") da evolução motora. Desenhos simples, em
// SVG, que usam a cor do texto (funcionam no tema claro e no escuro).
// Cabeça vista de cima: nariz para cima, D e E são os lados da criança.

import React from 'react';

export type FiguraId =
  | 'cranio_diagonais'
  | 'cranio_ap_ml'
  | 'perimetro'
  | 'rotacao'
  | 'inclinacao'
  | 'ecom'
  | 'cervical';

const AZUL = '#2a78d6';
const LARANJA = '#eb6834';

const Moldura: React.FC<{
  titulo: string;
  legenda: React.ReactNode;
  children: React.ReactNode;
  viewBox?: string;
}> = ({ titulo, legenda, children, viewBox = '0 0 220 200' }) => (
  <figure className="space-y-1.5">
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={titulo}
      className="w-full max-w-[240px] mx-auto text-foreground"
    >
      {children}
    </svg>
    <figcaption className="text-xs text-muted-foreground">{legenda}</figcaption>
  </figure>
);

const Rotulo: React.FC<{
  x: number;
  y: number;
  cor?: string;
  children: React.ReactNode;
  tamanho?: number;
}> = ({ x, y, cor = 'currentColor', children, tamanho = 12 }) => (
  <text
    x={x}
    y={y}
    fill={cor}
    fontSize={tamanho}
    fontWeight={600}
    textAnchor="middle"
    dominantBaseline="middle"
  >
    {children}
  </text>
);

/** Cabeça vista de cima com nariz e orelhas; `achatada` puxa a nuca direita */
const CabecaDeCima: React.FC<{ achatada?: boolean }> = ({ achatada }) => (
  <g fill="none" stroke="currentColor" strokeWidth={2}>
    {achatada ? (
      // plagiocefalia: nuca direita achatada, testa direita para frente
      <path d="M110 22 C150 22 172 52 172 92 L170 118 L132 172 C120 178 108 180 96 178 C66 174 46 150 46 118 C46 80 62 36 110 22 Z" />
    ) : (
      <ellipse cx={110} cy={100} rx={62} ry={78} />
    )}
    {/* nariz */}
    <path d="M102 24 L110 10 L118 24" />
    {/* orelhas */}
    <path d="M47 96 q-10 6 0 16" />
    <path d="M173 96 q10 6 0 16" />
  </g>
);

const FIGURAS: Record<FiguraId, () => React.ReactElement> = {
  cranio_diagonais: () => (
    <Moldura
      titulo="Diagonais A e B do crânio"
      legenda={
        <>
          Vista de cima, nariz para cima. A vai da testa esquerda à nuca
          direita; B, da testa direita à nuca esquerda. Com a nuca direita
          achatada (como no desenho),{' '}
          <strong>A fica menor e B é a maior</strong>. CVA = maior − menor.
        </>
      }
    >
      <CabecaDeCima achatada />
      {/* A: testa esquerda (lado E da criança = esquerda da tela) → nuca direita */}
      <line x1={72} y1={40} x2={151} y2={145} stroke={AZUL} strokeWidth={3} />
      {/* B: testa direita → nuca esquerda (mais longa) */}
      <line
        x1={150}
        y1={42}
        x2={60}
        y2={162}
        stroke={LARANJA}
        strokeWidth={3}
      />
      <Rotulo x={86} y={62} cor={AZUL}>
        A
      </Rotulo>
      <Rotulo x={140} y={62} cor={LARANJA}>
        B
      </Rotulo>
      <Rotulo x={22} y={104} tamanho={11}>
        E
      </Rotulo>
      <Rotulo x={198} y={104} tamanho={11}>
        D
      </Rotulo>
      <Rotulo x={176} y={160} tamanho={10}>
        achatada
      </Rotulo>
    </Moldura>
  ),
  cranio_ap_ml: () => (
    <Moldura
      titulo="Comprimento AP e largura ML"
      legenda={
        <>
          AP: da glabela (entre as sobrancelhas) ao ponto mais de trás da
          cabeça. ML: a parte mais larga, acima das orelhas. CI = ML ÷ AP × 100.
          Cabeça curta e larga, achatada atrás por igual, dá CI alto
          (braquicefalia).
        </>
      }
    >
      <CabecaDeCima />
      <line x1={110} y1={26} x2={110} y2={176} stroke={AZUL} strokeWidth={3} />
      <line x1={50} y1={92} x2={170} y2={92} stroke={LARANJA} strokeWidth={3} />
      <Rotulo x={124} y={140} cor={AZUL}>
        AP
      </Rotulo>
      <Rotulo x={144} y={80} cor={LARANJA}>
        ML
      </Rotulo>
    </Moldura>
  ),
  perimetro: () => (
    <Moldura
      titulo="Perímetro cefálico"
      viewBox="0 0 220 180"
      legenda="Fita que não estica, logo acima das sobrancelhas e pela parte mais saliente da nuca: o maior contorno da cabeça."
    >
      <g fill="none" stroke="currentColor" strokeWidth={2}>
        {/* cabeça de perfil, olhando para a direita */}
        <path d="M60 120 C40 80 60 30 112 26 C160 22 186 56 182 92 C180 106 186 112 190 118 C184 122 182 126 180 132 C176 150 160 158 140 156 L130 170" />
        <path d="M150 96 q8 2 10 -4" />
      </g>
      <ellipse
        cx={118}
        cy={84}
        rx={70}
        ry={16}
        fill="none"
        stroke={AZUL}
        strokeWidth={3}
        transform="rotate(-8 118 84)"
      />
      <Rotulo x={118} y={112} cor={AZUL} tamanho={11}>
        fita
      </Rotulo>
    </Moldura>
  ),
  rotacao: () => (
    <Moldura
      titulo="Rotação cervical"
      legenda="Vista de cima, criança em supino. 0° é o nariz apontado para cima. Rotação é o queixo indo em direção ao ombro; meça o ângulo de cada lado. O lado com menos graus é o mais limitado."
    >
      <path
        d="M30 150 L190 150"
        stroke="currentColor"
        strokeWidth={2}
        opacity={0.4}
      />
      <Rotulo x={30} y={164} tamanho={10}>
        ombro E
      </Rotulo>
      <Rotulo x={190} y={164} tamanho={10}>
        ombro D
      </Rotulo>
      <circle
        cx={110}
        cy={120}
        r={36}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
      {/* nariz na linha média e depois virado para a direita */}
      <line
        x1={110}
        y1={120}
        x2={110}
        y2={58}
        stroke="currentColor"
        strokeDasharray="4 4"
        strokeWidth={2}
      />
      <line x1={110} y1={120} x2={166} y2={86} stroke={AZUL} strokeWidth={3} />
      <path
        d="M110 70 A50 50 0 0 1 152 94"
        fill="none"
        stroke={AZUL}
        strokeWidth={2}
      />
      <Rotulo x={110} y={48} tamanho={10}>
        0°
      </Rotulo>
      <Rotulo x={156} y={64} cor={AZUL}>
        D
      </Rotulo>
    </Moldura>
  ),
  inclinacao: () => (
    <Moldura
      titulo="Inclinação lateral"
      legenda="Vista de frente (o lado esquerdo da criança fica à direita de quem olha). Inclinação é a orelha indo em direção ao ombro, sem girar o rosto. Meça o ângulo entre a linha do meio do rosto e a vertical, de cada lado."
    >
      <path
        d="M30 170 C60 150 160 150 190 170"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
      <line
        x1={110}
        y1={160}
        x2={110}
        y2={30}
        stroke="currentColor"
        strokeDasharray="4 4"
        strokeWidth={2}
      />
      <g transform="rotate(28 110 150)">
        <ellipse
          cx={110}
          cy={88}
          rx={34}
          ry={42}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        />
        <line
          x1={110}
          y1={150}
          x2={110}
          y2={40}
          stroke={LARANJA}
          strokeWidth={3}
        />
      </g>
      <path
        d="M110 60 A90 90 0 0 1 150 70"
        fill="none"
        stroke={LARANJA}
        strokeWidth={2}
      />
      <Rotulo x={168} y={60} cor={LARANJA}>
        E
      </Rotulo>
    </Moldura>
  ),
  ecom: () => (
    <Moldura
      titulo="ECOM e seus terços"
      legenda="O ECOM (esternocleidomastoideo) vai de trás da orelha até o esterno e a clavícula. Palpe o músculo inteiro dos dois lados; o nódulo é anotado pelo terço em que está."
    >
      <g fill="none" stroke="currentColor" strokeWidth={2}>
        <ellipse cx={110} cy={58} rx={40} ry={46} />
        <path d="M84 98 L78 160 M136 98 L142 160" />
        <path d="M40 168 C80 156 140 156 180 168" />
      </g>
      {/* ECOM direito da criança (à esquerda da tela, vista de frente) */}
      <line x1={80} y1={84} x2={104} y2={162} stroke={AZUL} strokeWidth={5} />
      <line
        x1={140}
        y1={84}
        x2={116}
        y2={162}
        stroke={AZUL}
        strokeWidth={5}
        opacity={0.35}
      />
      <Rotulo x={58} y={98} tamanho={10}>
        superior
      </Rotulo>
      <Rotulo x={62} y={124} tamanho={10}>
        médio
      </Rotulo>
      <Rotulo x={70} y={150} tamanho={10}>
        inferior
      </Rotulo>
    </Moldura>
  ),
  cervical: () => (
    <Moldura
      titulo="Musculatura cervical anterior e posterior"
      legenda="De perfil. Anterior: músculos da frente do pescoço (abaixo da mandíbula). Posterior: músculos da nuca, da base do crânio até os ombros. Compare os dois lados e marque o mais tenso."
    >
      <g fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M70 110 C50 70 70 24 116 22 C158 20 180 54 176 88 C174 100 180 106 184 112 C178 116 176 120 174 126 C170 140 156 146 138 144" />
        <path d="M86 118 L80 176 M138 144 L146 176" />
      </g>
      <path
        d="M84 118 C82 140 80 160 80 176"
        stroke={LARANJA}
        strokeWidth={6}
        fill="none"
        opacity={0.8}
      />
      <path
        d="M136 146 C140 158 144 168 146 176"
        stroke={AZUL}
        strokeWidth={6}
        fill="none"
        opacity={0.8}
      />
      <Rotulo x={56} y={150} cor={LARANJA} tamanho={10}>
        posterior
      </Rotulo>
      <Rotulo x={174} y={162} cor={AZUL} tamanho={10}>
        anterior
      </Rotulo>
    </Moldura>
  ),
};

export const FiguraAjuda: React.FC<{ id: FiguraId }> = ({ id }) => {
  const F = FIGURAS[id];
  return F ? <F /> : null;
};
