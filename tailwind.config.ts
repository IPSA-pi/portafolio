import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  darkMode: 'selector',
  content: ["./src/**/*.{html,js,svelte,ts}"],

  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        accent: {
          DEFAULT: '#39ff14',
          hover:   '#2de010',
        },
      },
    }
  },

  plugins: [typography]
} as Config;
