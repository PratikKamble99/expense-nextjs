import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Luminescent Ledger — Tonal Architecture
        background: "#0B0E14",
        surface: {
          DEFAULT: "#0B0E14",
          dim: "#0B0E14",
          bright: "#282C36",
          "container-lowest": "#000000",
          "container-low": "#10131A",
          container: "#161A21",
          "container-high": "#1C2028",
          "container-highest": "#22262F",
          variant: "#22262F",
        },
        primary: {
          DEFAULT: "#BD9DFF",
          dim: "#8A4CFC",
          container: "#B28CFF",
          on: "#3C0089",
          "on-container": "#2E006C",
        },
        secondary: {
          DEFAULT: "#DBE0EA",
          dim: "#CDD2DB",
          container: "#42474F",
          on: "#4B5058",
          "on-container": "#CCD0DA",
        },
        tertiary: {
          DEFAULT: "#9BFFCE",
          dim: "#58E7AB",
          container: "#69F6B8",
          on: "#006443",
          "on-container": "#005A3C",
        },
        error: {
          DEFAULT: "#FF6E84",
          dim: "#D73357",
          container: "#A70138",
          on: "#490013",
          "on-container": "#FFB2B9",
        },
        "on-surface": "#ECEDF6",
        "on-surface-variant": "#A9ABB3",
        line: {
          DEFAULT: "#73757D",
          subtle: "#45484F",
        },
        "inverse-surface": "#F9F9FF",
        "inverse-on-surface": "#52555C",
        "inverse-primary": "#742FE5",
      },
      borderRadius: {
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        "primary-glow": "0 0 30px rgba(189, 157, 255, 0.08)",
        "primary-glow-lg": "0 0 40px rgba(189, 157, 255, 0.15)",
        "card-hover": "0 0 20px rgba(189, 157, 255, 0.06)",
      },
      backgroundImage: {
        "primary-gradient": "linear-gradient(135deg, #BD9DFF, #8A4CFC)",
        "primary-gradient-hover": "linear-gradient(135deg, #CAAFFF, #9B66FD)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(16px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        shimmer: "shimmer 2s infinite linear",
        "fade-in": "fade-in 0.4s ease-out forwards",
        "slide-up": "slide-up 0.35s ease-out forwards",
      },
    },
  },
  plugins: [],
} satisfies Config;
