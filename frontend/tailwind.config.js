module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        void: { DEFAULT: "#05070F", deep: "#03040A", raised: "#0A0F1E", card: "#0E1426", line: "#1B2440" },
        neon: { DEFAULT: "#00F0A8", soft: "#7CFFD4", deep: "#00B37D" },
        volt: { DEFAULT: "#3D8BFF", soft: "#8DB9FF", deep: "#1F5FD6" },
        pulse: { DEFAULT: "#9B5CFF", soft: "#C4A3FF" },
        ember: { DEFAULT: "#FF4D6D", soft: "#FF8FA3" },
        mist: { DEFAULT: "#E7ECF7", dim: "#9AA6C3", faint: "#5B6788" }
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"]
      },
      boxShadow: {
        neon: "0 0 40px -8px rgba(0,240,168,0.45)",
        volt: "0 0 40px -8px rgba(61,139,255,0.45)",
        card: "0 20px 60px -20px rgba(0,0,0,0.7)"
      },
      keyframes: {
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(100%)" } }
      },
      animation: {
        marquee: "marquee 30s linear infinite",
        floaty: "floaty 6s ease-in-out infinite",
        scan: "scan 2.4s linear infinite"
      }
    }
  },
  plugins: []
};
