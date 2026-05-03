import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#2563eb', // single accent per spec §17
          light: '#3b82f6',
          dark: '#1d4ed8',
        },
        guide: '#06b6d4', // cyan alignment guides
      },
      fontFamily: {
        sans: [
          'var(--font-noto-sans)',
          'var(--font-noto-sans-sc)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
