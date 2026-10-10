import { useEffect, useMemo, useState } from 'react';
import { rpc } from '../supabase.js';
import { reminderText, waLink, waShare } from '../../shared/messages.js';
import { Icon } from '../ui/icons.jsx';
import { Chip, STATUS, Field, Loading, Sheet } from '../ui/kit.jsx';
import { SORTS, groupCount, normKey, pct, place, dayKey } from './util.js';
import { exportTable, exportParticipantPdf } from './exports.js';

const MEDALS = ['🥇', '🥈', '🥉'];
const ordinal = (i) => (i === 0 ? '1er' : `${i + 1}e`);

export const V2Notice = () => (
  <div className="notice"><Icon name="help" /> <p>Cette fonction sera disponible après la mise à jour de la base : exécutez <b>supabase/migration_v2.sql</b> dans Supabase (SQL Editor).</p></div>
);

/* ------------------------------------------------------------------ menu d'export */
export function ExportButtons({ onExport, label = 'Exporter' }) {
  const [busy, setBusy] = useState('');
  const run = async (fmt) => {
    setBusy(fmt);
    try { await onExport(fmt); } catch { window.alert('Export impossible pour le moment. Réessayez.'); }
    setBusy('');
  };
  return (
    <span className="export-group" role="group" aria-label={label}>
      <span className="export-label"><Icon name="download" size={15} /> {label}</span>
      {['pdf', 'xlsx', 'csv'].map((f) => (
        <button key={f} type="button" className="mini" disabled={!!busy} onClick={() => run(f)}>
          {busy === f ? '…' : f === 'xlsx' ? 'Excel' : f.toUpperCase()}
        </button>
      ))}
    </span>
  );
}

const participantColumns = (total) => [
  { header: 'Code', get: (p) => p.code, width: 9, pdfWidth: 46 },
  { header: 'Nom', get: (p) => p.name, width: 26 },
  { header: 'Téléphone', get: (p) => `+${p.phone}`, width: 16 },
  { header: 'Pays', get: (p) => p.country || '', width: 14 },
  { header: 'Ville', get: (p) => p.city || '', width: 14 },
  { header: 'Particip. préc.', get: (p) => p.previous_participations ?? '', width: 10 },
  { header: 'Statut', get: (p) => STATUS[p.statut]?.label || p.statut, width: 16 },
  { header: 'Chapitres lus', get: (p) => p.chap_lus, width: 11 },
  { header: '%', get: (p) => pct(p, total), width: 6 },
  { header: 'Retard', get: (p) => p.retard, width: 8 },
  { header: 'Rapports', get: (p) => p.nb_rapports ?? '', width: 9 },
  { header: 'Jours actifs', get: (p) => p.jours_actifs ?? '', width: 10 },
  { header: 'Dernier rapport', get: (p) => (p.dernier_rapport ? new Date(p.dernier_rapport).toLocaleDateString('fr-FR') : ''), width: 14 },
  { header: 'Ajouté par', get: (p) => p.added_by || '', width: 22 },
];

