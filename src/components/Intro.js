'use client';
import { useEffect, useRef, useState } from 'react';
import RlbLogo, { PlayerFigure, PlayerRun, PlayerStand } from './RlbLogo';

/* Intro beim Betreten der App, einmal pro Browser-Sitzung: Der Spieler dribbelt von links, passt zum Mitspieler vor dem Tor,
   bekommt den Ball hoch zurück und trifft per Volley in den Winkel – Netz wackelt, «TOR!» – dann wird die Szene zum Emblem.
   Tippen überspringt, reduzierte Bewegung schaltet das Intro ab. */
const BALL = [[0, -260, 860], [6, -100, 826], [12, 60, 860], [18, 220, 826], [24, 380, 860], [30, 540, 826], [36, 690, 860], [42, 690, 860],
  [55, 1040, 858], [58, 1040, 858], [66, 950, 360], [75, 850, 625], [80, 850, 625], [86, 1050, 400], [92, 1250, 330], [100, 1250, 330]];
const BALL_KF = '@keyframes sc-ball{' + BALL.map(([p, x, y]) => `${p}%{transform:translate(${x}px,${y}px) rotate(${Math.round(p * 14)}deg)}`).join('') + '}';

export default function Intro({ leader, line }) {
  const [show, setShow] = useState(false); const [phase, setPhase] = useState('scene'); const decided = useRef(null);
  useEffect(() => {
    if (decided.current == null) { let seen = false; try { seen = sessionStorage.getItem('rlb_intro') === '1'; sessionStorage.setItem('rlb_intro', '1'); } catch (e) { seen = true; }
      decided.current = !(seen || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)); }
    if (!decided.current) return;
    setShow(true);
    const t = [setTimeout(() => setPhase('emblem'), 3900), setTimeout(() => setPhase('leave'), 6200), setTimeout(() => setShow(false), 6800)];
    return () => t.forEach(clearTimeout);
  }, []);
  if (!show) return null;
  const skip = () => { setPhase('leave'); setTimeout(() => setShow(false), 500); };
  return (
    <div className={`intro ${phase}`} onClick={skip} role="presentation">
      <style>{BALL_KF}</style>
      <div className="intro-scene">
        <svg viewBox="0 0 1400 1000" className="scene-svg" aria-hidden="true">
          <line x1="-200" y1="880" x2="1600" y2="880" stroke="#fff" strokeOpacity=".5" strokeWidth="6" />
          <g className="sc-goal" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round">
            <path d="M1130 300 L1130 860 M1130 300 L1380 260 L1380 860" />
            <g className="sc-net" strokeWidth="3" strokeOpacity=".7">
              {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <line key={'h' + i} x1="1130" y1={300 + i * 70} x2="1380" y2={260 + i * 75} />)}
              {[0, 1, 2, 3, 4, 5].map(i => <line key={'v' + i} x1={1130 + i * 50} y1={300 - i * 8} x2={1130 + i * 50} y2="860" />)}
            </g>
          </g>
          <g transform="translate(760 470) scale(.45)"><PlayerStand /></g>
          <g className="sc-runner"><g transform="scale(.82)"><PlayerRun /></g></g>
          <g className="sc-volley" transform="translate(120 190) scale(.82)"><PlayerFigure legClass="sc-leg" className="sc-fig" /></g>
          <circle className="sc-ball" cx="0" cy="0" r="40" fill="#fff" />
          <path className="sc-ball" d="M-40 0 A40 40 0 0 1 40 0" fill="none" stroke="#D20515" strokeWidth="6" />
          <text className="sc-tor" x="870" y="200" textAnchor="middle" fontFamily="'Barlow Condensed',sans-serif" fontWeight="800" fontSize="230" fill="#fff" letterSpacing="10">TOR!</text>
        </svg>
      </div>
      <div className="intro-box">
        <RlbLogo height={260} className="intro-logo" />
        <div className="intro-sub">Rotissery League Bundesliga · Saison 2026/27</div>
        {leader && <div className="intro-line">Tabellenführer: <b>{leader}</b></div>}
        {line && <div className="intro-line2">{line}</div>}
        <div className="intro-skip">tippen zum Überspringen</div>
      </div>
    </div>
  );
}
