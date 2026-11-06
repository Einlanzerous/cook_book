/** @type {import('tailwindcss').Config} */
// Commonplace design tokens (COOK-7). Source of truth: the Commonplace canvas.
// Use the named tokens below; never raw hex or Tailwind's default palette.
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    // Replace (not extend) the palette so the old orange/gray/etc cannot creep back.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      page: '#F8F5EC',          // page background
      surface: '#FCFAF4',       // raised surfaces: cards, inputs, modals
      ink: {
        DEFAULT: '#1E2420',     // headings, body text
        soft: '#4A5048',        // lede / secondary body copy
      },
      muted: '#5B6158',         // meta, captions, labels (5.9:1 on page)
      faint: '#6B7064',         // hints, placeholders, disabled (4.7:1; canvas #7D8276 fails AA)
      fir: {
        DEFAULT: '#2C4A3B',     // brand: links, primary button, active states
        dark: '#1C3328',        // hover on fir
        tint: '#E9ECE2',        // hover/selected wash
      },
      rule: {
        DEFAULT: '#E3DDCC',     // section dividers
        soft: '#ECE7D9',        // list row dividers
        strong: '#CFC8B5',      // input underlines, outlined controls
      },
      photo: {
        a: '#EDE8DA',           // photo placeholder stripes
        b: '#E6E0CE',
      },
      codebg: '#1F2A23',        // dark code block
      // Not in the canvas; semantic additions for existing destructive/status UI.
      danger: { DEFAULT: '#9B2C2C', tint: '#F6E7E2' },
      ok: '#3E7A57',
      white: '#FFFFFF',
    },
    extend: {
      fontFamily: {
        serif: ['"Newsreader Variable"', 'Newsreader', 'Georgia', 'serif'],
        sans: ['"Public Sans Variable"', '"Public Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '3px',   // buttons, inputs, panels
        sm: '2px',        // photos
        md: '3px',
        lg: '4px',        // modals
      },
      maxWidth: {
        page: '1200px',
      },
      letterSpacing: {
        eyebrow: '0.08em',
      },
    },
  },
  plugins: [],
}