/* ------------------------------------------------------------------ liste des participants */
export function Participants({ s, v2, reload, filter, setFilter, preset, toast }) {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [prev, setPrev] = useState('');
  const [origin, setOrigin] = useState('');
  const [sort, setSort] = useState('code');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(null);       // participant affiché
  const [adding, setAdding] = useState(false);
  const [podium, setPodium] = useState(false);
  const [reportsExport, setReportsExport] = useState(false);

  useEffect(() => {
    if (!preset) return;
    if (preset.country !== undefined) { setCountry(preset.country); setCity(''); }
    if (preset.city !== undefined) setCity(preset.city);
    if (preset.sort) setSort(preset.sort);
    if (preset.podium) setPodium(true);
  }, [preset]);

  const all = useMemo(() => s?.participants || [], [s]);
  const countries = useMemo(() => groupCount(all, (p) => p.country), [all]);
  const cities = useMemo(() => groupCount(all.filter((p) => !country || normKey(p.country) === country), (p) => p.city), [all, country]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return all.filter((p) =>
      (!filter || p.statut === filter) &&
      (!country || normKey(p.country) === country) &&
      (!city || normKey(p.city) === city) &&
      (!prev || (prev === '0' ? !p.previous_participations : (p.previous_participations || 0) >= Number(prev))) &&
      (!origin || (origin === 'admin' ? !!p.added_by : !p.added_by)) &&
      (!needle || p.name.toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle) || (digits && p.phone.includes(digits))))
      .sort(SORTS[sort].cmp);
  }, [all, q, filter, country, city, prev, origin, sort]);

  if (!s) return <Loading />;
  const total = s.total_chapters || 1;
  const ranked = SORTS[sort].rank;

  const filterText = [
    filter && STATUS[filter]?.label, country && countries.find((c) => c.key === country)?.label,
    city && cities.find((c) => c.key === city)?.label,
    prev === '0' ? 'Première participation' : prev ? `${prev} participation(s) ou plus` : '',
    origin === 'admin' ? 'Ajoutés par un admin' : origin === 'self' ? 'Inscrits eux-mêmes' : '', q && `« ${q} »`,
  ].filter(Boolean).join(', ');

  const resetPin = async (p) => {
    if (!window.confirm(`Effacer le code secret de ${p.name} ?`)) return;
    setBusy(p.id); await rpc('admin_reset_pin', { p_participant: p.id }); await reload(); setBusy(''); toast('Code secret effacé.');
  };
  const remove = async (p) => {
    if (!window.confirm(`Supprimer ${p.name} et tous ses rapports ? Cette action est définitive.`)) return;
    setBusy(p.id); await rpc('admin_delete_participant', { p_participant: p.id }); await reload(); setBusy(''); toast('Participant supprimé.');
  };
  const doExport = (format) => exportTable({
    format, title: `Participants — ${s.challenge.name}`,
    subtitle: `${list.length} participant(s)${filterText ? ` · Filtre : ${filterText}` : ''} · Tri : ${SORTS[sort].label} · Jour ${s.jour}`,
    columns: [...(ranked ? [{ header: 'Rang', get: (p) => list.indexOf(p) + 1, width: 6, pdfWidth: 32 }] : []), ...participantColumns(total)],
    rows: list, filename: `participants-${s.challenge.slug}`,
  });
  const clearFilters = () => { setQ(''); setFilter(''); setCountry(''); setCity(''); setPrev(''); setOrigin(''); };
  const current = open ? all.find((p) => p.id === open) : null;

  return (
    <>
      <header className="head head-row">
        <div><h1>Participants</h1><p className="muted">{list.length} affiché{list.length > 1 ? 's' : ''} sur {all.length}</p></div>
        <div className="head-actions">
          <button className="btn primary fit" onClick={() => setAdding(true)} disabled={!v2}><Icon name="plus" /> Ajouter un participant</button>
        </div>
      </header>
      {!v2 ? <V2Notice /> : null}

      <div className="filters">
        <label className="search"><Icon name="search" size={18} /><input placeholder="Nom, numéro ou code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" /></label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrer par statut">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={country} onChange={(e) => { setCountry(e.target.value); setCity(''); }} aria-label="Filtrer par pays">
          <option value="">Tous les pays</option>
          {countries.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.value})</option>)}
        </select>
        <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Filtrer par ville">
          <option value="">Toutes les villes</option>
          {cities.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.value})</option>)}
        </select>
        <select value={prev} onChange={(e) => setPrev(e.target.value)} aria-label="Filtrer par participations précédentes">
          <option value="">Toutes les participations</option>
          <option value="0">Première participation</option>
          <option value="1">Déjà participé (1 fois ou plus)</option>
          <option value="2">2 fois ou plus</option>
          <option value="3">3 fois ou plus</option>
        </select>
        <select value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Filtrer par origine">
          <option value="">Inscrits et ajoutés</option>
          <option value="self">Inscrits eux-mêmes</option>
          <option value="admin">Ajoutés par un admin</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier">
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Tri : {v.label}</option>)}
        </select>
      </div>
      <div className="toolbar">
        {filterText ? <button className="mini" onClick={clearFilters}><Icon name="close" size={14} /> Effacer les filtres</button> : null}
        <button className="mini gold" onClick={() => setPodium(true)} disabled={!list.length}><Icon name="trophy" size={15} /> Podium</button>
        <ExportButtons onExport={doExport} label="Liste" />
        <button className="mini" onClick={() => setReportsExport(true)} disabled={!v2}><Icon name="notes" size={15} /> Exporter les rapports</button>
      </div>

      {list.length === 0 ? <p className="muted empty-line">Aucun participant ne correspond à cette recherche.</p> : (
        <div className="tablewrap">
          <table className="table">
            <thead><tr>{ranked ? <th>#</th> : null}<th>Participant</th><th>Statut</th><th>Lecture</th><th>Régularité</th><th>Prochaine portion</th><th><span className="sr">Actions</span></th></tr></thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={p.id}>
                  {ranked ? <td className="rank">{i < 3 ? MEDALS[i] : i + 1}</td> : null}
                  <td className="who-cell">
                    <button className="linkish" onClick={() => setOpen(p.id)}><b>{p.name}</b></button>
                    <small>{p.code} · +{p.phone}{place(p) ? ` · ${place(p)}` : ''}</small>
                    {p.added_by ? <small className="tag">Ajouté par un admin</small> : null}
                  </td>
                  <td><Chip status={p.statut} /></td>
                  <td className="read">
                    <div className="mini-meter"><i style={{ width: `${Math.min(100, pct(p, total))}%` }} /></div>
                    <small>{pct(p, total)} % · {p.chap_lus} ch.{p.retard > 0 ? `, retard ${p.retard}` : ''}</small>
                  </td>
                  <td className="nowrap"><small>{p.nb_rapports ?? '—'} rapport{(p.nb_rapports || 0) > 1 ? 's' : ''}</small><small>{p.jours_actifs ?? '—'} jour{(p.jours_actifs || 0) > 1 ? 's' : ''} actif{(p.jours_actifs || 0) > 1 ? 's' : ''}</small></td>
                  <td className="next-cell">{p.next ? `P${p.next.n}, ${p.next.label}` : '—'}</td>
                  <td className="row-actions">
                    <button className="icon-btn" onClick={() => setOpen(p.id)} title="Fiche de suivi" aria-label={`Fiche de ${p.name}`}><Icon name="eye" size={18} /></button>
                    <a className="icon-btn wa" href={waLink(p.phone, reminderText(p, s))} target="_blank" rel="noreferrer" title="Relancer sur WhatsApp" aria-label={`Relancer ${p.name} sur WhatsApp`}><Icon name="send" size={18} /></a>
                    {p.protected ? <button className="icon-btn" disabled={busy === p.id} onClick={() => resetPin(p)} title="Effacer le code secret" aria-label={`Effacer le code de ${p.name}`}><Icon name="key" size={18} /></button> : null}
                    <button className="icon-btn danger" disabled={busy === p.id} onClick={() => remove(p)} title="Supprimer" aria-label={`Supprimer ${p.name}`}><Icon name="trash" size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {current ? <ParticipantSheet p={current} s={s} v2={v2} close={() => setOpen(null)} reload={reload} toast={toast} /> : null}
      <AddParticipant open={adding} s={s} close={() => setAdding(false)} reload={reload} toast={toast}
        done={(id) => { setAdding(false); setOpen(id); }} />
      <Podium open={podium} close={() => setPodium(false)} list={list} sort={sort} s={s} filterText={filterText} />
      <ReportsExport open={reportsExport} close={() => setReportsExport(false)} s={s} />
    </>
  );
}

/* ------------------------------------------------------------------ fiche d'un participant */
function ParticipantSheet({ p, s, v2, close, reload, toast }) {
  const total = s.total_chapters || 1;
  const [reports, setReports] = useState(null);
  const [edit, setEdit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    if (!v2) { setReports([]); return; }
    const r = await rpc('admin_participant_reports', { p_participant: p.id });
    setReports(r.list || []);
  };
  useEffect(() => { setReports(null); setEdit(false); setAdding(false); load().catch(() => setReports([])); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  const delReport = async (r) => {
    if (!window.confirm(`Supprimer ce rapport du ${new Date(r.created_at).toLocaleDateString('fr-FR')} (P${r.portion_n}, ${r.chapters} ch.) ?`)) return;
    const x = await rpc('admin_delete_report', { p_id: r.id });
    if (x.error) return setMsg(x.error);
    toast('Rapport supprimé.'); await reload(); await load();
  };

  return (
    <Sheet open onClose={close} title={p.name} wide>
      <div className="fiche">
        <div className="fiche-top">
          <Chip status={p.statut} />
          <span className="muted small">{p.code} · +{p.phone}{place(p) ? ` · ${place(p)}` : ''}</span>
        </div>
        <div className="meter small-meter"><div className="meter-fill" style={{ width: `${Math.min(100, pct(p, total))}%` }} /></div>
        <dl className="fiche-figs">
          <div><dt>Lu</dt><dd>{pct(p, total)} %</dd><small>{p.chap_lus} / {total} ch.</small></div>
          <div><dt>Retard</dt><dd>{p.retard}</dd><small>chapitres</small></div>
          <div><dt>Rapports</dt><dd>{p.nb_rapports ?? '—'}</dd><small>{p.jours_actifs ?? '—'} jour{(p.jours_actifs || 0) > 1 ? 's' : ''} actif{(p.jours_actifs || 0) > 1 ? 's' : ''}</small></div>
          <div><dt>Portions</dt><dd>{p.completes}</dd><small>terminées</small></div>
        </dl>
        <p className="small muted">
          Prochaine lecture : {p.next ? `P${p.next.n}, ${p.next.label}` : '—'} · Inscrit le {new Date(p.created_at).toLocaleDateString('fr-FR')}
          {p.previous_participations != null ? ` · Participations précédentes : ${p.previous_participations}` : ''}
          {p.added_by ? ` · Ajouté par ${p.added_by}` : ''}
        </p>

        <div className="fiche-actions">
          <button className="mini" onClick={() => { setAdding(!adding); setEdit(false); }} disabled={!v2}><Icon name="pen" size={15} /> Saisir un rapport</button>
          <button className="mini" onClick={() => { setEdit(!edit); setAdding(false); }} disabled={!v2}><Icon name="edit" size={15} /> Modifier</button>
          <a className="mini wa" href={waLink(p.phone, reminderText(p, s))} target="_blank" rel="noreferrer"><Icon name="send" size={15} /> WhatsApp</a>
          <button className="mini" disabled={!reports}
            onClick={() => exportParticipantPdf({ p, reports, s, statusLabel: STATUS[p.statut]?.label || p.statut }).catch(() => window.alert('Export impossible.'))}>
            <Icon name="download" size={15} /> Fiche PDF
          </button>
        </div>
        {!v2 ? <V2Notice /> : null}
        {msg ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{msg}</p></div> : null}

        {edit ? <EditForm p={p} done={async () => { setEdit(false); toast('Participant modifié.'); await reload(); }} /> : null}
        {adding ? <AdminReportForm p={p} s={s} done={async () => { setAdding(false); toast('Rapport enregistré.'); await reload(); await load(); }} /> : null}

        <h3 className="fiche-h">Rapports</h3>
        {reports === null ? <Loading /> : reports.length === 0 ? <p className="muted small">Aucun rapport pour l'instant.</p> : (
          <ol className="entries admin-entries">
            {reports.map((r) => (
              <li key={r.id}>
                <div className="entry-meta">
                  <b>{r.label ? `P${r.portion_n} — ${r.label}` : `Portion ${r.portion_n}`}</b>
                  <span>{new Date(r.created_at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}, {r.chapters} ch.
                    <button className="icon-btn danger tiny" onClick={() => delReport(r)} title="Supprimer ce rapport" aria-label="Supprimer ce rapport"><Icon name="trash" size={15} /></button>
                  </span>
                </div>
                {r.verse ? <blockquote>{r.verse}</blockquote> : null}
                {r.learned ? <p className="small"><b>Appris :</b> {r.learned}</p> : null}
                {r.application ? <p className="small"><b>Application :</b> {r.application}</p> : null}
                {r.question ? <p className="small"><b>Question :</b> {r.question}</p> : null}
                {r.entered_by ? <p className="small muted">Saisi par {r.entered_by}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Sheet>
  );
}

function EditForm({ p, done }) {
  const [f, setF] = useState({ name: p.name, phone: `+${p.phone}`, country: p.country || '', city: p.city || '', previous: p.previous_participations ?? '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await rpc('admin_update_participant', { p_participant: p.id, p: { ...f, previous: f.previous === '' ? '' : String(f.previous) } });
      if (r.error) setErr(r.error); else await done();
    } catch { setErr('Connexion difficile. Réessayez.'); }
    setBusy(false);
  };
  return (
    <form className="subform" onSubmit={save}>
      <div className="grid2">
        <Field label="Nom et prénom"><input value={f.name} onChange={set('name')} /></Field>
        <Field label="Numéro WhatsApp"><input type="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Pays (facultatif)"><input value={f.country} onChange={set('country')} /></Field>
        <Field label="Ville / localité (facultatif)"><input value={f.city} onChange={set('city')} /></Field>
        <Field label="Participations précédentes (facultatif)"><input type="number" min="0" max="100" value={f.previous} onChange={set('previous')} /></Field>
      </div>
      {err ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{err}</p></div> : null}
      <button className="btn primary fit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
    </form>
  );
}

function AdminReportForm({ p, s, done }) {
  const portions = s.portions || [];
  const byN = Object.fromEntries(portions.map((x) => [x.n, x]));
  const today = dayKey(new Date(), s.challenge.timezone);
  const first = p.next ? p.next.n : (p.ordre || [1])[0];
  const remaining = (n) => { const c = byN[n]?.chapters || 1, d = (p.lect || {})[n] || 0; return d >= c ? c : c - d; };
  const [f, setF] = useState({ portion: first, chap: remaining(first), date: today, verse: '', learned: '', application: '', question: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const max = byN[f.portion]?.chapters || 1;

  const save = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await rpc('admin_add_report', {
        p_participant: p.id, p_portion: Number(f.portion), p_chapters: Number(f.chap),
        p_verse: f.verse, p_learned: f.learned, p_application: f.application, p_question: f.question,
        p_date: f.date || null,
      });
      if (r.error) setErr(r.error); else await done();
    } catch { setErr('Connexion difficile. Réessayez : le texte est conservé.'); }
    setBusy(false);
  };
  const order = p.ordre && p.ordre.length ? p.ordre : portions.map((x) => x.n);
  return (
    <form className="subform" onSubmit={save}>
      <p className="small muted">Pour une personne qui ne peut pas envoyer son rapport elle-même. Seuls la portion, les chapitres et la date sont obligatoires.</p>
      <div className="grid3">
        <Field label="Portion lue">
          <select value={f.portion} onChange={(e) => { const n = Number(e.target.value); setF({ ...f, portion: n, chap: remaining(n) }); }}>
            {order.map((n) => {
              const d = (p.lect || {})[n] || 0, c = byN[n]?.chapters || 0;
              return <option key={n} value={n}>{d >= c ? '✓ ' : d ? `${d}/${c} · ` : ''}P{n} — {byN[n]?.label}</option>;
            })}
          </select>
        </Field>
        <Field label="Chapitres lus">
          <select value={f.chap} onChange={set('chap')}>
            {Array.from({ length: max }, (_, i) => max - i).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Date de lecture"><input type="date" max={today} value={f.date} onChange={set('date')} /></Field>
      </div>
      <Field label="Verset marquant (facultatif)"><textarea className="short" value={f.verse} onChange={set('verse')} /></Field>
      <div className="grid2">
        <Field label="Ce qu'il/elle a appris (facultatif)"><textarea className="short" value={f.learned} onChange={set('learned')} /></Field>
        <Field label="Application (facultatif)"><textarea className="short" value={f.application} onChange={set('application')} /></Field>
      </div>
      {err ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{err}</p></div> : null}
      <button className="btn primary fit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le rapport'}</button>
    </form>
  );
}

/* ------------------------------------------------------------------ ajout d'un participant */
function AddParticipant({ open, s, close, reload, toast, done }) {
  const empty = { name: '', phone: '', country: '', city: '', previous: '', start: 'at', book: '', chap: 1 };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setErr('');
    if (f.name.trim().length < 3) return setErr('Indiquez le nom et le prénom.');
    if (f.phone.replace(/\D/g, '').length < 8) return setErr('Le numéro WhatsApp est obligatoire (8 chiffres au moins).');
    setBusy(true);
    try {
      const r = await rpc('admin_add_participant', { p_cid: s.challenge.id, p: { ...f, previous: String(f.previous), chap: String(f.chap) } });
      if (r.error) setErr(r.error);
      else { toast(`${r.profile.name} ajouté (${r.profile.code}).`); setF(empty); await reload(); done(r.profile.id); }
    } catch { setErr('Connexion difficile. Réessayez.'); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={close} title="Ajouter un participant" wide>
      <form onSubmit={save} noValidate>
        <p className="small muted">Pour une personne qui ne peut pas créer son compte. Elle pourra plus tard se connecter elle-même avec ce numéro.</p>
        <div className="grid2">
          <Field label="Nom et prénom"><input value={f.name} onChange={set('name')} /></Field>
          <Field label="Numéro WhatsApp (obligatoire)" hint="Avec l'indicatif du pays de préférence."><input type="tel" value={f.phone} onChange={set('phone')} placeholder="+237 6 99 12 34 56" /></Field>
          <Field label="Pays (facultatif)"><input value={f.country} onChange={set('country')} placeholder="Cameroun" /></Field>
          <Field label="Ville / localité (facultatif)"><input value={f.city} onChange={set('city')} placeholder="Douala" /></Field>
          <Field label="Participations précédentes (facultatif)" hint="Nombre de fois où la personne a déjà fait le challenge."><input type="number" min="0" max="100" value={f.previous} onChange={set('previous')} /></Field>
          <Field label="Commence">
            <select value={f.start} onChange={set('start')}>
              <option value="at">Au début de l'Ancien Testament</option>
              <option value="nt">Au début du Nouveau Testament</option>
              <option value="ici">À un livre précis</option>
            </select>
          </Field>
        </div>
        {f.start === 'ici' ? (
          <div className="grid2">
            <Field label="Livre"><input value={f.book} onChange={set('book')} placeholder="Ex. Psaumes" /></Field>
            <Field label="Chapitre"><input type="number" min="1" value={f.chap} onChange={set('chap')} /></Field>
          </div>
        ) : null}
        {err ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{err}</p></div> : null}
        <button className="btn primary" disabled={busy}>{busy ? 'Ajout en cours…' : 'Ajouter le participant'}</button>
      </form>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ podium */
function Podium({ open, close, list, sort, s, filterText }) {
  const crit = SORTS[sort]?.rank ? sort : 'avance';
  const [k, setK] = useState(crit);
  const [n, setN] = useState(3);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open) { setK(crit); setCopied(false); } }, [open, crit]);
  if (!open) return null;
  const total = s.total_chapters || 1;
  const top = [...list].sort(SORTS[k].cmp).slice(0, n).filter((p) => (k === 'avance' ? p.chap_lus > 0 : k === 'regulier' ? p.jours_actifs > 0 : p.nb_rapports > 0));
  const intro = { avance: 'les plus avancés dans la lecture', regulier: 'les plus réguliers', rapports: 'ceux qui ont envoyé le plus de rapports' }[k];
  const text = `🏆 *${s.challenge.name} — Podium du jour ${Math.max(s.jour, 0)}*\n` +
    `Voici ${intro}${filterText ? ` (${filterText})` : ''} :\n\n` +
    top.map((p, i) => `${MEDALS[i] || `${i + 1}.`} *${ordinal(i)}* : ${p.name}${place(p) ? ` (${place(p)})` : ''} — ${SORTS[k].value(p, total)}`).join('\n') +
    `\n\nBravo à eux ! 👏 Que leur fidélité encourage chacun de nous. Continuons à nous plonger dans la Parole. 📖🙏` +
    (s.challenge.platform_url ? `\n👉 ${s.challenge.platform_url}` : '') +
    (String(s.challenge.signature || '').trim() ? `\n\n— _${String(s.challenge.signature).trim()}_` : '');
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } };
  return (
    <Sheet open onClose={close} title="Podium" wide>
      <div className="grid2">
        <Field label="Critère">
          <select value={k} onChange={(e) => setK(e.target.value)}>
            {Object.entries(SORTS).filter(([, v]) => v.rank).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Nombre de places">
          <select value={n} onChange={(e) => setN(Number(e.target.value))}>{[3, 5, 10].map((x) => <option key={x} value={x}>Top {x}</option>)}</select>
        </Field>
      </div>
      {filterText ? <p className="small muted">Calculé sur les participants filtrés : {filterText}.</p> : <p className="small muted">Calculé sur tous les participants. Utilisez les filtres (pays, ville…) pour un podium local.</p>}
      {top.length === 0 ? <p className="muted">Pas encore assez de rapports pour un podium.</p> : (
        <ol className="podium">
          {top.map((p, i) => (
            <li key={p.id} className={`pod-${i + 1}`}>
              <span className="pod-medal" aria-hidden="true">{MEDALS[i] || i + 1}</span>
              <span className="pod-name"><b>{p.name}</b><small>{place(p) || p.code}</small></span>
              <span className="pod-value">{SORTS[k].value(p, total)}</span>
            </li>
          ))}
        </ol>
      )}
      <details className="msg" open>
        <summary><span>Message à partager</span></summary>
        <pre>{text}</pre>
      </details>
      <div className="fiche-actions">
        <button className="mini" onClick={copy} disabled={!top.length}><Icon name="copy" size={15} /> {copied ? 'Copié !' : 'Copier'}</button>
        <a className={`mini wa ${top.length ? '' : 'off'}`} href={waShare(text)} target="_blank" rel="noreferrer"><Icon name="send" size={15} /> WhatsApp</a>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ export des rapports */
function ReportsExport({ open, close, s }) {
  const today = dayKey(new Date(), s?.challenge?.timezone || 'Africa/Douala');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState('');
  if (!open) return null;
  const run = async (format) => {
    setErr('');
    const r = await rpc('admin_reports', { p_cid: s.challenge.id, p_from: from || null, p_to: to || null });
    if (r.error) { setErr(r.error); return; }
    if (!r.list.length) { setErr('Aucun rapport sur cette période.'); return; }
    const period = from || to ? `du ${from ? new Date(`${from}T12:00`).toLocaleDateString('fr-FR') : 'début'} au ${to ? new Date(`${to}T12:00`).toLocaleDateString('fr-FR') : 'aujourd\'hui'}` : 'toute la session';
    await exportTable({
      format, title: `Rapports — ${s.challenge.name}`, subtitle: `${r.list.length} rapport(s), ${period}`,
      columns: [
        { header: 'Date', get: (x) => new Date(x.created_at).toLocaleDateString('fr-FR'), width: 11, pdfWidth: 52 },
        { header: 'Code', get: (x) => x.code, width: 9, pdfWidth: 42 },
        { header: 'Nom', get: (x) => x.name, width: 22, pdfWidth: 80 },
        { header: 'Lieu', get: (x) => place(x), width: 18, pdfWidth: 60 },
        { header: 'Portion', get: (x) => (x.label ? `P${x.portion_n} — ${x.label}` : `P${x.portion_n}`), width: 26, pdfWidth: 80 },
        { header: 'Ch.', get: (x) => x.chapters, width: 5, pdfWidth: 26 },
        { header: 'Verset', get: (x) => x.verse, width: 36 },
        { header: 'Appris', get: (x) => x.learned, width: 40 },
        { header: 'Application', get: (x) => x.application, width: 40 },
        { header: 'Question', get: (x) => x.question, width: 30 },
        { header: 'Saisi par', get: (x) => x.entered_by || 'Le participant', width: 22, pdfWidth: 60 },
      ],
      rows: r.list, filename: `rapports-${s.challenge.slug}`,
    });
  };
  return (
    <Sheet open onClose={close} title="Exporter les rapports" wide>
      <p className="small muted">Tous les rapports envoyés (verset, enseignement, application, question). Laissez les dates vides pour toute la session.</p>
      <div className="grid2">
        <Field label="Du"><input type="date" max={today} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Au"><input type="date" max={today} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {err ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{err}</p></div> : null}
      <ExportButtons onExport={run} label="Télécharger" />
    </Sheet>
  );
}
