/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#020604",
        panel: "#04110a",
        ph: { DEFAULT: "#39ff88", dim: "#1f9a55", faint: "#0f3f26" },
        cy: "#00e5ff",
        bull: "#39ff88",
        bear: "#ff3b5c",
        amber: "#ffb000",
        ion: "#4da3ff",
        go: "#3ddc97",
        nogo: "#ff5a5f",
        caution: "#ffb547",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
        display: ["VT323", "'JetBrains Mono'", "monospace"],
        sans: ["Barlow", "system-ui", "sans-serif"],
        cond: ["'Barlow Condensed'", "Barlow", "sans-serif"],
      },
      keyframes: {
        blink: { "0%, 49%": { opacity: "1" }, "50%, 100%": { opacity: "0" } },
        flash: { "0%": { opacity: "0.9" }, "100%": { opacity: "0" } },
        sweep: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(400%)" } },
        rise: { "0%": { opacity: "0", transform: "translateY(4px)" }, "100%": { opacity: "1", transform: "none" } },
        enter: {
          "0%": { opacity: "0", transform: "translateY(14px)", filter: "blur(6px)" },
          "100%": { opacity: "1", transform: "none", filter: "blur(0)" },
        },
      },
      animation: {
        blink: "blink 1s steps(1) infinite",
        flash: "flash 900ms ease-out forwards",
        sweep: "sweep 6s linear infinite",
        rise: "rise 300ms ease-out both",
        enter: "enter 900ms cubic-bezier(.2,.7,.2,1) both",
      },
    },
  },
  plugins: [],
};
