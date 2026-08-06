import type { Config } from 'tailwindcss';

// Every colour is driven by a CSS custom property (see src/styles/theme.css) so
// the storefront can run cinematic-dark while the POS console runs a denser,
// higher-contrast surface scale — from one token vocabulary.
const withAlpha = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  content: ['./app/**/*.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Surfaces, back to front.
        canvas: withAlpha('--c-canvas'),
        surface: withAlpha('--c-surface'),
        raised: withAlpha('--c-raised'),
        overlay: withAlpha('--c-overlay'),
        hairline: withAlpha('--c-hairline'),

        // Text.
        ink: withAlpha('--c-ink'),
        'ink-muted': withAlpha('--c-ink-muted'),
        'ink-subtle': withAlpha('--c-ink-subtle'),
        'ink-inverse': withAlpha('--c-ink-inverse'),

        // Brand: electric blue reads "tech importer"; gold marks value/premium.
        brand: {
          50: withAlpha('--c-brand-50'),
          100: withAlpha('--c-brand-100'),
          200: withAlpha('--c-brand-200'),
          300: withAlpha('--c-brand-300'),
          400: withAlpha('--c-brand-400'),
          500: withAlpha('--c-brand-500'),
          600: withAlpha('--c-brand-600'),
          700: withAlpha('--c-brand-700'),
          800: withAlpha('--c-brand-800'),
          900: withAlpha('--c-brand-900'),
          DEFAULT: withAlpha('--c-brand-500'),
        },
        gold: {
          300: withAlpha('--c-gold-300'),
          400: withAlpha('--c-gold-400'),
          500: withAlpha('--c-gold-500'),
          600: withAlpha('--c-gold-600'),
          DEFAULT: withAlpha('--c-gold-500'),
        },

        // Semantic. Used identically in shop and console.
        success: withAlpha('--c-success'),
        'success-soft': withAlpha('--c-success-soft'),
        warn: withAlpha('--c-warn'),
        'warn-soft': withAlpha('--c-warn-soft'),
        danger: withAlpha('--c-danger'),
        'danger-soft': withAlpha('--c-danger-soft'),
        info: withAlpha('--c-info'),
        'info-soft': withAlpha('--c-info-soft'),
      },
      fontFamily: {
        sans: ['InterVariable', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Space Grotesk"', 'InterVariable', 'system-ui', 'sans-serif'],
        // Money, SKUs, IMEIs and counts must align in columns.
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      borderRadius: {
        card: '1rem',
        panel: '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.20), 0 8px 24px -12px rgb(0 0 0 / 0.45)',
        lift: '0 12px 40px -12px rgb(0 0 0 / 0.55)',
        glow: '0 0 0 1px rgb(var(--c-brand-500) / 0.35), 0 8px 32px -8px rgb(var(--c-brand-500) / 0.45)',
        inset: 'inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
