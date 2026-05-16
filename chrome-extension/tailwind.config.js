/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Main app colors
        primary: {
          DEFAULT: '#0EA5E9',
          dark: '#0284C7',
          light: '#38BDF8',
        },
        // Editor mockup colors
        ed: {
          bg: '#1a1f2e',
          'bg-secondary': '#1e2433',
          'bg-canvas': '#151926',
          'bg-hover': 'rgba(255,255,255,0.04)',
          accent: '#00a8ff',
          'accent-hover': '#3db8ff',
          border: '#2a3042',
          'border-light': 'rgba(255,255,255,0.06)',
          'text-primary': '#ffffff',
          'text-secondary': '#a0aec0',
          'text-muted': '#64748b',
          danger: '#ef4444',
          'slider-track': '#2a3042',
          'slider-thumb': '#00a8ff',
        },
        surface: {
          dark: '#0F172A',
          card: '#1E293B',
          elevated: '#334155',
          hover: '#475569',
        },
        text: {
          primary: '#F8FAFC',
          secondary: '#94A3B8',
          muted: '#64748B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      width: {
        'popup': '350px',
      },
      maxHeight: {
        'popup': '600px',
      },
      boxShadow: {
        'ed-glow': '0 0 20px rgba(0, 168, 255, 0.15)',
        'ed-glow-sm': '0 0 8px rgba(0, 168, 255, 0.2)',
        'ed-dropdown': '0 8px 24px rgba(0, 0, 0, 0.4)',
        'ed-modal': '0 24px 48px rgba(0, 0, 0, 0.5)',
      },
      borderRadius: {
        'ed': '6px',
        'ed-lg': '8px',
      },
    },
  },
  plugins: [],
};
