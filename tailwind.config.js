/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Preflight is disabled because the existing dashboards rely on native
  // heading/list/button defaults alongside inline styles. Our own reset lives
  // in src/styles/base/reset.css.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F2F7F3',
          100: '#E8F1EA',
          200: '#CFDED2',
          300: '#A9C5B0',
          400: '#6F9A7B',
          500: '#4F7A5B',
          600: '#2F684B',
          700: '#174A36',
          800: '#0F3627',
          900: '#0A2419',
        },
        canola: {
          50: '#FDF7EA',
          100: '#FAEBC8',
          400: '#EDBE5F',
          500: '#E5A93C',
          600: '#C88B22',
          700: '#9A6A16',
        },
        surface: {
          DEFAULT: 'var(--bg-card)',
          muted: 'var(--bg-sunken)',
          sunken: 'var(--bg-sunken)',
        },
        line: {
          DEFAULT: 'var(--border-color)',
          strong: 'var(--border-strong)',
        },
        ink: {
          DEFAULT: 'var(--text-primary)',
          soft: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        danger: {
          50: '#FDECEC',
          500: '#DA3633',
          600: '#B42724',
        },
      },
      fontFamily: {
        heading: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(19, 42, 32, 0.04), 0 4px 16px rgba(19, 42, 32, 0.06)',
        'card-hover': '0 2px 4px rgba(19, 42, 32, 0.06), 0 12px 32px rgba(19, 42, 32, 0.10)',
        focus: '0 0 0 3px rgba(79, 122, 91, 0.25)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.35s ease-out both',
      },
    },
  },
  plugins: [],
};
