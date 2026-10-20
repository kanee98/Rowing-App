/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rowing: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc8fb',
          400: '#36abf7',
          500: '#0c8fe9',
          600: '#0271c7',
          700: '#035aa2',
          800: '#074c85',
          900: '#0c406e',
          950: '#082949',
        },
        oar: {
          gold: '#f59e0b',
          crimson: '#e11d48',
          navy: '#0f172a',
          emerald: '#10b981'
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
