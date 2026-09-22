/* Drei Auszeichnungen einer Runde als Karten. */
export default function Auszeichnungen({ awards, me, compact }) {
  if (!awards || !awards.length) return <div className="mini">Keine herausragende Leistung in dieser Runde – alle im Mittelfeld.</div>;
  return <div className="awards">{awards.map(a => <div key={a.key} className={`award ${a.manager_id === me ? 'me' : ''}`}><div className="award-icon">{a.icon}</div><div><div className="award-title">{a.title}</div><div className="award-name">{a.manager}</div>{!compact && <div className="mini">{a.detail}</div>}</div></div>)}</div>;
}
