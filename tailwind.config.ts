import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        green: { DEFAULT: "#00FF41" },
        navy: { DEFAULT: "#0A0F1C" },
        bg: { DEFAULT: "#FAFAF8" },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
export default config;
