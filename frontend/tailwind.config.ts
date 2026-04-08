/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f1117",
        surface: "#1a1f2e",
        "surface-hover": "#222840",
        border: "#2d3555",
        accent: "#7c6ff7",
        "accent-green": "#3dd68c",
        "accent-amber": "#f0a500",
        "accent-red": "#f85149",
        "text-primary": "#e6edf3",
        "text-muted": "#8b92a5",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
      },
    },
  },
  plugins: [],
};
