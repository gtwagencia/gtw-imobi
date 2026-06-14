/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Indigo-violeta profundo — substitui o azul cobalto padrão por algo
        // mais sofisticado, mantendo a família "azul" para não colidir com
        // verde/vermelho/amarelo usados como cores de status.
        brand: {
          50:  '#f1f1ff',
          100: '#e3e4ff',
          200: '#c8caff',
          300: '#a5a8ff',
          400: '#7d7ef9',
          500: '#5d5cf0',
          600: '#4940e0',
          700: '#3b32c2',
          800: '#312a9c',
          900: '#2a2580',
          950: '#1a1652',
        },
        // Dourado/champanhe — destaques premium (imóveis em destaque, IA Lais,
        // selos de "lançamento" etc.)
        accent: {
          50:  '#fdf8ec',
          100: '#faedc9',
          200: '#f5da94',
          300: '#efc35e',
          400: '#e8ab38',
          500: '#d88f22',
          600: '#b66f18',
          700: '#925418',
          800: '#78441b',
          900: '#65391b',
        },
        // Tinta — neutro escuro com leve matiz violeta para sidebar e
        // superfícies escuras (mais rico que um cinza puro).
        ink: {
          700: '#2b2d42',
          800: '#1e2030',
          900: '#15161f',
          950: '#0c0d14',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(15 15 35 / 0.04), 0 2px 8px -2px rgb(15 15 35 / 0.06)',
        card: '0 1px 3px 0 rgb(15 15 35 / 0.05), 0 8px 24px -8px rgb(15 15 35 / 0.08)',
        glow: '0 8px 30px -8px rgb(73 64 224 / 0.35)',
      },
    },
  },
  plugins: [],
};
