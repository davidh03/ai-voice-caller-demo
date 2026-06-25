/** @type {import('tailwindcss').Config} */

export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./index.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      colors: {
        brand: {
          blue: "#3551F2",
          "blue-dark": "#1a35d4",
          "blue-deeper": "#0f25b0",
          navy: "#060A39",
          "navy-light": "#0d1360",
        },
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: false,
  },
};
