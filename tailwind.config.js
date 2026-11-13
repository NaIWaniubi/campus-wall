/** @type {import('tailwindcss').Config} */

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{js,ts,vue}"],
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        // Token 规范：业务色用 brand / danger / warning / accent / neutral；不要用 success 别名（与 brand 同色）。
        // 品牌色全部走 token 变量，便于主题切换
        brand: {
          50:  'var(--color-brand-50)',
          100: 'var(--color-brand-100)',
          200: 'var(--color-brand-200)',
          300: 'var(--color-brand-300)',
          400: 'var(--color-brand-400)',
          500: 'var(--color-brand-500)',
          600: 'var(--color-brand-600)',
          700: 'var(--color-brand-700)',
          800: 'var(--color-brand-800)',
          900: 'var(--color-brand-900)',
        },
        // 状态色
        accent:   { 500: '#F59E0B', 600: '#D97706' },
        danger:   { 500: '#EF4444', 600: '#DC2626' },
        success:  { 500: '#0E7C86' },
        warning:  { 500: '#F59E0B' },
        info:     { 500: '#3B82F6' },
        // 表面/文字/边框 token 桥
        surface:  { DEFAULT: 'var(--color-surface)', 2: 'var(--color-surface-2)', 3: 'var(--color-surface-3)' },
        ink:      { DEFAULT: 'var(--color-text)', soft: 'var(--color-text-soft)', mute: 'var(--color-text-mute)' },
        line:     { DEFAULT: 'var(--color-border)', 2: 'var(--color-border-2)' },
        page:     { DEFAULT: 'var(--color-bg)' },
      },
      borderColor: {
        DEFAULT: 'var(--color-border)',
      },
      ringColor: {
        DEFAULT: 'var(--color-brand-500)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      spacing: {
        1: 'var(--space-1)',  2: 'var(--space-2)',  3: 'var(--space-3)',
        4: 'var(--space-4)',  5: 'var(--space-5)',  6: 'var(--space-6)',
        8: 'var(--space-8)', 10: 'var(--space-10)', 12: 'var(--space-12)',
      },
      maxWidth: {
        container: 'var(--container-max)',
      },
      screens: {
        // 三档：sm<640 / md 640-960 / lg≥960
        sm: '0px',
        md: '640px',
        lg: '960px',
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
