import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: 'var(--void)',
        deep: 'var(--deep)',
        surface: 'var(--surface)',
        panel: 'var(--panel)',
        border: 'var(--border)',
        border2: 'var(--border2)',
        kill: 'var(--kill)',
        safe: 'var(--safe)',
        warn: 'var(--warn)',
        cyan: 'var(--cyan)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        muted2: 'var(--muted2)',
      },
      fontFamily: {
        display: ['Barlow Condensed', 'sans-serif'],
        body: ['Barlow', 'sans-serif'],
        mono: ['Share Tech Mono', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
