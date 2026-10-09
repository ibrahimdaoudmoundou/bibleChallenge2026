import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, rpc, formatDate } from '../supabase.js';
import { reminderText, waLink, morningText, eveningText, waShare, needsReminder } from '../../shared/messages.js';
import { Icon, Brand } from '../ui/icons.jsx';
import { Chip, STATUS, Toast, Field, Loading } from '../ui/kit.jsx';

const NAV = [
  { id: 'dash', label: 'Tableau de bord', icon: 'dashboard' },
  { id: 'part', label: 'Participants', icon: 'users' },
  { id: 'quest', label: 'Questions', icon: 'chat' },
  { id: 'sess', label: 'Sessions', icon: 'sliders' },
];

export default function Admin() {
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    document.title = 'Administration';
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setIsAdmin(null); return; }
    rpc('admin_me').then((r) => setIsAdmin(Boolean(r?.is_admin))).catch(() => setIsAdmin(false));
  }, [session]);

  const logout = () => supabase.auth.signOut();

  if (session === undefined || (session && isAdmin === null)) return <div className="solo"><Loading /></div>;
  if (!session) return <Login />;
  if (!isAdmin) {
    return (
      <div className="solo">
        <div className="gate">
          <Brand name="Administration" />
          <h1>Accès réservé</h1>
          <p className="muted">Le compte <b>{session.user.email}</b> n'est pas administrateur de ce challenge. Demandez à la personne qui gère le site de l'ajouter.</p>
          <button className="btn quiet" onClick={logout}><Icon name="logout" /> Changer de compte</button>
        </div>
      </div>
    );
  }
  return <Panel email={session.user.email} logout={logout} />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) setErr('E-mail ou mot de passe incorrect.');
    setBusy(false);
  };
  return (
    <div className="solo">
      <form className="gate" onSubmit={submit}>
        <Brand name="Administration" />
        <h1>Connexion</h1>
        <Field label="E-mail"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
        <Field label="Mot de passe"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
        {err ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{err}</p></div> : null}
        <button className="btn primary" disabled={busy}>{busy ? 'Connexion…' : 'Me connecter'}</button>
      </form>
    </div>
  );
}

