/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          0: "#05050a",
          1: "#0a0a14",
          2: "#101023",
          3: "#181834",
          4: "#22224a",
        },
        glow: {
          purple: "#a855f7",
          amber: "#f59e0b",
          jade: "#10b981",
          rose: "#f43f5e",
          sky: "#0ea5e9",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "SF Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
