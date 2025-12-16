import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        status: {
          up: "#10b981",
          down: "#ef4444",
          pending: "#f59e0b",
          flapping: "#8b5cf6",
          paused: "#6b7280",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
