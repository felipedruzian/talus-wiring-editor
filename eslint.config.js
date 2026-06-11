// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],

      // Angular components / directives are commonly metadata-only classes
      // whose value is the decorator, not the body. The strict rule fights this.
      '@typescript-eslint/no-extraneous-class': 'off',

      // Numbers in `${...}` are extremely common (DXF group codes, dimensions,
      // CSS pixel values). Requiring an explicit String() cast is stylistic
      // noise, not a bug catcher.
      '@typescript-eslint/restrict-template-expressions': 'off',

      // Over-fires on defensive guards at API boundaries (ng-diagram types are
      // generous with optional fields). Keeping these guards as documentation
      // of "this CAN be undefined under runtime conditions the types don't
      // capture" is worth more than the rule's narrow strictness.
      '@typescript-eslint/no-unnecessary-condition': 'off',

      // Allow `_` / `_name` for params that exist only to satisfy a signature
      // (template event bindings, framework callbacks).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
