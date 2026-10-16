// Cinza tingido com o roxo da marca (OKLCH hue 320, croma <= 0.022)
const neutralRoxo = {
  50: '#fbf9fc',
  100: '#f5f2f6',
  200: '#e9e4ea',
  300: '#d8d2d9',
  400: '#a69ea8',
  500: '#726a74',
  600: '#5d555f',
  700: '#483f4a',
  800: '#302832',
  900: '#1f1820',
  950: '#0e090f',
};

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Figtree',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
        nav: 'hsl(var(--nav))',
        'rosa-suave': 'hsl(var(--rosa-suave) / <alpha-value>)',
        // AI dev note: cinza neutro do Tailwind levemente tingido com o roxo da
        // marca (ver neutralRoxo no topo). Os ~300 usos de gray-*/slate-* no app
        // deixam de parecer "SaaS genérico" sem mexer em cada tela.
        // gray-500 = 5.1:1 sobre branco (AA).
        gray: neutralRoxo,
        slate: neutralRoxo,
        'azul-respira': 'hsl(var(--azul-respira))',
        'vermelho-kids': 'hsl(var(--vermelho-kids))',
        'bege-fundo': 'hsl(var(--bege-fundo))',
        'roxo-titulo': 'hsl(var(--roxo-titulo))',
        'amarelo-pipa': 'hsl(var(--amarelo-pipa))',
        'verde-pipa': 'hsl(var(--verde-pipa))',
        'cinza-secundario': 'hsl(var(--cinza-secundario))',
        success: 'hsl(var(--verde-pipa))',
        warning: 'hsl(var(--amarelo-pipa))',
      },
      // AI dev note: text-azul-respira / text-verde-pipa / text-amarelo-pipa /
      // text-vermelho-kids usam a versão "ink" (escura) da cor. bg-/border-
      // continuam com o pastel da marca. Corrige ~265 textos ilegíveis sem
      // tocar em cada tela.
      textColor: {
        // text-primary também: o teal pastel (#7DCFC7) como letra dava 1.7:1
        primary: {
          DEFAULT: 'hsl(var(--azul-respira-ink) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground))',
        },
        'azul-respira': 'hsl(var(--azul-respira-ink) / <alpha-value>)',
        'verde-pipa': 'hsl(var(--verde-pipa-ink) / <alpha-value>)',
        'amarelo-pipa': 'hsl(var(--amarelo-pipa-ink) / <alpha-value>)',
        'vermelho-kids': 'hsl(var(--vermelho-kids-ink) / <alpha-value>)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
};
