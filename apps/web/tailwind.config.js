/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paypal: {
          blue: '#0070BA',
          dark: '#003087',
          light: '#009CDE',
          yellow: '#FFC439',
        },
        trustguard: {
          green: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          bg: '#064E3B',
        }
      }
    },
  },
  plugins: [],
}

