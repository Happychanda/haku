'use strict';
// Generates clean, on-brand placeholder product artwork as SVG (no external images needed).
// Replace with real photos any time via the admin panel (Upload image).

const ICONS = {
  hoodie: (c) => `<path d="M150 150 L110 175 L85 270 L120 282 L135 235 L135 380 L265 380 L265 235 L280 282 L315 270 L290 175 L250 150 Q200 200 150 150Z" fill="${c}"/><path d="M150 150 Q200 215 250 150 Q225 118 200 118 Q175 118 150 150Z" fill="rgba(0,0,0,.18)"/><path d="M185 195 L183 245 M215 195 L217 245" stroke="rgba(255,255,255,.7)" stroke-width="4" stroke-linecap="round"/><rect x="165" y="300" width="70" height="40" rx="8" fill="rgba(0,0,0,.14)"/>`,
  tee: (c) => `<path d="M140 120 L80 160 L105 215 L140 195 L140 370 L260 370 L260 195 L295 215 L320 160 L260 120 Q200 160 140 120Z" fill="${c}"/><path d="M140 120 Q200 160 260 120 Q235 142 200 142 Q165 142 140 120Z" fill="rgba(0,0,0,.2)"/><text x="200" y="265" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="34" text-anchor="middle" fill="rgba(255,255,255,.85)" letter-spacing="3">HAKU</text>`,
  bag: (c) => `<path d="M160 150 Q160 90 200 90 Q240 90 240 150" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="10" stroke-linecap="round"/><path d="M110 150 L290 150 L310 360 L90 360Z" fill="${c}"/><rect x="170" y="235" width="60" height="38" rx="8" fill="rgba(0,0,0,.2)"/><circle cx="200" cy="254" r="7" fill="rgba(255,255,255,.8)"/>`,
  sneaker: (c) => `<path d="M60 285 L60 230 Q60 215 78 212 L150 200 L190 160 Q205 150 220 160 L250 205 Q300 215 330 245 Q345 262 340 285Z" fill="${c}"/><path d="M60 285 L340 285 L340 308 Q340 318 328 318 L72 318 Q60 318 60 308Z" fill="rgba(255,255,255,.92)"/><path d="M170 215 L200 205 M185 232 L215 222 M200 249 L230 239" stroke="rgba(255,255,255,.85)" stroke-width="6" stroke-linecap="round"/>`,
  watch: (c) => `<rect x="165" y="60" width="70" height="90" rx="12" fill="rgba(0,0,0,.35)"/><rect x="165" y="250" width="70" height="90" rx="12" fill="rgba(0,0,0,.35)"/><circle cx="200" cy="200" r="78" fill="${c}"/><circle cx="200" cy="200" r="62" fill="#0e0e0e"/><path d="M200 200 L200 152 M200 200 L232 218" stroke="#c6f432" stroke-width="6" stroke-linecap="round"/><circle cx="200" cy="200" r="6" fill="#c6f432"/>`,
  headphones: (c) => `<path d="M95 235 L95 195 Q95 95 200 95 Q305 95 305 195 L305 235" fill="none" stroke="${c}" stroke-width="18" stroke-linecap="round"/><rect x="70" y="215" width="56" height="100" rx="24" fill="${c}"/><rect x="274" y="215" width="56" height="100" rx="24" fill="${c}"/><rect x="82" y="232" width="20" height="66" rx="10" fill="rgba(0,0,0,.25)"/><rect x="298" y="232" width="20" height="66" rx="10" fill="rgba(0,0,0,.25)"/>`,
  bottle: (c) => `<rect x="178" y="70" width="44" height="34" rx="8" fill="rgba(0,0,0,.4)"/><path d="M170 104 L230 104 L240 140 L240 340 Q240 360 220 360 L180 360 Q160 360 160 340 L160 140Z" fill="${c}"/><rect x="160" y="190" width="80" height="70" fill="rgba(255,255,255,.22)"/><text x="200" y="233" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="20" text-anchor="middle" fill="rgba(255,255,255,.9)" letter-spacing="2">HAKU</text>`,
  cap: (c) => `<path d="M90 230 Q90 120 200 120 Q310 120 310 230Z" fill="${c}"/><path d="M85 230 L345 230 Q350 255 320 258 L110 258 Q80 258 85 230Z" fill="rgba(0,0,0,.28)"/><circle cx="200" cy="124" r="9" fill="rgba(0,0,0,.3)"/><path d="M200 130 L200 228" stroke="rgba(0,0,0,.15)" stroke-width="3"/>`,
  sunglasses: (c) => `<path d="M60 190 L340 190" stroke="${c}" stroke-width="12" stroke-linecap="round"/><rect x="70" y="180" width="105" height="80" rx="30" fill="${c}"/><rect x="225" y="180" width="105" height="80" rx="30" fill="${c}"/><rect x="82" y="192" width="82" height="40" rx="20" fill="rgba(255,255,255,.18)"/><rect x="237" y="192" width="82" height="40" rx="20" fill="rgba(255,255,255,.18)"/>`,
  backpack: (c) => `<path d="M165 110 Q165 70 200 70 Q235 70 235 110" fill="none" stroke="rgba(0,0,0,.4)" stroke-width="10" stroke-linecap="round"/><rect x="105" y="105" width="190" height="265" rx="60" fill="${c}"/><rect x="140" y="215" width="120" height="85" rx="18" fill="rgba(0,0,0,.2)"/><path d="M140 250 L260 250" stroke="rgba(255,255,255,.7)" stroke-width="5"/><rect x="150" y="140" width="100" height="14" rx="7" fill="rgba(255,255,255,.35)"/>`,
  mug: (c) => `<path d="M105 140 L275 140 L268 330 Q266 352 244 352 L136 352 Q114 352 112 330Z" fill="${c}"/><path d="M272 175 Q338 175 335 238 Q332 292 262 292" fill="none" stroke="${c}" stroke-width="20" stroke-linecap="round"/><ellipse cx="190" cy="140" rx="85" ry="14" fill="rgba(0,0,0,.28)"/><text x="190" y="262" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="28" text-anchor="middle" fill="rgba(255,255,255,.88)" letter-spacing="3">HAKU</text>`,
  speaker: (c) => `<rect x="115" y="70" width="170" height="270" rx="34" fill="${c}"/><circle cx="200" cy="150" r="38" fill="rgba(0,0,0,.35)"/><circle cx="200" cy="150" r="14" fill="rgba(255,255,255,.25)"/><circle cx="200" cy="258" r="52" fill="rgba(0,0,0,.35)"/><circle cx="200" cy="258" r="20" fill="rgba(255,255,255,.25)"/>`,
  lamp: (c) => `<path d="M140 150 L260 150 L295 270 L105 270Z" fill="${c}"/><rect x="194" y="270" width="12" height="70" fill="rgba(0,0,0,.4)"/><rect x="150" y="338" width="100" height="16" rx="8" fill="rgba(0,0,0,.45)"/><circle cx="200" cy="228" r="26" fill="rgba(255,255,255,.5)"/>`,
};

function shade(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (v) => Math.max(0, Math.min(255, v + amt));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}

function svg(icon, color, variant = 1, label = '') {
  const draw = ICONS[icon] || ICONS.tee;
  const c = /^[0-9a-f]{6}$/i.test(color) ? '#' + color : '#222222';
  const bgs = [['#f4f4ef', '#e7e7df'], ['#c6f432', '#a9d81e'], ['#161616', '#2a2a2a']];
  const [b1, b2] = bgs[(Number(variant) - 1 + 3) % 3] || bgs[0];
  const dark = (Number(variant) - 1) % 3 === 2;
  // product colour must contrast against the background
  const fill = dark && shade(c, 0) === '#161616' ? '#444' : c;
  const t = label ? String(label).replace(/[<>&"']/g, '').slice(0, 40) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="${t || icon}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b1}"/><stop offset="1" stop-color="${b2}"/></linearGradient>
<filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="12" stdDeviation="10" flood-opacity=".22"/></filter></defs>
<rect width="400" height="400" fill="url(#g)"/>
<ellipse cx="200" cy="372" rx="110" ry="10" fill="rgba(0,0,0,.12)"/>
<g filter="url(#s)">${draw(fill)}</g>
</svg>`;
}

module.exports = { svg, ICONS };
