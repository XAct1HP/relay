import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        relay: {
          bg: '#06070a',
          'bg-soft': '#0b0d12',
          'bg-soft-2': '#0f1219',
          panel: 'rgba(255, 255, 255, 0.04)',
          'panel-strong': 'rgba(255, 255, 255, 0.06)',
          border: 'rgba(255, 255, 255, 0.1)',
          text: '#f5f7fb',
          muted: 'rgba(245, 247, 251, 0.68)',
          subtle: 'rgba(245, 247, 251, 0.45)',
          accent: '#7ca6ff',
          'accent-strong': '#5f8fff',
          glow: 'rgba(95, 143, 255, 0.25)',
        },
      },
      borderRadius: {
        '4xl': '2rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(24px) scale(0.985)', filter: 'blur(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'slide-in-right': 'slide-in-right 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        pulse: 'pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
