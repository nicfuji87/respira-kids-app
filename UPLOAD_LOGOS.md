# 📤 Upload de Logos para Supabase Storage

## ⚠️ AÇÃO MANUAL NECESSÁRIA

Para que a geração de PDF funcione corretamente, você precisa fazer upload das logos para o Supabase Storage:

### Logos Necessárias:

1. **Logo para Cabeçalho**: `public/images/logos/nome-logo-respira-kids.png`
   - **Destino**: `public-assets/nome-logo-respira-kids.png`
2. **Logo para Marca d'água**: `public/images/logos/logo-respira-kids.png`
   - **Destino**: `public-assets/logo-respira-kids.png`

### Como fazer upload:

#### Opção 1: Via Supabase Dashboard

1. Acesse: https://supabase.com/dashboard/project/[YOUR_PROJECT]/storage/buckets/public-assets
2. Faça upload dos 2 arquivos
3. Certifique-se de que estão com os nomes corretos

#### Opção 2: Via Supabase CLI

```bash
# Fazer upload da logo do cabeçalho
npx supabase storage upload public-assets/nome-logo-respira-kids.png public/images/logos/nome-logo-respira-kids.png

# Fazer upload da logo para marca d'água
npx supabase storage upload public-assets/logo-respira-kids.png public/images/logos/logo-respira-kids.png
```

### URLs Finais:

Após o upload, as logos estarão disponíveis em:

- `{SUPABASE_URL}/storage/v1/object/public/public-assets/nome-logo-respira-kids.png`
- `{SUPABASE_URL}/storage/v1/object/public/public-assets/logo-respira-kids.png`

### Verificar Upload:

Você pode testar se as logos estão acessíveis visitando as URLs acima no navegador.

---

## 🔍 Troubleshooting

Se o PDF não estiver exibindo as logos:

1. Verifique se o bucket `public-assets` existe e é público
2. Confirme que os arquivos foram enviados com os nomes corretos
3. Teste as URLs diretamente no navegador
4. Verifique os logs da Edge Function `generate-contract-pdf`
