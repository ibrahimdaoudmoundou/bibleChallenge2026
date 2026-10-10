// Diagrammes simples en HTML/CSS (aucune bibliothèque) : une seule couleur, valeurs écrites à côté des barres.

// Colonnes verticales (évolution dans le temps). data : [{ key, label, value, title }]
export function Columns({ data, height = 150, empty = 'Pas encore de données.', unit = '' }) {
  if (!data.length) return <p className="muted small">{empty}</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = Math.max(1, Math.ceil(data.length / 10));
  const best = data.reduce((a, d) => (d.value > a.value ? d : a), data[0]);
  return (
    <div className="cols-wrap">
      <span className="cols-max">Maximum : {best.value}{unit} ({best.label})</span>
      <div className="cols" style={{ height }} role="img" aria-label={`Maximum ${best.value}${unit} le ${best.label}`}>
        {data.map((d) => (
          <div key={d.key} className="col" title={d.title || `${d.label} : ${d.value}${unit}`} tabIndex={0}>
            <span className="col-tip">{d.title || `${d.label} : ${d.value}${unit}`}</span>
            <i style={{ height: `${(100 * d.value) / max}%` }} className={d.value ? '' : 'zero'} />
          </div>
        ))}
      </div>
      <div className="cols-axis" aria-hidden="true">
        {data.map((d, i) => <span key={d.key}>{i % step === 0 || i === data.length - 1 ? d.label : ''}</span>)}
      </div>
    </div>
  );
}

// Barres horizontales avec étiquettes. items : [{ label, value, sub? }]
export function Bars({ items, empty = 'Pas encore de données.', onPick }) {
  if (!items.length) return <p className="muted small">{empty}</p>;
  const max = Math.max(1, ...items.map((d) => d.value));
  return (
    <ul className="hbars">
      {items.map((d) => {
        const inner = (
          <>
            <span className="hbar-label">{d.label}</span>
            <span className="hbar-track"><i style={{ width: d.value ? `${Math.max(2, (100 * d.value) / max)}%` : 0 }} /></span>
            <b className="hbar-value">{d.value}{d.sub ? <small> {d.sub}</small> : null}</b>
          </>
        );
        return (
          <li key={d.label}>
            {onPick ? <button type="button" className="hbar" onClick={() => onPick(d)} title={`Voir : ${d.label}`}>{inner}</button>
              : <div className="hbar">{inner}</div>}
          </li>
        );
      })}
    </ul>
  );
}
