/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#04060f",
          900: "#070b18",
          850: "#0a1022",
          800: "#0e152b",
          700: "#141d38",
          600: "#1c2848",
        },
        neon: {
          blue: "#3fa9ff",
          cyan: "#22d3ee",
          violet: "#a06bff",
          pink: "#f472b6",
          lime: "#4ade80",
        },
      },
      // Every integer opacity, so utilities like border-white/8 or /12 compile.
      opacity: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i), String(i / 100)])),
      fontFamily: {
        display: ['"Sora"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(63,169,255,.22), 0 18px 60px -18px rgba(56,132,255,.55)",
        "glow-violet": "0 0 0 1px rgba(160,107,255,.25), 0 18px 60px -18px rgba(160,107,255,.5)",
        card: "0 24px 80px -32px rgba(2,6,23,.9)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(ellipse at top, rgba(63,169,255,.14), transparent 55%), radial-gradient(ellipse at 80% 10%, rgba(160,107,255,.14), transparent 45%)",
      },
      keyframes: {
        float: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        aurora: {
          "0%,100%": { transform: "translate3d(-4%, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(4%, -3%, 0) scale(1.08)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(63,169,255,.45)" },
          "70%": { boxShadow: "0 0 0 12px rgba(63,169,255,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(63,169,255,0)" },
        },
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        aurora: "aurora 18s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        "fade-up": "fade-up .45s ease-out both",
        "pulse-ring": "pulse-ring 2s ease-out infinite",
      },
    },
  },
  plugins: [],
};
