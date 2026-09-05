import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // قاعدة موجّهة للـ React Compiler (مش مستخدم هنا): نمط "تحميل أولي ثم setState"
      // هو النمط القياسي من غير framework، فبنطفّيها بدل ما نسيب ٣٠ تحذير دائم.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // نسمح بـ console.error/warn فقط - أي console.log يعتبر تحذير
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // ملفات الـ contexts بتصدّر Provider + hooks مع بعض بالتصميم —
    // قاعدة fast-refresh مش منطبقة عليها، فبنطفّيها للملفات دي بس.
    files: ['src/contexts/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);
