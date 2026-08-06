import type { Config } from "tailwindcss";

// Onekey Dashboard — design tokens sourced exclusively from DESIGN.md.
// Do NOT diverge from these tokens; the design system is editorial cream+coral+dark-navy.
const config: Config = {
  // Mode: always dark class — the dashboard uses the dark surface (surface-dark) as the
  // product chrome. This mirrors DESIGN.md's "dark navy product surfaces" pattern.
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // --------------------------------------------------------------------------
      // COLORS — exact hex from DESIGN.md frontmatter
      // --------------------------------------------------------------------------
      colors: {
        // Brand / Accent
        primary: {
          DEFAULT: "#cc785c",   // Coral — signature CTA color
          active: "#a9583e",    // Pressed/hover darken
          disabled: "#e6dfd8",  // Desaturated cream-tinted disabled
        },
        "accent-teal": "#5db8a6",
        "accent-amber": "#e8a55a",

        // Surfaces — cream canvas light mode
        canvas: "#faf9f5",
        "surface-soft": "#f5f0e8",
        "surface-card": "#efe9de",
        "surface-cream-strong": "#e8e0d2",

        // Surfaces — dark navy product chrome
        "surface-dark": "#181715",
        "surface-dark-elevated": "#252320",
        "surface-dark-soft": "#1f1e1b",

        // Text
        ink: "#141413",
        body: {
          DEFAULT: "#3d3d3a",
          strong: "#252523",
        },
        muted: {
          DEFAULT: "#6c6a64",
          soft: "#8e8b82",
        },
        "on-primary": "#ffffff",
        "on-dark": "#faf9f5",
        "on-dark-soft": "#a09d96",

        // Borders
        hairline: {
          DEFAULT: "#e6dfd8",
          soft: "#ebe6df",
        },

        // Semantic
        success: "#5db872",
        warning: "#d4a017",
        error: "#c64545",
      },

      // --------------------------------------------------------------------------
      // FONT FAMILIES — DESIGN.md §Typography
      // Display: Copernicus (slab-serif) with Tiempos Headline / EB Garamond fallbacks
      // Body: StyreneB (humanist sans) with Inter fallbacks
      // Mono: JetBrains Mono
      // --------------------------------------------------------------------------
      fontFamily: {
        display: [
          "Copernicus",
          "Tiempos Headline",
          "Cormorant Garamond",
          "EB Garamond",
          "Garamond",
          "Times New Roman",
          "serif",
        ],
        sans: [
          "StyreneB",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "monospace",
        ],
      },

      // --------------------------------------------------------------------------
      // FONT SIZES — DESIGN.md §Typography hierarchy
      // --------------------------------------------------------------------------
      fontSize: {
        "display-xl": ["64px", { lineHeight: "1.05", letterSpacing: "-1.5px" }],
        "display-lg": ["48px", { lineHeight: "1.1",  letterSpacing: "-1px"   }],
        "display-md": ["36px", { lineHeight: "1.15", letterSpacing: "-0.5px" }],
        "display-sm": ["28px", { lineHeight: "1.2",  letterSpacing: "-0.3px" }],
        "title-lg":   ["22px", { lineHeight: "1.3",  letterSpacing: "0"      }],
        "title-md":   ["18px", { lineHeight: "1.4",  letterSpacing: "0"      }],
        "title-sm":   ["16px", { lineHeight: "1.4",  letterSpacing: "0"      }],
        "body-md":    ["16px", { lineHeight: "1.55", letterSpacing: "0"      }],
        "body-sm":    ["14px", { lineHeight: "1.55", letterSpacing: "0"      }],
        caption:      ["13px", { lineHeight: "1.4",  letterSpacing: "0"      }],
        "caption-upper": ["12px", { lineHeight: "1.4", letterSpacing: "1.5px" }],
        code:         ["14px", { lineHeight: "1.6",  letterSpacing: "0"      }],
        button:       ["14px", { lineHeight: "1",    letterSpacing: "0"      }],
        "nav-link":   ["14px", { lineHeight: "1.4",  letterSpacing: "0"      }],
      },

      // --------------------------------------------------------------------------
      // BORDER RADIUS — DESIGN.md §Shapes
      // --------------------------------------------------------------------------
      borderRadius: {
        xs:   "4px",
        sm:   "6px",
        md:   "8px",
        lg:   "12px",
        xl:   "16px",
        pill: "9999px",
        full: "9999px",
      },

      // --------------------------------------------------------------------------
      // SPACING — DESIGN.md §Spacing (4px base unit)
      // --------------------------------------------------------------------------
      spacing: {
        xxs:     "4px",
        xs:      "8px",
        sm:      "12px",
        md:      "16px",
        lg:      "24px",
        xl:      "32px",
        xxl:     "48px",
        section: "96px",
      },

      // --------------------------------------------------------------------------
      // MAX WIDTH — DESIGN.md §Grid & Container
      // --------------------------------------------------------------------------
      maxWidth: {
        content: "1200px",
      },

      // --------------------------------------------------------------------------
      // BOX SHADOW — DESIGN.md §Elevation: color-block first, shadow rare
      // Only the rare hover-elevated shadow defined.
      // --------------------------------------------------------------------------
      boxShadow: {
        hover: "0 1px 3px rgba(20,20,19,0.08)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
