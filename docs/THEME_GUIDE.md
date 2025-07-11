# 🎨 Guia de Uso do Tema Respira Kids

## Exemplo Prático de Uso

### 1. Componente com Tema Aplicado

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function ExampleComponent() {
  return (
    <div className="bg-background text-foreground p-6">
      {/* Título com gradiente */}
      <h1 className="text-3xl font-bold respira-text-gradient mb-4">
        Título com Gradiente
      </h1>

      {/* Card com tema */}
      <Card className="bg-card text-card-foreground border-border theme-transition">
        <CardHeader>
          <CardTitle className="text-primary">Título do Card</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Texto secundário usando as cores do tema
          </p>

          {/* Botões com cores do tema */}
          <div className="flex gap-4 mt-4">
            <Button className="bg-primary text-primary-foreground">
              Botão Primário
            </Button>
            <Button
              variant="secondary"
              className="bg-secondary text-secondary-foreground"
            >
              Botão Secundário
            </Button>
            <Button className="bg-accent text-accent-foreground">
              Botão Destaque
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Elemento decorativo */}
      <div className="mt-6 h-2 rounded-full respira-gradient animate-respira-pulse"></div>
    </div>
  );
}
```

### 2. Classes Essenciais

```css
/* Backgrounds */
.bg-background         /* Fundo principal (bege) */
.bg-card               /* Fundo dos cards (branco) */
.bg-primary            /* Azul Respira */
.bg-secondary          /* Vermelho Kids */
.bg-accent             /* Verde Pipa */

/* Textos */
.text-foreground       /* Texto principal (roxo) */
.text-muted-foreground /* Texto secundário (cinza) */
.text-primary          /* Texto azul respira */
.text-secondary        /* Texto vermelho kids */

/* Utilitários especiais */
.respira-gradient      /* Gradiente azul → verde */
.respira-text-gradient /* Gradiente de texto */
.theme-transition      /* Transição suave */
.animate-respira-pulse /* Animação de pulso */
```

### 3. Modo Escuro

O tema suporta modo escuro automaticamente:

```tsx
function ThemeToggle() {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="bg-background text-foreground theme-transition">
        <Button onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
        </Button>
      </div>
    </div>
  );
}
```

### 4. Paleta de Cores Completa

```tsx
// Demonstração de todas as cores
function ColorPalette() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6">
      <div className="bg-azul-respira text-white p-4 rounded">Azul Respira</div>
      <div className="bg-vermelho-kids text-white p-4 rounded">
        Vermelho Kids
      </div>
      <div className="bg-verde-pipa text-white p-4 rounded">Verde Pipa</div>
      <div className="bg-amarelo-pipa text-white p-4 rounded">Amarelo Pipa</div>
    </div>
  );
}
```

## ✅ Checklist de Implementação

- [ ] Sempre usar variáveis CSS em vez de cores hardcoded
- [ ] Aplicar `.theme-transition` para transições suaves
- [ ] Usar `.respira-text-gradient` em títulos importantes
- [ ] Aplicar `.animate-respira-pulse` com moderação
- [ ] Testar em modo claro e escuro
- [ ] Verificar acessibilidade das cores
- [ ] Manter consistência com o design system

## 🎯 Dicas de Boas Práticas

1. **Use as cores semânticas**: `primary`, `secondary`, `accent` em vez das cores específicas
2. **Aplique transições**: Sempre use `theme-transition` para mudanças de estado
3. **Teste responsividade**: Verifique em diferentes tamanhos de tela
4. **Modo escuro**: Teste sempre o modo escuro junto com o claro
5. **Acessibilidade**: Mantenha contraste adequado entre texto e fundo
