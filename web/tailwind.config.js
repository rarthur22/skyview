/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"OCR A"', '"Courier New"', "monospace"],
      },
      colors: {
        "hud-bg-primary": "#0a0e27",
        "hud-bg-secondary": "#1a1f3a",
        "hud-fg-primary": "#00d4ff",
        "hud-fg-secondary": "#4a7c8c",
        "hud-warn": "#ff6b35",
        "hud-success": "#00ff00",
      },
      keyframes: {
        "pulse-slow": {
          "0%,100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        blink: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.2" },
        },
      },
      animation: {
        "pulse-slow": "pulse-slow 2s infinite",
        blink: "blink 1s infinite",
      },
    },
  },
  plugins: [],
};
