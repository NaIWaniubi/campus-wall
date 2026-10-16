import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'miniprogram/**', 'docs/.vitepress/cache/**', 'docs/.vitepress/dist/**', 'coverage/**'],
  },
  // essential：只启用错误级规则，避免对存量代码做全量风格重排
  ...pluginVue.configs['flat/essential'],
  ...tseslint.configs.recommended,
  {
    files: ['**/*.vue'],
    languageOptions: {
      // .vue 文件必须由 vue-eslint-parser 解析，<script> 内再交给 TS parser
      parser: vueParser,
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    rules: {
      // 项目现状：宽松 TS（strict: false），允许显式 any，避免一次性海量告警
      '@typescript-eslint/no-explicit-any': 'off',
      // 下划线开头的参数/变量视为有意忽略
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Express 类型扩展的标准写法就是 declare global + namespace
      '@typescript-eslint/no-namespace': 'off',
      // App.vue / 入口组件为单词名
      'vue/multi-word-component-names': 'off',
    },
  },
)
