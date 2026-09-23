/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#16181d',
        mut: '#6b7280',
        line: '#d7dbe2',
        acc: '#1d4ed8',
        goal: '#dc2626',
        save: '#2563eb',
        ok: '#059669',
      },
    },
  },
  plugins: [],
};
