export const fmtDt = iso => iso ? new Date(iso).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
export const fmtRp = n => Number.isInteger(n) ? String(n) : Number(n).toFixed(1);
export const chf = n => (Math.round(Number(n) * 100) / 100).toLocaleString('de-CH', { maximumFractionDigits: 2 });
export function Msg({ state }) { if (!state || !state.msg) return null; return <div className={state.ok ? 'okmsg' : 'err'}>{state.msg}</div>; }
