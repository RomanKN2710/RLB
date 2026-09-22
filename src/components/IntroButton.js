'use client';
import RlbLogo from './RlbLogo';
/** Kleines Emblem im Seitenkopf; Antippen spielt das Intro erneut ab. */
export default function IntroButton({ height = 38 }) {
  return <button type="button" className="logo-btn" title="Intro abspielen" aria-label="Intro abspielen" onClick={() => window.dispatchEvent(new Event('rlb-intro'))}><RlbLogo height={height} wordmark={false} /></button>;
}
