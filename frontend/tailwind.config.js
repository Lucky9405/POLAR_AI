/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        polar: {
          bg: "#050a14",
          panel: "#0b1220",
          panel2: "#0f1a2c",
          border: "#1c2a41",
          cyan: "#22d3ee",
          blue: "#38bdf8",
          green: "#34d399",
          amber: "#fbbf24",
          red: "#f87171",
          purple: "#a78bfa",
          text: "#e2e8f0",
          dim: "#7d8ba1",
        },
      },
      boxShadow: {
        glow: "0 0 20px rgba(34, 211, 238, 0.15)",
      },
    },
  },
  plugins: [],
}
