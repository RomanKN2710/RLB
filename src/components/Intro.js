'use client';
import { useEffect, useRef, useState } from 'react';
import RlbLogo from './RlbLogo';
import IntroScene, { SCENE_MS } from './IntroScene';

/* Intro beim Betreten der App, einmal pro Browser-Sitzung: Canvas-Szene (IntroScene: Jonglieren, Lupfer,
   Volley in den Winkel, Jubel), danach wird die Szene zum Emblem.
   Tippen überspringt, reduzierte Bewegung schaltet das Intro ab. */

export default function Intro({ leader, line }) {
  const [show, setShow] = useState(false); const [phase, setPhase] = useState('scene'); const [run, setRun] = useState(0); const decided = useRef(null); const timers = useRef([]);
  const reduced = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = () => {
    timers.current.forEach(clearTimeout);
    const rm = reduced(); setPhase(rm ? 'emblem' : 'scene'); setShow(true); setRun(r => r + 1);
    const tEmblem = rm ? 0 : SCENE_MS;
    timers.current = [setTimeout(() => setPhase('emblem'), tEmblem), setTimeout(() => setPhase('leave'), tEmblem + 2300), setTimeout(() => setShow(false), tEmblem + 2900)];
  };
  useEffect(() => {
    // Automatisch höchstens alle vier Stunden (Wert im localStorage), erzwingbar über ?intro=1; Entscheidung nur einmal je Einbau
    if (decided.current == null) {
      let play = false; const KEY = 'rlb_intro_at';
      try { const force = new URLSearchParams(window.location.search).get('intro') === '1'; const last = Number(localStorage.getItem(KEY) || 0);
        play = force || Date.now() - last > 4 * 3600 * 1000; if (play) localStorage.setItem(KEY, String(Date.now())); } catch (e) { play = false; }
      decided.current = play;
    }
    if (decided.current) start();
    const onReplay = () => start(); window.addEventListener('rlb-intro', onReplay);
    return () => { window.removeEventListener('rlb-intro', onReplay); timers.current.forEach(clearTimeout); };
  }, []);
  if (!show) return null;
  const skip = () => { timers.current.forEach(clearTimeout); setPhase('leave'); setTimeout(() => setShow(false), 500); };
  return (
    <div key={run} className={`intro ${phase}`} onClick={skip} role="presentation">
      <div className="intro-scene"><IntroScene /></div>
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
