'use client';
import { useEffect, useRef, useState } from 'react';
import RlbLogo, { PlayerFigure } from './RlbLogo';

/* Intro beim Betreten der App, einmal pro Browser-Sitzung:
   Szene auf Rot – der Spieler (mit dem Namen des Tabellenführers auf dem Rücken) läuft an, schiesst, der Ball fliegt ins Tor,
   das Netz wackelt, «TOR!» – dann wird die Szene zum Emblem mit der Wortmarke RLB. Tippen überspringt, reduzierte Bewegung
   schaltet das Intro ab. */
export default function Intro({ leader, line }) {
  const [show, setShow] = useState(false); const [phase, setPhase] = useState('scene'); const decided = useRef(null);
  useEffect(() => {
    // Entscheidung nur einmal je Einbau treffen (React ruft Effekte im Entwicklungsmodus doppelt auf)
    if (decided.current == null) { let seen = false; try { seen = sessionStorage.getItem('rlb_intro') === '1'; sessionStorage.setItem('rlb_intro', '1'); } catch (e) { seen = true; }
      decided.current = !(seen || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)); }
    if (!decided.current) return;
    setShow(true);
    const t = [setTimeout(() => setPhase('emblem'), 2500), setTimeout(() => setPhase('leave'), 5000), setTimeout(() => setShow(false), 5600)];
    return () => t.forEach(clearTimeout);
  }, []);
  if (!show) return null;
  const skip = () => { setPhase('leave'); setTimeout(() => setShow(false), 500); };
  return (
    <div className={`intro ${phase}`} onClick={skip} role="presentation">
      <div className="intro-scene">
        <svg viewBox="0 0 1400 1000" className="scene-svg" aria-hidden="true">
          <line x1="0" y1="880" x2="1400" y2="880" stroke="#fff" strokeOpacity=".5" strokeWidth="6" />
          <g className="sc-goal" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round">
            <path d="M1130 300 L1130 860 M1130 300 L1380 260 L1380 860" />
            <g className="sc-net" strokeWidth="3" strokeOpacity=".7">
              {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <line key={'h' + i} x1="1130" y1={300 + i * 70} x2="1380" y2={260 + i * 75} />)}
              {[0, 1, 2, 3, 4, 5].map(i => <line key={'v' + i} x1={1130 + i * 50} y1={300 - i * 8} x2={1130 + i * 50} y2="860" />)}
            </g>
          </g>
          <g className="sc-player" transform="translate(120 60) scale(.82)"><PlayerFigure name={leader} number={leader ? 1 : null} legClass="sc-leg" className="sc-fig" /></g>
          <circle className="sc-ball" cx="880" cy="500" r="40" fill="#fff" />
          <text className="sc-tor" x="870" y="200" textAnchor="middle" fontFamily="'Barlow Condensed',sans-serif" fontWeight="800" fontSize="230" fill="#fff" letterSpacing="10">TOR!</text>
        </svg>
      </div>
      <div className="intro-box">
        <RlbLogo height={260} className="intro-logo" name={leader} number={leader ? 1 : null} />
        <div className="intro-sub">Rotissery League Bundesliga · Saison 2026/27</div>
        {leader && <div className="intro-line">Tabellenführer: <b>{leader}</b></div>}
        {line && <div className="intro-line2">{line}</div>}
        <div className="intro-skip">tippen zum Überspringen</div>
      </div>
    </div>
  );
}
