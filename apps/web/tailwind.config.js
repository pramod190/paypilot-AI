/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        palette: {
          base: '#F8FAFC',
          surface: '#FFFFFF',
          accent: '#4F46E5',
          accentHover: '#4338CA',
          accentDark: '#3730A3',
          soft: '#E0E7FF',
          text: '#0F172A',
          muted: '#64748B',
          border: '#E2E8F0',
        },
        paypal: {
          blue: '#0070BA',
          dark: '#003087',
          light: '#009CDE',
          yellow: '#FFC439',
        },
        trustguard: {
          green: '#059669',
          warning: '#D97706',
          danger: '#DC2626',
          bg: '#ECFDF5',
        }
      },
      boxShadow: {
        'soft-sm': '0 1px 2px 0 rgba(15, 23, 42, 0.04)',
        'soft-md': '0 4px 12px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.03)',
        'soft-lg': '0 10px 25px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.03)',
        'soft-xl': '0 20px 35px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.04)',
      }
    },
  },
  plugins: [],
}
