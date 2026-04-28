const SUGGESTION_ICONS = {
  viewport: "📐", images: "🖼️", typography: "🔤", touch: "👆", performance: "⚡", layout: "📦",
};

function scoreClass(score) {
  if (score === null || score === undefined) return "";
  if (score >= 80) return "score-good";
  if (score >= 50) return "score-medium";
  return "score-poor";
}

export default function SuggestionPanel({ suggestions, score }) {
  return (
    <div className="suggestion-panel">
      <div className="score-row">
        <h3>Responsiveness Score</h3>
        <div className={`score-circle ${scoreClass(score)}`}>
          {score !== null && score !== undefined ? Math.round(score) : "—"}
        </div>
      </div>
      {suggestions && suggestions.length > 0 ? (
        <>
          <h3 style={{ marginBottom: "0.75rem" }}>Resolution Suggestions</h3>
          <ul className="suggestion-list">
            {suggestions.map((s, i) => (
              <li key={i} className="suggestion-item">
                <span className="suggestion-icon">{SUGGESTION_ICONS[s.category] || "💡"}</span>
                <div><strong>{s.title}</strong><p>{s.detail}</p></div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">Run a scan to see suggestions.</p>
      )}
    </div>
  );
}
