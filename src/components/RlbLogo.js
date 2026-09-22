/* RLB-Emblem als Inline-SVG (Piktogramm-Spieler auf Rot, Wortmarke darunter). Klassen dienen der Intro-Animation.
   PlayerFigure: minimalistische Figur (1000er-Raster) – Kopf, Rumpf-Kapsel, Glieder als Linien mit runden Enden. */
export function PlayerFigure({ legClass = 'lg-leg', className = 'lg-player' }) {
  return (
    <g className={className}>
      <circle cx="408" cy="116" r="46" fill="#fff"/>
      <polyline points="392,212 362,330 338,440" fill="none" stroke="#fff" strokeWidth="96" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="352,222 208,204 90,244" fill="none" stroke="#fff" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="446,232 506,334 456,406" fill="none" stroke="#fff" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round"/>
      <g className={legClass}><polyline points="352,470 606,440 818,508" fill="none" stroke="#fff" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round"/><polyline points="818,508 890,530" fill="none" stroke="#fff" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round"/></g>
      <polyline points="324,482 336,700 168,814" fill="none" stroke="#fff" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="168,814 104,852" fill="none" stroke="#fff" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
  );
}

export default function RlbLogo({ height = 40, wordmark = true, className = '' }) {
  const vbH = wordmark ? 1250 : 1000;
  return (
    <svg className={`rlb-logo ${className}`} viewBox={`0 0 1000 ${vbH}`} height={height} width={height * 1000 / vbH} role="img" aria-label="RLB">
      <rect className="lg-bg" x="0" y="0" width="1000" height="1000" fill="#D20515" />
      <PlayerFigure />
      <circle className="lg-ball" cx="905" cy="400" r="56" fill="#fff" />
      {wordmark && <text className="lg-text" x="500" y="1228" textAnchor="middle" fontFamily="'Barlow Condensed','Arial Black',sans-serif" fontWeight="800" fontSize="270" letterSpacing="30" fill="var(--ink, #1A1A1A)">RLB</text>}
    </svg>
  );
}
