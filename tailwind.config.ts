import type { Config } from "tailwindcss";

// 色は app/globals.css の CSS 変数（RGB チャンネル）を参照する。
// 画面側では gray/blue などの生の色ではなく、ここで定義した意味のある名前を使う。
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        fill: token("fill"),
        line: token("line"),
        ink: {
          DEFAULT: token("ink"),
          2: token("ink-2"),
          3: token("ink-3"),
        },
        accent: token("accent"),
        positive: token("positive"),
        negative: token("negative"),
        warning: token("warning"),
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"Hiragino Sans"',
          '"Hiragino Kaku Gothic ProN"',
          '"Noto Sans JP"',
          '"Yu Gothic UI"',
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        control: "12px",
        card: "20px",
        sheet: "28px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 6px 20px -8px rgb(0 0 0 / 0.08)",
        float: "0 2px 6px rgb(0 0 0 / 0.06), 0 18px 48px -12px rgb(0 0 0 / 0.22)",
        control: "0 1px 1px rgb(0 0 0 / 0.04)",
      },
      transitionTimingFunction: {
        fluid: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      keyframes: {
        "sheet-up": {
          from: { transform: "translateY(24px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pop-in": {
          from: { transform: "scale(0.96)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "sheet-up": "sheet-up 320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "fade-in": "fade-in 200ms ease-out",
        "pop-in": "pop-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
