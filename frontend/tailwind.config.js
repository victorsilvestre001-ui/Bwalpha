module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        void: { DEFAULT: "#07060D", deep: "#050409", raised: "#0D0B17", card: "#121020", line: "#221E38" },
        // Visual lilás (14/10): "neon" e "volt" viraram tons de lilás; o verde de compra/WIN ficou em "buy".
        neon: { DEFAULT: "#8B6CF6", soft: "#B9A6FF", deep: "#6A4DE3" },
        buy: { DEFAULT: "#22E3A0", soft: "#7CFFD4", deep: "#00B37D" },
        volt: { DEFAULT: "#A78BFA", soft: "#C9B8FF", deep: "#7C5CF0" },
        pulse: { DEFAULT: "#9B5CFF", soft: "#C4A3FF" },
        ember: { DEFAULT: "#FF4D6D", soft: "#FF8FA3" },
        mist: { DEFAULT: "#ECEAF5", dim: "#A19DB5", faint: "#655F7E" },
        // Visual novo da página inicial (14/10): preto arroxeado + lilás, seções claras em "paper".
        ink: { DEFAULT: "#07060D", raised: "#0D0B17", card: "#121020", line: "#1F1B33" },
        lilac: { DEFAULT: "#8B6CF6", soft: "#B9A6FF", deep: "#6A4DE3" },
        paper: { DEFAULT: "#ECEBF2", card: "#FFFFFF", line: "#DAD8E4", ink: "#0B0A12", dim: "#5E5B6E" }
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
        tight: ["var(--font-tight)", "sans-serif"]
      },
      boxShadow: {
        neon: "0 0 40px -8px rgba(139,108,246,0.55)",
        volt: "0 0 40px -8px rgba(167,139,250,0.45)",
        card: "0 20px 60px -20px rgba(0,0,0,0.7)"
      },
      keyframes: {
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(100%)" } },
        scrollDot: { "0%": { transform: "translateY(0)", opacity: "0" }, "30%": { opacity: "1" }, "100%": { transform: "translateY(10px)", opacity: "0" } }
      },
      animation: {
        marquee: "marquee 30s linear infinite",
        floaty: "floaty 6s ease-in-out infinite",
        scan: "scan 2.4s linear infinite",
        "scroll-dot": "scrollDot 1.8s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
