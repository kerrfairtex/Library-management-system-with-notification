export default function DeskLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="page-head">
        <div className="page-title" style={{ opacity: 0.4 }}>Loading…</div>
      </div>
      <div className="circ-grid">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="circ-card"
            style={{ minHeight: 140, opacity: 0.5 }}
          />
        ))}
      </div>
    </div>
  );
}
