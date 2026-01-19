import type { Config } from "tailwindcss";

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
        // Enforcing grayscale by default if we wanted, but default tailwind includes 'gray'
        // We can just use standard classes.
      }
    }
  },

  plugins: []
} as Config;
