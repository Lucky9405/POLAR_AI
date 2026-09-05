/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        polar: {
          bg: "var(--polar-bg)",
          panel: "var(--polar-panel)",
          panel2: "var(--polar-panel2)",
          border: "var(--polar-border)",
          text: "var(--polar-text)",
          dim: "var(--polar-dim)",
          // Semantic + accent colors stay stable across themes on purpose —
          // health/status meaning (green/amber/red) must never shift with
          // theme or station identity.
          cyan: "#22d3ee",
          blue: "#38bdf8",
          green: "#34d399",
          amber: "#fbbf24",
          red: "#f87171",
          purple: "#a78bfa",
        },
      },
      boxShadow: {
        glow: "0 0 20px rgba(34, 211, 238, 0.15)",
      },
    },
  },
  plugins: [],
}
