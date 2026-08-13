import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // NestJS يحل الاعتماديات من metadata التي يولّدها emitDecoratorMetadata،
    // وهي تحتاج استيراداً قيمياً لا نوعياً. تفعيل consistent-type-imports هنا
    // يدفع نحو تعديل يكسر الـDI صامتاً عند التشغيل.
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  prettier,
);
