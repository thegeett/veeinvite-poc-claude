import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["ui-serif", "Georgia", "serif"],
      },
      colors: {
        ink: "#0b0b10",
        parchment: "#faf7f2",
        gold: "#c9a44a",
      },
    },
  },
  plugins: [],
};

export default config;
