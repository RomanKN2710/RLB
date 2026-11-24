/* Wird beim Seitenwechsel gezeigt, bis der Server geantwortet hat (einige Seiten rechnen die ganze Saison durch). */
export default function Loading() {
  return (<div aria-busy="true" aria-label="Seite wird geladen">
    <div className="skeleton" style={{ height: 90 }} /><div className="skeleton" style={{ height: 220 }} /><div className="skeleton" style={{ height: 140 }} />
  </div>);
}
