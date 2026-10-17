/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#172033',
        muted: '#667085',
        canvas: '#f6f8fb',
        brand: '#3563e9'
      }
    }
  },
  plugins: []
};
