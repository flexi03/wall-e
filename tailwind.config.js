/** @type {import('tailwindcss').Config} */
// Design-Tokens: Farben kommen aus CSS-Variablen (src/index.css), damit Hell/Dunkel
// an einer Stelle definiert sind. Regeln und Beispiele: docs/DESIGN.md
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        line: token('line'),
        ink: token('ink'),
        muted: token('muted'),
        subtle: token('subtle'),
        primary: { DEFAULT: token('primary'), soft: token('primary-soft'), on: token('on-primary') },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        person: {
          1: token('person-1'),
          2: token('person-2'),
          3: token('person-3'),
          4: token('person-4'),
          5: token('person-5'),
          6: token('person-6')
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif']
      },
      fontSize: {
        // [Größe, { Zeilenhöhe, Gewicht }] – nur diese Stufen benutzen
        micro: ['0.75rem', { lineHeight: '1rem' }],
        caption: ['0.8125rem', { lineHeight: '1.125rem' }],
        body: ['0.9375rem', { lineHeight: '1.375rem' }],
        headline: ['1.0625rem', { lineHeight: '1.375rem', fontWeight: '600' }],
        title: ['1.75rem', { lineHeight: '2.125rem', fontWeight: '700', letterSpacing: '-0.01em' }],
        display: ['2.75rem', { lineHeight: '3rem', fontWeight: '700', letterSpacing: '-0.02em' }]
      },
      borderRadius: {
        control: '0.875rem',
        card: '1.25rem'
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.04)',
        sheet: '0 -8px 32px rgb(16 24 40 / 0.18)',
        bar: '0 -1px 0 rgb(var(--line))'
      },
      spacing: {
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-t': 'env(safe-area-inset-top)'
      },
      keyframes: {
        'sheet-in': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': { from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        pulse: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.35' } }
      },
      animation: {
        'sheet-in': 'sheet-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'fade-in': 'fade-in 200ms ease-out',
        'pop-in': 'pop-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'soft-pulse': 'pulse 1.6s ease-in-out infinite'
      }
    }
  },
  plugins: []
};