function Panel({ email, logout }) {
  const [challenges, setChallenges] = useState([]);
  const [cid, setCid] = useState('');
  const [tab, setTab] = useState('dash');
  const [filter, setFilter] = useState('');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const closeToast = useCallback(() => setToast(''), []);

  const loadChallenges = useCallback(async (select) => {
    const r = await rpc('admin_challenges');
    if (r.error) { setError(r.error); return; }
    setChallenges(r.list);
    setCid((cur) => select || cur || r.list.find((c) => c.is_active)?.id || r.list[0]?.id || '');
  }, []);

  const loadSummary = useCallback(async () => {
    if (!cid) { setSummary(null); return; }
    const r = await rpc('admin_summary', { p_cid: cid });
    if (r.error) { setError(r.error); return; }
    const sm = r.summary;
    if (!sm.challenge.platform_url) sm.challenge.platform_url = `${window.location.origin}/${sm.challenge.slug}`;
    if (sm.challenge.plan_url && sm.challenge.plan_url.startsWith('/')) sm.challenge.plan_url = window.location.origin + sm.challenge.plan_url;
    setSummary(sm);
  }, [cid]);

  useEffect(() => { loadChallenges().catch(() => setError('Connexion difficile.')); }, [loadChallenges]);
  useEffect(() => { setSummary(null); loadSummary().catch(() => setError('Connexion difficile.')); }, [loadSummary]);

  const current = challenges.find((c) => c.id === cid);
  const goParticipants = (status) => { setFilter(status || ''); setTab('part'); };

  return (
    <div className="admin">
      <aside className="side">
        <Brand name="Administration" />
        <div className="side-session">
          <label htmlFor="sess">Session</label>
          <select id="sess" value={cid} onChange={(e) => setCid(e.target.value)}>
            {challenges.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? '' : ' (inactive)'}</option>)}
          </select>
          {current ? <a className="textlink" href={`/${current.slug}`} target="_blank" rel="noreferrer">Voir la page publique <Icon name="external" size={14} /></a> : null}
        </div>
        <nav className="side-nav" aria-label="Administration">
          {NAV.map((n) => (
            <button key={n.id} className={tab === n.id ? 'on' : ''} aria-current={tab === n.id ? 'page' : undefined} onClick={() => setTab(n.id)}>
              <Icon name={n.icon} size={19} /><span>{n.label}</span>
              {n.id === 'quest' && summary?.questions_pending > 0 ? <em className="badge">{summary.questions_pending}</em> : null}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <span title={email}>{email}</span>
          <button className="textlink" onClick={logout}><Icon name="logout" size={15} /> Déconnexion</button>
        </div>
      </aside>

      <main className="admin-main">
        {error ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{error}</p></div> : null}
        {tab === 'dash' ? <Dash s={summary} toast={setToast} goParticipants={goParticipants} /> : null}
        {tab === 'part' ? <Participants s={summary} reload={loadSummary} filter={filter} setFilter={setFilter} /> : null}
        {tab === 'quest' ? <Questions cid={cid} reload={loadSummary} /> : null}
        {tab === 'sess' ? <Sessions challenges={challenges} current={current} reload={loadChallenges} setCid={setCid} toast={setToast} /> : null}
      </main>
      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}

const SEGMENTS = [
  ['a_jour', 'var(--sauge)'], ['termine', '#1c6b50'], ['leger', 'var(--lampe)'],
  ['retard', 'var(--brique)'], ['aucun', '#aab2cc'], ['pas_commence', '#d5daea'],
];

const dayKey = (date, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

function Dash({ s, toast, goParticipants }) {
  if (!s) return <Loading />;
  const ps = s.participants;
  const c = s.challenge;
  const count = (k) => ps.filter((p) => p.statut === k).length;
  const lus = ps.reduce((a, p) => a + p.chap_lus, 0);
  const prog = ps.length && s.total_chapters ? (100 * lus) / (ps.length * s.total_chapters) : 0;
  const today = dayKey(new Date(), c.timezone);
  const signupsToday = ps.filter((p) => dayKey(new Date(p.created_at), c.timezone) === today).length;
  const toRemind = ps.filter(needsReminder).length;
  const jourTxt = s.jour < 1 ? `Commence dans ${1 - s.jour} jour${1 - s.jour > 1 ? 's' : ''}`
    : s.jour > c.total_days ? 'Terminé' : `Jour ${s.jour} sur ${c.total_days}${(c.catchup_days || []).includes(s.jour) ? ', jour de rattrapage' : ''}`;

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('Message copié.'); } catch { toast('Copie impossible : sélectionnez le texte à la main.'); }
  };
  const figures = [
    ['Inscrits aujourd\'hui', signupsToday], ['Rapports aujourd\'hui', s.reports_today], ['Rapports au total', s.reports_total],
    ['Progression globale', `${prog.toFixed(1)} %`], ['À relancer', toRemind], ['Questions en attente', s.questions_pending],
  ];
  const messages = [['Annonce du matin', morningText(s)], ['Bilan du soir', eveningText(s)]];

  return (
    <>
      <header className="head">
        <h1>{c.name}</h1>
        <p className="muted">{jourTxt}</p>
      </header>

      <section className="panel">
        <div className="panel-head"><h2>Où en sont les participants</h2><span className="muted">{ps.length} inscrit{ps.length > 1 ? 's' : ''}</span></div>
        {ps.length === 0 ? <p className="muted">Personne n'est encore inscrit. Les comptes apparaîtront ici dès la première inscription.</p> : (
          <>
            <div className="statbar" role="img" aria-label="Répartition des participants par statut">
              {SEGMENTS.map(([k, col]) => (count(k) ? <span key={k} style={{ flex: count(k), background: col }} title={`${STATUS[k].label} : ${count(k)}`} /> : null))}
            </div>
            <ul className="statlegend">
              {SEGMENTS.map(([k, col]) => (
                <li key={k}>
                  <button onClick={() => goParticipants(k)}><i style={{ background: col }} />{STATUS[k].label}<b>{count(k)}</b></button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <dl className="figures">
        {figures.map(([l, v]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}
      </dl>

      <section className="panel">
        <div className="panel-head"><h2>Messages WhatsApp du jour</h2></div>
        <p className="muted small">Les mêmes textes arrivent par e-mail aux administrateurs. Lisez-les ici, puis copiez-les ou ouvrez-les dans WhatsApp.</p>
        {messages.map(([l, t]) => (
          <details key={l} className="msg">
            <summary>
              <span>{l}</span>
              <span className="msg-actions" onClick={(e) => e.stopPropagation()}>
                <button className="mini" onClick={() => copy(t)}><Icon name="copy" size={15} /> Copier</button>
                <a className="mini wa" href={waShare(t)} target="_blank" rel="noreferrer"><Icon name="send" size={15} /> WhatsApp</a>
              </span>
            </summary>
            <pre>{t}</pre>
          </details>
        ))}
      </section>
    </>
  );
}

function Participants({ s, reload, filter, setFilter }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const list = useMemo(() => {
    if (!s) return [];
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return s.participants.filter((p) =>
      (!filter || p.statut === filter) &&
      (!needle || p.name.toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle) || (digits && p.phone.includes(digits))));
  }, [s, q, filter]);
  if (!s) return <Loading />;
  const total = s.total_chapters || 1;

  const resetPin = async (p) => {
    if (!window.confirm(`Effacer le code secret de ${p.name} ?`)) return;
    setBusy(p.id); await rpc('admin_reset_pin', { p_participant: p.id }); await reload(); setBusy('');
  };
  const remove = async (p) => {
    if (!window.confirm(`Supprimer ${p.name} et tous ses rapports ? Cette action est définitive.`)) return;
    setBusy(p.id); await rpc('admin_delete_participant', { p_participant: p.id }); await reload(); setBusy('');
  };
  const exportCsv = () => {
    const head = ['Code', 'Nom', 'Téléphone', 'Statut', 'Chapitres lus', 'Retard (chapitres)', 'Dernier rapport'];
    const rows = s.participants.map((p) => [p.code, p.name, p.phone, STATUS[p.statut].label, p.chap_lus, p.retard, p.dernier_rapport || '']);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `participants-${s.challenge.slug}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <>
      <header className="head"><h1>Participants</h1><p className="muted">{list.length} affiché{list.length > 1 ? 's' : ''} sur {s.participants.length}</p></header>
      <div className="toolbar">
        <label className="search"><Icon name="search" size={18} /><input placeholder="Nom, numéro ou code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" /></label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrer par statut">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="mini" onClick={exportCsv}><Icon name="download" size={15} /> Exporter</button>
      </div>
      {list.length === 0 ? <p className="muted empty-line">Aucun participant ne correspond à cette recherche.</p> : (
        <div className="tablewrap">
          <table className="table">
            <thead><tr><th>Participant</th><th>Statut</th><th>Lecture</th><th>Prochaine portion</th><th><span className="sr">Actions</span></th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b><small>{p.code} · +{p.phone}</small></td>
                  <td><Chip status={p.statut} /></td>
                  <td className="read">
                    <div className="mini-meter"><i style={{ width: `${Math.min(100, (100 * p.chap_lus) / total)}%` }} /></div>
                    <small>{p.chap_lus} ch.{p.retard > 0 ? `, retard ${p.retard}` : ''}</small>
                  </td>
                  <td className="next-cell">{p.next ? `P${p.next.n}, ${p.next.label}` : '—'}</td>
                  <td className="row-actions">
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
    </>
  );
}

function Questions({ cid, reload }) {
  const [list, setList] = useState(null);
  const load = useCallback(async () => {
    if (!cid) return;
    const r = await rpc('admin_questions', { p_cid: cid });
    setList(r.list || []);
  }, [cid]);
  useEffect(() => { setList(null); load().catch(() => setList([])); }, [load]);
  const mark = async (q) => { await rpc('admin_mark_question', { p_id: q.id, p_answered: !q.answered }); await load(); reload(); };
  if (list === null) return <Loading />;
  return (
    <>
      <header className="head"><h1>Questions</h1><p className="muted">Posées par les participants dans leur rapport.</p></header>
      {list.length === 0 ? <p className="muted empty-line">Aucune question pour l'instant.</p> : (
        <ul className="questions">
          {list.map((q) => (
            <li key={q.id} className={q.answered ? 'done' : ''}>
              <div className="q-meta"><b>{q.name}</b><span>{q.label ? `${q.label}, ` : ''}{new Date(q.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span></div>
              <p>{q.question}</p>
              <div className="q-actions">
                <a className="mini wa" href={waLink(q.phone, `Bonjour ${q.name.split(' ')[0]}, merci pour votre question : « ${q.question} »\n`)} target="_blank" rel="noreferrer"><Icon name="send" size={15} /> Répondre</a>
                <button className="mini" onClick={() => mark(q)}><Icon name="check" size={15} /> {q.answered ? 'Rouvrir' : 'Marquer comme traitée'}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Sessions({ challenges, current, reload, setCid, toast }) {
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [clone, setClone] = useState({ slug: '', name: '', start: '' });

  useEffect(() => {
    if (!current) { setForm(null); return; }
    setForm({ ...current, catchup: (current.catchup_days || []).join(', ') });
    setMsg('');
  }, [current]);

  if (!form) return <Loading />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    const catchup = form.catchup.split(/[,\s;]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const r = await rpc('admin_save_challenge', { p: {
      id: form.id, slug: form.slug, name: form.name, slogan: form.slogan, signature: form.signature,
      start_date: form.start_date, total_days: Number(form.total_days), catchup_days: catchup,
      country_code: form.country_code, timezone: form.timezone, platform_url: form.platform_url,
      plan_url: form.plan_url, admin_emails: form.admin_emails, is_active: form.is_active,
    } });
    if (r.error) setMsg(r.error); else { toast('Réglages enregistrés.'); reload(r.id); }
  };

  const doClone = async (e) => {
    e.preventDefault();
    setMsg('');
    if (!clone.slug || !clone.start) return setMsg('Indiquez une adresse courte et une date de début.');
    const r = await rpc('admin_clone_challenge', { p_from: current.id, p_slug: clone.slug, p_name: clone.name, p_start: clone.start });
    if (r.error) setMsg(r.error); else { toast('Nouvelle session créée.'); setClone({ slug: '', name: '', start: '' }); await reload(r.id); setCid(r.id); }
  };

  return (
    <>
      <header className="head"><h1>Sessions</h1><p className="muted">Adresse publique : {window.location.origin}/{form.slug} · {formatDate(form.start_date)}</p></header>
      <form className="panel" onSubmit={save}>
        <fieldset className="group">
          <legend>Identité</legend>
          <div className="grid2">
            <Field label="Nom"><input value={form.name} onChange={set('name')} /></Field>
            <Field label="Adresse courte" hint="Lettres minuscules, chiffres et tirets."><input value={form.slug} onChange={set('slug')} /></Field>
            <Field label="Slogan"><input value={form.slogan} onChange={set('slogan')} /></Field>
            <Field label="Signature des messages"><input value={form.signature} onChange={set('signature')} /></Field>
          </div>
        </fieldset>
        <fieldset className="group">
          <legend>Calendrier</legend>
          <div className="grid2">
            <Field label="Date de début (jour 1)"><input type="date" value={form.start_date} onChange={set('start_date')} /></Field>
            <Field label="Nombre de jours"><input type="number" value={form.total_days} onChange={set('total_days')} /></Field>
            <Field label="Jours de rattrapage" hint="Numéros de jours, séparés par des virgules."><input value={form.catchup} onChange={set('catchup')} /></Field>
            <Field label="Fuseau horaire"><input value={form.timezone} onChange={set('timezone')} /></Field>
            <Field label="Indicatif pays"><input value={form.country_code} onChange={set('country_code')} /></Field>
          </div>
        </fieldset>
        <fieldset className="group">
          <legend>Liens et e-mails</legend>
          <div className="grid2">
            <Field label="Lien de la plateforme" hint="Utilisé dans les messages WhatsApp."><input value={form.platform_url} onChange={set('platform_url')} placeholder={`${window.location.origin}/${form.slug}`} /></Field>
            <Field label="Lien du plan de lecture (facultatif)"><input value={form.plan_url} onChange={set('plan_url')} /></Field>
          </div>
          <Field label="E-mails des administrateurs" hint="Ils reçoivent les annonces, bilans et relances. Séparez les adresses par des virgules.">
            <textarea className="short" value={form.admin_emails} onChange={set('admin_emails')} />
          </Field>
        </fieldset>
        <label className="switch"><input type="checkbox" checked={form.is_active} onChange={set('is_active')} /><span>Session active : e-mails automatiques et page d'accueil</span></label>
        {msg ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{msg}</p></div> : null}
        <button className="btn primary fit">Enregistrer</button>
      </form>

      <form className="panel" onSubmit={doClone}>
        <div className="panel-head"><h2>Nouvelle session à partir de celle-ci</h2></div>
        <p className="muted small">Copie les réglages et le plan de lecture. Les participants repartent de zéro. {challenges.length} session{challenges.length > 1 ? 's' : ''} au total.</p>
        <div className="grid3">
          <Field label="Adresse courte" hint="Par exemple bible-janvier."><input value={clone.slug} onChange={(e) => setClone({ ...clone, slug: e.target.value })} /></Field>
          <Field label="Nom"><input value={clone.name} onChange={(e) => setClone({ ...clone, name: e.target.value })} placeholder={current.name} /></Field>
          <Field label="Date de début"><input type="date" value={clone.start} onChange={(e) => setClone({ ...clone, start: e.target.value })} /></Field>
        </div>
        <button className="btn quiet fit"><Icon name="plus" /> Créer la session</button>
      </form>
    </>
  );
}
