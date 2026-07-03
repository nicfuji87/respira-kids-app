import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config([
  {
    ignores: [
      'node_modules/',
      'dist/',
      'src/components/ui/',
      'components.json',
      'scripts/n8n/',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // AI dev note: força o uso dos primitivos Input/Textarea (que tratam
      // composição IME — acentos em tablets Samsung). Um <textarea> nativo ou
      // <input value=...> de texto controlado reintroduz o bug de "acento apaga
      // a letra anterior". Heurística: input com `value` = texto controlado;
      // checkbox/radio/file (usam `checked`/sem value) não são sinalizados.
      // Nível "warn" p/ não bloquear o CI; use eslint-disable se precisar do nativo.
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'JSXOpeningElement[name.name="textarea"]',
          message:
            'Use o primitivo <Textarea> (@/components/primitives/textarea) em vez de <textarea> nativo — ele trata composição IME (acentos em tablets Samsung).',
        },
        {
          selector:
            'JSXOpeningElement[name.name="input"]:has(JSXAttribute[name.name="value"])',
          message:
            'Use o primitivo <Input> (@/components/primitives/input) em vez de <input value=...> nativo — ele trata composição IME (acentos em tablets Samsung). Para checkbox/radio/file, ignore este aviso.',
        },
      ],
    },
  },
  {
    // Os primitivos são o único lugar sancionado p/ usar elementos nativos
    // (input/textarea/contentEditable) — a camada IME-safe vive aqui.
    files: ['src/components/primitives/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
]);
