/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Noto Sans JP"',
          '"Inter"',
          "-apple-system",
          '"Segoe UI"',
          '"Hiragino Kaku Gothic ProN"',
          '"Yu Gothic UI"',
          '"Meiryo"',
          "sans-serif",
        ],
        mincho: [
          '"Shippori Mincho"',
          '"Yu Mincho"',
          "YuMincho",
          '"游明朝"',
          '"Hiragino Mincho ProN"',
          "serif",
        ],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        washi: {
          DEFAULT: "#F2EDE2",
          warm: "#F8F3E7",
          deep: "#E8E1D2",
        },
        paper: "#FCF9F2",
        ink: {
          DEFAULT: "#1A1716",
          soft: "#3F3A36",
          mute: "#6B655F",
          faint: "#9A938B",
          line: "#D9D2C2",
          hair: "#C2BAA9",
        },
        shu: {
          DEFAULT: "#A52A1F",
          bright: "#C73B2C",
          deep: "#7A1F17",
          soft: "#F5DEDB",
          glow: "#E96A5C",
        },
        gold: {
          DEFAULT: "#8C6A2F",
          deep: "#5C4419",
          soft: "#E5D4A8",
        },
      },
      boxShadow: {
        paper:
          "0 1px 0 rgba(26, 23, 22, 0.02), 0 6px 16px -8px rgba(26, 23, 22, 0.10), 0 1px 2px rgba(26, 23, 22, 0.04)",
        "paper-lg":
          "0 4px 20px -8px rgba(26, 23, 22, 0.12), 0 8px 32px -12px rgba(26, 23, 22, 0.08)",
        seal:
          "0 0 0 1px rgba(165, 42, 31, 0.15), 0 4px 16px -4px rgba(165, 42, 31, 0.18)",
        "seal-active":
          "0 0 0 2px rgba(165, 42, 31, 0.4), 0 6px 18px -4px rgba(165, 42, 31, 0.3)",
        "ink-soft": "0 2px 8px -2px rgba(26, 23, 22, 0.10)",
      },
      letterSpacing: {
        wider2: "0.08em",
        widest2: "0.16em",
      },
      keyframes: {
        "fade-in-up": {
          from: { opacity: 0, transform: "translateY(8px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        "ink-stroke": {
          from: { strokeDashoffset: "100%" },
          to: { strokeDashoffset: "0" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "fade-in": "fade-in 400ms ease-out both",
      },
    },
  },
  plugins: [],
};
