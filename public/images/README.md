# 📁 Organização de Assets - Respira KIDS EHR

## 📂 Estrutura de Diretórios

```
public/images/
├── brand/          # Elementos da marca
│   ├── logos/      # Logotipos em diferentes formatos
│   ├── icons/      # Ícones da marca
│   └── backgrounds/ # Fundos e elementos visuais
├── ui/             # Elementos de interface
│   ├── avatars/    # Avatares padrão
│   ├── placeholders/ # Imagens placeholder
│   └── illustrations/ # Ilustrações decorativas
└── documents/      # Documentos e templates
    ├── templates/  # Templates de documentos
    └── samples/    # Exemplos e amostras
```

## 🎨 Diretrizes de Uso

### Logotipos

- **Logo completo**: Use para headers principais e login
- **Ícone**: Use para favicons e elementos pequenos
- **Nome**: Use quando precisar apenas do texto da marca

### Cores da Marca

- **Azul Respira**: `#4A90E2` - Cor principal
- **Verde Pipa**: `#7ED321` - Sucesso e saúde
- **Amarelo Pipa**: `#F5A623` - Alertas e avisos
- **Vermelho Kids**: `#D0021B` - Erros e urgências
- **Roxo Título**: `#6B46C1` - Títulos e destaques

### Formatos Recomendados

- **PNG**: Para logotipos com transparência
- **SVG**: Para ícones e elementos vetoriais
- **WEBP**: Para imagens com melhor compressão
- **JPG**: Para fotografias e imagens complexas

## 🔧 Convenções de Nomenclatura

- Use kebab-case: `logo-respira-kids.png`
- Inclua dimensões quando relevante: `icon-64x64.png`
- Use sufixos descritivos: `-dark`, `-light`, `-hover`
- Versione quando necessário: `-v2`, `-2024`

## 📱 Responsividade

Mantenha versões para diferentes densidades:

- `@1x` - Densidade padrão
- `@2x` - Telas de alta densidade (Retina)
- `@3x` - Telas de altíssima densidade

## 🚀 Otimização

- Comprima imagens antes de adicionar ao projeto
- Use ferramentas como TinyPNG ou ImageOptim
- Considere usar CDN para assets pesados
- Implemente lazy loading para imagens grandes
