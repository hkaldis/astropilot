import type { Config } from "tailwindcss";

const hsl = (v: string) => `hsl(var(${v}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["'Geist Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: ["'Instrument Serif'", "ui-serif", "Georgia", "serif"],
      },
      // The small sizes follow --text-* (index.css): a step larger on phones, the usual scale from sm up.
      fontSize: {
        "2xs": ["var(--text-2xs)", { lineHeight: "1rem" }],
        xs: ["var(--text-xs)", { lineHeight: "var(--text-xs-lh)" }],
        sm: ["var(--text-sm)", { lineHeight: "var(--text-sm-lh)" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 10px)",
      },
      colors: {
        background: hsl("--background"),
        foreground: hsl("--foreground"),
        border: hsl("--border"),
        input: hsl("--input"),
        ring: hsl("--ring"),
        card: { DEFAULT: hsl("--card"), foreground: hsl("--card-foreground") },
        popover: { DEFAULT: hsl("--popover"), foreground: hsl("--popover-foreground") },
        primary: { DEFAULT: hsl("--primary"), foreground: hsl("--primary-foreground") },
        secondary: { DEFAULT: hsl("--secondary"), foreground: hsl("--secondary-foreground") },
        muted: { DEFAULT: hsl("--muted"), foreground: hsl("--muted-foreground") },
        accent: { DEFAULT: hsl("--accent"), foreground: hsl("--accent-foreground") },
        destructive: { DEFAULT: hsl("--destructive"), foreground: hsl("--destructive-foreground") },
        surface: { DEFAULT: hsl("--surface"), 2: hsl("--surface-2") },
        gold: hsl("--gold"),
        sky: { night: hsl("--sky-night"), astro: hsl("--sky-astro"), nautical: hsl("--sky-nautical"), civil: hsl("--sky-civil"), day: hsl("--sky-day") },
        q: {
          excellent: hsl("--q-excellent"),
          good: hsl("--q-good"),
          fair: hsl("--q-fair"),
          poor: hsl("--q-poor"),
          bad: hsl("--q-bad"),
        },
      },
      // Motion: short, eased entrances (transform/opacity only); slow, faint ambient loops. Every
      // animation is switched off for people who ask for reduced motion (see index.css). Entrances
      // fill backwards only: they end in the element's own state and leave nothing behind (a lingering
      // transform would trap fixed-position children).
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        // Entrances give only their starting frame: they end in the element's own state (its own
        // opacity, transform, dash offset), whatever that is.
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" } },
        fade: { from: { opacity: "0" } },
        rise: { from: { opacity: "0", transform: "translateY(8px)" } },
        "zoom-fade": { from: { opacity: "0", transform: "scale(0.94)" } },
        "grow-x": { from: { transform: "scaleX(0)" } },
        "grow-y": { from: { transform: "scaleY(0)" } },
        draw: { from: { strokeDashoffset: "1" } },
        pop: { "0%": { opacity: "0", transform: "scale(0.6)" }, "60%": { transform: "scale(1.08)" } },
        ignite: { from: { opacity: "0.25", filter: "brightness(2.2)" } },
        shimmer: { from: { backgroundPosition: "160% 0" }, to: { backgroundPosition: "-60% 0" } },
        "ping-soft": { "0%": { transform: "scale(1)", opacity: "0.6" }, "75%,100%": { transform: "scale(2.6)", opacity: "0" } },
        sheen: {
          "0%": { transform: "translateX(-140%) skewX(-18deg)", opacity: "0" },
          "20%,80%": { opacity: "1" },
          "100%": { transform: "translateX(140%) skewX(-18deg)", opacity: "0" },
        },
        breathe: { "0%,100%": { opacity: "0.5" }, "50%": { opacity: "1" } },
        twinkle: { "0%,100%": { opacity: "0.35" }, "50%": { opacity: "1" } },
        nudge: { "0%,100%": { transform: "none" }, "20%": { transform: "translateX(-5px)" }, "45%": { transform: "translateX(4px)" }, "70%": { transform: "translateX(-2px)" } },
        float: { "0%,100%": { transform: "translateY(0) rotate(0deg)" }, "50%": { transform: "translateY(-7px) rotate(-1.5deg)" } },
        "spin-in": { from: { opacity: "0", transform: "rotate(-90deg) scale(0.6)" } },
        aurora: { "0%,100%": { backgroundPosition: "0% 50%", opacity: "0.75" }, "50%": { backgroundPosition: "100% 50%", opacity: "1" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.35s ease-out backwards",
        fade: "fade 0.5s ease-out backwards",
        rise: "rise 0.55s var(--ease-out) backwards",
        "zoom-fade": "zoom-fade 0.45s var(--ease-out) backwards",
        "grow-x": "grow-x 0.9s var(--ease-out) backwards",
        "grow-y": "grow-y 0.9s var(--ease-out) backwards",
        draw: "draw 1.2s var(--ease-in-out) backwards",
        pop: "pop 0.5s var(--ease-out) backwards",
        ignite: "ignite 0.7s ease-out backwards",
        shimmer: "shimmer 1.8s ease-in-out infinite",
        "ping-soft": "ping-soft 2.6s var(--ease-out) infinite",
        sheen: "sheen 1.2s ease-in-out backwards",
        breathe: "breathe 6s ease-in-out infinite",
        twinkle: "twinkle 3s ease-in-out infinite",
        nudge: "nudge 0.42s ease-in-out backwards",
        float: "float 7s ease-in-out infinite",
        "spin-in": "spin-in 0.4s var(--ease-out) backwards",
        page: "fade 0.4s var(--ease-out) backwards",
        aurora: "aurora 16s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
