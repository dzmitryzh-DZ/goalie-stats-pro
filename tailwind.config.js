/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: v('--ink'),
        mut: v('--mut'),
        line: v('--line'),
        acc: v('--acc'),
        goal: v('--goal'),
        save: v('--save'),
        ok: v('--ok'),
        card: v('--card'),
        panel2: v('--panel2'),
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Inter', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
