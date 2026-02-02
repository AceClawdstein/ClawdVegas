/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: '#fbbf24',
        'casino-red': '#dc2626',
        'neon-blue': '#3b82f6',
      },
    },
  },
  plugins: [],
}
