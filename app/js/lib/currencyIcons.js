// Cute currency icons for the dropdown in the total card: a globe for Mixed, a little banknote for each currency.
// Plain SVG strings, drawn on a 32 x 24 board so they all line up.

const note = (bg, mid, label, size = 9) => `<svg viewBox="0 0 32 24" aria-hidden="true">
  <rect x="1" y="3" width="30" height="18" rx="5" fill="${bg}"/>
  <rect x="3.5" y="5.5" width="25" height="13" rx="3" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1" stroke-dasharray="2 2"/>
  <circle cx="16" cy="12" r="6.6" fill="${mid}"/>
  <text x="16" y="12" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-weight="800" font-size="${size}" fill="#fff">${label}</text>
  <circle cx="6.5" cy="8" r="1.2" fill="#fff" fill-opacity=".8"/><circle cx="25.5" cy="16" r="1.2" fill="#fff" fill-opacity=".8"/>
</svg>`;

export const ICONS = {
  '': `<svg viewBox="0 0 32 24" aria-hidden="true">
    <circle cx="16" cy="12" r="10.5" fill="#4FA8E8"/>
    <path d="M9 8.5c2-2.2 5-2.6 6.2-1.2 1 1.2-.4 2.6-.2 3.8.3 1.6 2.2 1.5 1.6 3.3-.5 1.4-2.4 1-3.2 2.4-.6 1-.2 2.2-1 2.6C9.6 18 7 15 6.4 12.2 6.2 10.8 7.8 9.8 9 8.5z" fill="#6CCB6B"/>
    <path d="M19.5 6.5c1.8-.3 4 .8 4.8 2.6.6 1.4-.8 2-1.8 2.2-1.3.3-2.5-.6-3-1.6-.5-1 .3-2.9 0-3.2z" fill="#6CCB6B"/>
    <path d="M18.5 15.5c1.6-.5 3.4.3 3.7 1.6.3 1.2-1 2.4-2.4 2.2-1.2-.2-1.4-2.6-1.3-3.8z" fill="#6CCB6B"/>
    <ellipse cx="11.5" cy="6.8" rx="2.4" ry="1.2" fill="#fff" fill-opacity=".55" transform="rotate(-28 11.5 6.8)"/>
  </svg>`,
  MY: note('#2F6DB5', '#4C8BC9', 'RM'),
  US: note('#3D9A5B', '#5DBB78', '$', 11),
  SG: note('#E0603A', '#F08A63', 'S$'),
  HK: note('#C7362F', '#E0605A', 'HK$', 7),
  UK: note('#7B4BA8', '#9A6DC4', '\u00a3', 11),
  EU: note('#E0A92E', '#F3C65A', '\u20ac', 11),
};
