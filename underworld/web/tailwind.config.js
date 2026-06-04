/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Canonical platform BRAND palette — mirrors /design-tokens.json and the
        // APEX runtime tokens in src/domain/colors.js, so both surfaces share one
        // brand identity (parity P15 #109, unified theming). Use as bg-brand-neon,
        // text-brand-purple, etc. Additive — existing ink/glass/glow stay intact.
        brand: {
          neon: "#00c878",
          blue: "#0096d4",
          gold: "#e8a800",
          red: "#e8203c",
          purple: "#a855f7",
          orange: "#f07820",
        },
        // Graphite "liquid-glass" base — deep, slightly blue, never pure black.
        ink: {
          0: "#06070d",
          1: "#0b0d17",
          2: "#11131f",
          3: "#181a29",
          4: "#222539",
          5: "#2e3150",
        },
        // Translucent material tints (used as bg-glass-* with opacity in classes).
        glass: {
          DEFAULT: "rgba(255,255,255,0.06)",
          strong: "rgba(255,255,255,0.10)",
          line: "rgba(255,255,255,0.10)",
        },
        // Vibrant, Apple-clean accents.
        glow: {
          purple: "#a855f7",
          violet: "#8b5cf6",
          indigo: "#6366f1",
          blue: "#0a84ff", // iOS system blue
          amber: "#ffb340", // iOS warm
          jade: "#30d158", // iOS green
          rose: "#ff453a", // iOS red
          sky: "#64d2ff", // iOS light blue
          teal: "#40c8c0",
          pink: "#ff375f", // iOS pink
          lime: "#9ee84f",
        },
      },
      fontFamily: {
        // Clean system-first stack (SF Pro on Apple devices, Inter elsewhere).
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "system-ui",
          "Segoe UI",
          "sans-serif",
        ],
        display: [
          "Inter",
          "-apple-system",
          "SF Pro Display",
          "system-ui",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SF Mono", "ui-monospace", "Menlo", "monospace"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      boxShadow: {
        // Frosted glass + a faint neon edge-glow — dark cyberpunk material.
        glass:
          "inset 0 1px 0 0 rgba(255,255,255,0.07), inset 0 0 0 1px rgba(168,85,247,0.06), 0 8px 30px rgba(0,0,0,0.5), 0 0 36px rgba(168,85,247,0.07)",
        "glass-lg":
          "inset 0 1px 0 0 rgba(255,255,255,0.09), inset 0 0 0 1px rgba(168,85,247,0.10), 0 18px 50px rgba(0,0,0,0.6), 0 0 56px rgba(168,85,247,0.12)",
        "glass-cyan":
          "inset 0 1px 0 0 rgba(255,255,255,0.07), 0 8px 30px rgba(0,0,0,0.5), 0 0 36px rgba(100,210,255,0.12)",
        soft: "0 4px 24px rgba(0,0,0,0.4)",
        glow: "0 8px 30px rgba(168, 85, 247, 0.22)",
        "glow-strong": "0 10px 40px rgba(168, 85, 247, 0.38)",
        "glow-jade": "0 8px 30px rgba(48, 209, 88, 0.25)",
        "glow-rose": "0 8px 30px rgba(255, 69, 58, 0.25)",
        "glow-amber": "0 8px 30px rgba(255, 179, 64, 0.25)",
        panel: "0 8px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      backdropBlur: {
        xs: "2px",
        "2xl": "28px",
        "3xl": "44px",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(ellipse at top, rgba(168,85,247,0.10), transparent 60%), radial-gradient(ellipse at bottom right, rgba(100,210,255,0.07), transparent 60%)",
        "cyber-grid":
          "linear-gradient(rgba(168,85,247,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(100,210,255,0.05) 1px, transparent 1px)",
        "purple-gradient": "linear-gradient(135deg, #a855f7 0%, #8b5cf6 50%, #6366f1 100%)",
        "ember-gradient": "linear-gradient(135deg, #ffb340 0%, #ff453a 100%)",
        "jade-gradient": "linear-gradient(135deg, #30d158 0%, #40c8c0 100%)",
        "sky-gradient": "linear-gradient(135deg, #0a84ff 0%, #64d2ff 100%)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulse_glow: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 8px rgba(48,209,88,0.7)" },
          "50%": { opacity: "0.55", boxShadow: "0 0 16px rgba(48,209,88,0.95)" },
        },
        tick: {
          "0%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.4)", opacity: "0.6" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "fade-in": "fade-in 260ms cubic-bezier(0.22,1,0.36,1)",
        "slide-in-right": "slide-in-right 280ms cubic-bezier(0.22,1,0.36,1)",
        "scale-in": "scale-in 220ms cubic-bezier(0.22,1,0.36,1)",
        shimmer: "shimmer 2.2s linear infinite",
        "pulse-glow": "pulse_glow 1.8s ease-in-out infinite",
        tick: "tick 600ms ease-in-out",
      },
    },
  },
  plugins: [],
};
