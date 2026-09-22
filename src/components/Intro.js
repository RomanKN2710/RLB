'use client';
import { useEffect, useState } from 'react';
import RlbLogo from './RlbLogo';

/* Intro beim Betreten der App: Emblem baut sich auf, Ball rollt ins Bild, Wortmarke fällt ein, dann gleitet alles weg.
   Läuft einmal pro Browser-Sitzung, Tipp/Klick überspringt, bei reduzierter Bewegung gar nicht. */
export default function Intro({ line }) {
  const [show, setShow] = useState(false); const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let seen = false; try { seen = sessionStorage.getItem('rlb_intro') === '1'; sessionStorage.setItem('rlb_intro', '1'); } catch (e) { seen = true; }
    if (seen || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    setShow(true);
    const t1 = setTimeout(() => setLeaving(true), 2600); const t2 = setTimeout(() => setShow(false), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (!show) return null;
  const skip = () => { setLeaving(true); setTimeout(() => setShow(false), 500); };
  return (
    <div className={`intro ${leaving ? 'leave' : ''}`} onClick={skip} role="presentation">
      <div className="intro-box">
        <RlbLogo height={260} className="intro-logo" />
        <div className="intro-sub">Rotissery League Bundesliga · Saison 2026/27</div>
        {line && <div className="intro-line">{line}</div>}
        <div className="intro-skip">tippen zum Überspringen</div>
      </div>
    </div>
  );
}
