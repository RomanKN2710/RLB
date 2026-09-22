/* RLB-Emblem als Inline-SVG (Piktogramm-Spieler auf Rot, Wortmarke darunter). Klassen dienen der Intro-Animation. */
export default function RlbLogo({ height = 40, wordmark = true, className = '' }) {
  const vbH = wordmark ? 1250 : 1000;
  return (
    <svg className={`rlb-logo ${className}`} viewBox={`0 0 1000 ${vbH}`} height={height} width={height * 1000 / vbH} role="img" aria-label="RLB">
      <rect className="lg-bg" x="0" y="0" width="1000" height="1000" fill="#D20515" />
      <g className="lg-player" fill="#fff" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="392" cy="112" r="52" stroke="none" />
        <path d="M385 165 L378 195" fill="none" strokeWidth="30" />
        <path d="M318 195 Q300 300 268 425 L378 442 Q425 320 458 190 Z" strokeWidth="14" />
        <path d="M266 420 L382 438 L398 535 L258 522 Z" strokeWidth="12" />
        <path d="M332 212 L205 195" fill="none" strokeWidth="40" />
        <path d="M205 195 L82 232" fill="none" strokeWidth="30" />
        <circle cx="74" cy="236" r="16" stroke="none" />
        <path d="M448 222 L505 320" fill="none" strokeWidth="38" />
        <path d="M505 320 L470 405" fill="none" strokeWidth="30" />
        <g className="lg-leg">
          <path d="M365 480 L600 452" fill="none" strokeWidth="84" />
          <path d="M600 452 L790 500" fill="none" strokeWidth="62" />
          <path d="M776 470 L858 490 L888 522 L872 548 L830 545 L770 528 Z" strokeWidth="8" />
        </g>
        <path d="M290 505 L332 700" fill="none" strokeWidth="80" />
        <path d="M332 700 L165 815" fill="none" strokeWidth="60" />
        <path d="M118 780 L188 802 L178 862 L122 878 L86 838 Z" strokeWidth="8" />
      </g>
      <circle className="lg-ball" cx="905" cy="415" r="56" fill="#fff" />
      {wordmark && <text className="lg-text" x="500" y="1228" textAnchor="middle" fontFamily="'Barlow Condensed','Arial Black',sans-serif" fontWeight="800" fontSize="270" letterSpacing="30" fill="var(--ink, #1A1A1A)">RLB</text>}
    </svg>
  );
}
