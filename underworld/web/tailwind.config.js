/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          0: "#04040a",
          1: "#0a0a14",
          2: "#101023",
          3: "#181834",
          4: "#22224a",
          5: "#2c2c5e",
        },
        glow: {
          purple: "#a855f7",
          violet: "#8b5cf6",
          amber: "#f59e0b",
          jade: "#10b981",
          rose: "#f43f5e",
          sky: "#0ea5e9",
          teal: "#14b8a6",
          pink: "#ec4899",
          lime: "#84cc16",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "SF Mono", "Menlo", "monospace"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(168, 85, 247, 0.18)",
        "glow-strong": "0 0 32px rgba(168, 85, 247, 0.35)",
        "glow-jade": "0 0 24px rgba(16, 185, 129, 0.20)",
        "glow-rose": "0 0 24px rgba(244, 63, 94, 0.20)",
        "glow-amber": "0 0 24px rgba(245, 158, 11, 0.20)",
        panel: "0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(168, 85, 247, 0.05)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(ellipse at top, rgba(168,85,247,0.08), transparent 60%), radial-gradient(ellipse at bottom right, rgba(14,165,233,0.05), transparent 60%)",
        "scan-line":
          "linear-gradient(180deg, rgba(168,85,247,0.04) 0%, transparent 50%, rgba(168,85,247,0.04) 100%)",
        "purple-gradient": "linear-gradient(135deg, #a855f7 0%, #8b5cf6 50%, #6366f1 100%)",
        "ember-gradient": "linear-gradient(135deg, #f59e0b 0%, #f43f5e 100%)",
        "jade-gradient": "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulse_glow: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 8px rgba(168,85,247,0.6)" },
          "50%": { opacity: "0.6", boxShadow: "0 0 16px rgba(168,85,247,0.9)" },
        },
        tick: {
          "0%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.4)", opacity: "0.6" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "slide-in-right": "slide-in-right 220ms ease-out",
        shimmer: "shimmer 2.2s linear infinite",
        "pulse-glow": "pulse_glow 1.8s ease-in-out infinite",
        tick: "tick 600ms ease-in-out",
      },
    },
  },
  plugins: [],
};
