/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Orange accent — SF-style system orange
        accent: {
          50:  "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea6c0a",
          700: "#c2570a",
        },
        // Neutral surface palette (light mode)
        surface: {
          bg:     "#f2f0eb",   // warm light-grey page background
          card:   "#ffffff",   // card base
          border: "#e4e1da",   // subtle border
          muted:  "#a09d97",   // muted text
          label:  "#6b6860",   // secondary label
          body:   "#1c1a17",   // primary text
        },
      },
      fontFamily: {
        // SF Pro stack — falls back to system-ui on non-Apple
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "system-ui",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        shimmer:       "shimmer 1.4s infinite linear",
        "shimmer-bar": "shimmerBar 1.6s infinite ease-in-out",
        "spin-slow":   "spin 1s linear infinite",
        "fade-in":     "fadeIn 0.2s ease-out",
        "slide-up":    "slideUp 0.25s ease-out",
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "-600px 0" },
          "100%": { backgroundPosition: "600px 0" },
        },
        shimmerBar: {
          "0%":   { transform: "translateX(-100%)", opacity: 0 },
          "40%":  { opacity: 1 },
          "100%": { transform: "translateX(100%)", opacity: 0 },
        },
        fadeIn: {
          from: { opacity: 0 },
          to:   { opacity: 1 },
        },
        slideUp: {
          from: { opacity: 0, transform: "translateY(8px)" },
          to:   { opacity: 1, transform: "translateY(0)" },
        },
      },
      boxShadow: {
        glass: "0 2px 16px 0 rgba(0,0,0,0.07), 0 1px 3px 0 rgba(0,0,0,0.05)",
        "glass-hover": "0 4px 24px 0 rgba(0,0,0,0.10), 0 1px 4px 0 rgba(0,0,0,0.06)",
        "orange-glow": "0 4px 20px 0 rgba(249,115,22,0.25)",
      },
    },
  },
  plugins: [],
};
