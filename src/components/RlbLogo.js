/* RLB-Emblem als Inline-SVG (Piktogramm-Spieler auf Rot, Wortmarke darunter). Klassen dienen der Intro-Animation.
   PlayerFigure: minimalistische Figur (1000er-Raster) – Kopf, Rumpf-Kapsel, Glieder als Linien mit runden Enden;
   dazu Lauf- und Mitspieler-Pose für die Intro-Szene. */
export function PlayerFigure({ legClass = 'lg-leg', className = 'lg-player' }) {
  return (
    <g className={className}>
      <circle cx="408" cy="116" r="50" fill="#fff"/>
      <polyline points="392,212 362,330 338,440" fill="none" stroke="#fff" strokeWidth="112" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="352,222 208,204 90,244" fill="none" stroke="#fff" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="446,232 506,334 456,406" fill="none" stroke="#fff" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round"/>
      <g className={legClass}><polyline points="352,470 606,440 818,508" fill="none" stroke="#fff" strokeWidth="58" strokeLinecap="round" strokeLinejoin="round"/><polyline points="818,508 890,530" fill="none" stroke="#fff" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round"/></g>
      <polyline points="324,482 336,700 168,814" fill="none" stroke="#fff" strokeWidth="56" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="168,814 104,852" fill="none" stroke="#fff" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round"/>
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

const L = (pts, w) => <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke="#fff" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;

/** Laufende Figur (dribbelt nach rechts). Zwei Beinstellungen (Schrittwechsel) als eigene Gruppen für die Animation. */
export function PlayerRun({ className = 'sc-run' }) {
  return (
    <g className={className}>
      <circle cx="430" cy="118" r="50" fill="#fff" />
      {L([[404, 214], [382, 330], [356, 440]], 112)}
      {L([[380, 236], [262, 322], [312, 418]], 34)}
      {L([[452, 226], [566, 300], [506, 396]], 34)}
      <g className="sc-stride-a">{L([[366, 470], [524, 566], [566, 770]], 58)}{L([[566, 770], [628, 782]], 46)}{L([[336, 480], [246, 640], [116, 704]], 56)}{L([[116, 704], [60, 740]], 44)}</g>
      <g className="sc-stride-b">{L([[366, 470], [402, 650], [336, 826]], 58)}{L([[336, 826], [404, 838]], 46)}{L([[336, 480], [372, 640], [452, 800]], 56)}{L([[452, 800], [516, 792]], 44)}</g>
    </g>
  );
}

/** Stehender Mitspieler (blickt nach links), Spielbein separat für den Rückpass. */
export function PlayerStand({ className = 'sc-mate', legClass = 'sc-mate-leg' }) {
  return (
    <g className={className}>
      <circle cx="500" cy="120" r="50" fill="#fff" />
      {L([[500, 216], [500, 470]], 110)}
      {L([[456, 244], [382, 342], [424, 432]], 34)}
      {L([[544, 244], [618, 342], [578, 432]], 34)}
      {L([[470, 500], [442, 700], [400, 860]], 56)}{L([[400, 860], [340, 866]], 44)}
      <g className={legClass}>{L([[530, 500], [560, 700], [620, 860]], 56)}{L([[620, 860], [560, 868]], 44)}</g>
    </g>
  );
}
