import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, rpc, formatDate, isMissingFn } from '../supabase.js';
import { waLink, morningText, eveningText, waShare, needsReminder } from '../../shared/messages.js';
import { Icon, Brand } from '../ui/icons.jsx';
import { STATUS, Toast, Field, Loading } from '../ui/kit.jsx';
import { Credit } from '../ui/credit.jsx';
import { Columns, Bars } from './charts.jsx';
import { Participants, ExportButtons, V2Notice } from './participants.jsx';
import { exportTable } from './exports.js';
import { dayKey, groupCount, pct, SORTS, place, ACTIONS, detailText, resizeImage } from './util.js';

const NAV = [
  { id: 'dash', label: 'Tableau de bord', icon: 'dashboard' },
  { id: 'part', label: 'Participants', icon: 'users' },
  { id: 'quest', label: 'Questions', icon: 'chat' },
  { id: 'public', label: 'Page publique', icon: 'globe' },
  { id: 'hist', label: 'Historique', icon: 'history' },
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
          <Credit />
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
    if (error) {
      setErr(/fetch|network/i.test(error.message || '')
        ? 'Pas de connexion Internet. Vérifiez votre réseau puis réessayez.'
        : 'E-mail ou mot de passe incorrect.');
    }
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
        <Credit />
      </form>
    </div>
  );
}

function Panel({ email, logout }) {
  const [challenges, setChallenges] = useState([]);
  const [cid, setCid] = useState('');
  const [tab, setTab] = useState('dash');
  const [filter, setFilter] = useState('');
  const [preset, setPreset] = useState(null);
  const [summary, setSummary] = useState(null);
  const [stats, setStats] = useState(null);
  const [v2, setV2] = useState(true);
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
    try { const i = await rpc('api_info', { p_slug: sm.challenge.slug }); sm.portions = i.portions || []; } catch { sm.portions = []; }
    setSummary(sm);
    try {
      const st = await rpc('admin_stats', { p_cid: cid });
      setStats(st.ok ? st : null); setV2(true);
    } catch (e) { setStats(null); if (isMissingFn(e)) setV2(false); }
  }, [cid]);

  useEffect(() => { loadChallenges().catch(() => setError('Connexion difficile.')); }, [loadChallenges]);
  useEffect(() => { setSummary(null); setStats(null); loadSummary().catch(() => setError('Connexion difficile. Vérifiez votre réseau puis rechargez la page.')); }, [loadSummary]);

  const current = challenges.find((c) => c.id === cid);
  const goParticipants = (status, extra = null) => { setFilter(status || ''); setPreset(extra ? { ...extra, t: Date.now() } : null); setTab('part'); };

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
          <Credit dark />
        </div>
      </aside>

      <main className="admin-main">
        {error ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{error}</p></div> : null}
        {tab === 'dash' ? <Dash s={summary} stats={stats} v2={v2} toast={setToast} goParticipants={goParticipants} /> : null}
        {tab === 'part' ? <Participants s={summary} v2={v2} reload={loadSummary} filter={filter} setFilter={setFilter} preset={preset} toast={setToast} /> : null}
        {tab === 'quest' ? <Questions cid={cid} reload={loadSummary} /> : null}
        {tab === 'public' ? <PublicPage s={summary} v2={v2} reload={loadSummary} toast={setToast} /> : null}
        {tab === 'hist' ? <History cid={cid} v2={v2} s={summary} /> : null}
        {tab === 'sess' ? <Sessions challenges={challenges} current={current} reload={loadChallenges} setCid={setCid} toast={setToast} /> : null}
        <Credit />
      </main>
      <Toast message={toast} onClose={closeToast} />
    </div>
  );
}

const SEGMENTS = [
  ['a_jour', 'var(--sauge)'], ['termine', '#1c6b50'], ['leger', 'var(--lampe)'],
  ['retard', 'var(--brique)'], ['aucun', '#aab2cc'], ['pas_commence', '#d5daea'],
];

const BUCKETS = [[0, 0, '0 %'], [1, 24, '1 – 24 %'], [25, 49, '25 – 49 %'], [50, 74, '50 – 74 %'], [75, 99, '75 – 99 %'], [100, 100, '100 % (Bible lue)']];

function Dash({ s, stats, v2, toast, goParticipants }) {
  const [metric, setMetric] = useState('reports');
  const days = useMemo(() => {
    if (!s || !stats) return [];
    const c = s.challenge;
    const by = Object.fromEntries((stats.reports_by_day || []).map((d) => [d.day, d]));
    const sig = Object.fromEntries((stats.signups_by_day || []).map((d) => [d.day, d.n]));
    const start = new Date(`${c.start_date}T12:00:00`);
    const firstData = [...Object.keys(by), ...Object.keys(sig)].sort()[0];
    const from = firstData && new Date(`${firstData}T12:00:00`) < start ? new Date(`${firstData}T12:00:00`) : start;
    const today = new Date(`${dayKey(new Date(), c.timezone)}T12:00:00`);
    const end = new Date(Math.min(today, new Date(start.getTime() + (c.total_days + 3) * 864e5)));
    const out = [];
    for (let d = new Date(from); d <= end && out.length < 120; d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      const x = by[k] || {};
      const label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      const v = metric === 'reports' ? x.reports || 0 : metric === 'people' ? x.people || 0 : metric === 'chapters' ? x.chapters || 0 : sig[k] || 0;
      const unitTxt = { reports: 'rapport(s)', people: 'personne(s) active(s)', chapters: 'chapitre(s) lus', signups: 'inscription(s)' }[metric];
      out.push({ key: k, label, value: v, title: `${label} : ${v} ${unitTxt}` });
    }
    return out;
  }, [s, stats, metric]);

  if (!s) return <Loading />;
  const ps = s.participants;
  const c = s.challenge;
  const total = s.total_chapters || 1;
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
  const buckets = BUCKETS.map(([a, b, label]) => ({ label, value: ps.filter((p) => { const x = pct(p, total); return x >= a && x <= b; }).length }));
  const countries = groupCount(ps, (p) => p.country);
  const cities = groupCount(ps, (p) => p.city).slice(0, 8);
  const noPlace = ps.filter((p) => !String(p.country || '').trim()).length;
  const top3 = [...ps].sort(SORTS.avance.cmp).filter((p) => p.chap_lus > 0).slice(0, 3);

  const exportStats = (format) => exportTable({
    format, title: `Statistiques — ${c.name}`, subtitle: jourTxt,
    columns: [{ header: 'Indicateur', get: (r) => r[0], width: 36 }, { header: 'Valeur', get: (r) => r[1], width: 16 }],
    rows: [
      ['Participants inscrits', ps.length], ...figures,
      ...SEGMENTS.map(([k]) => [`Statut : ${STATUS[k].label}`, count(k)]),
      ...buckets.map((b) => [`Avancement ${b.label}`, b.value]),
      ...countries.map((x) => [`Pays : ${x.label}`, x.value]),
      ...groupCount(ps, (p) => p.city).map((x) => [`Ville : ${x.label}`, x.value]),
      ...(stats?.reports_by_day || []).map((d) => [`Rapports du ${new Date(`${d.day}T12:00`).toLocaleDateString('fr-FR')}`, d.reports]),
    ],
    filename: `statistiques-${c.slug}`,
  });

  return (
    <>
      <header className="head head-row">
        <div><h1>{c.name}</h1><p className="muted">{jourTxt}</p></div>
        <ExportButtons onExport={exportStats} label="Statistiques" />
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

      {top3.length ? (
        <section className="panel">
          <div className="panel-head"><h2>Les plus avancés</h2>
            <button className="mini gold" onClick={() => goParticipants('', { sort: 'avance', podium: true })}><Icon name="trophy" size={15} /> Podium et message</button>
          </div>
          <ol className="podium compact">
            {top3.map((p, i) => (
              <li key={p.id} className={`pod-${i + 1}`}>
                <span className="pod-medal" aria-hidden="true">{['🥇', '🥈', '🥉'][i]}</span>
                <span className="pod-name"><b>{p.name}</b><small>{place(p) || p.code}</small></span>
                <span className="pod-value">{SORTS.avance.value(p, total)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <h2>Activité par jour</h2>
          <select className="compact-select" value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Indicateur">
            <option value="reports">Rapports envoyés</option>
            <option value="people">Personnes actives</option>
            <option value="chapters">Chapitres lus</option>
            <option value="signups">Inscriptions</option>
          </select>
        </div>
        {!v2 ? <V2Notice /> : <Columns data={days} empty="Aucune activité pour l'instant." />}
      </section>

      <div className="panels2">
        <section className="panel">
          <div className="panel-head"><h2>Avancement dans la Bible</h2><span className="muted small">en % des chapitres</span></div>
          <Bars items={buckets} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Participants par pays</h2>{noPlace ? <span className="muted small">{noPlace} sans pays</span> : null}</div>
          <Bars items={countries} empty="Aucun pays renseigné pour l'instant." onPick={(d) => goParticipants('', { country: d.key })} />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Villes principales</h2></div>
          <Bars items={cities} empty="Aucune ville renseignée pour l'instant." />
        </section>
      </div>

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

/* ------------------------------------------------------------------ historique */
function History({ cid, v2, s }) {
  const [list, setList] = useState(null);
  const [who, setWho] = useState('');
  const [what, setWhat] = useState('');
  useEffect(() => {
    if (!cid || !v2) { setList([]); return; }
    setList(null);
    rpc('admin_logs', { p_cid: cid, p_limit: 1000 }).then((r) => setList(r.list || [])).catch(() => setList([]));
  }, [cid, v2]);
  const admins = useMemo(() => [...new Set((list || []).map((l) => l.admin_email).filter(Boolean))].sort(), [list]);
  const shown = (list || []).filter((l) => (!who || l.admin_email === who) && (!what || l.action === what));
  const doExport = (format) => exportTable({
    format, title: `Historique — ${s?.challenge?.name || ''}`, subtitle: `${shown.length} action(s)${who ? ` · ${who}` : ''}`,
    columns: [
      { header: 'Date', get: (l) => new Date(l.created_at).toLocaleString('fr-FR'), width: 18, pdfWidth: 100 },
      { header: 'Administrateur', get: (l) => l.admin_email, width: 30, pdfWidth: 150 },
      { header: 'Action', get: (l) => ACTIONS[l.action] || l.action, width: 32, pdfWidth: 140 },
      { header: 'Détails', get: (l) => detailText(l.details), width: 60 },
    ],
    rows: shown, filename: 'historique',
  });
  return (
    <>
      <header className="head head-row">
        <div><h1>Historique</h1><p className="muted">Qui a fait quoi, et quand, dans l'administration.</p></div>
        {v2 ? <ExportButtons onExport={doExport} /> : null}
      </header>
      {!v2 ? <V2Notice /> : null}
      {v2 ? (
        <div className="filters">
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Administrateur">
            <option value="">Tous les administrateurs</option>
            {admins.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={what} onChange={(e) => setWhat(e.target.value)} aria-label="Type d'action">
            <option value="">Toutes les actions</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      ) : null}
      {list === null ? <Loading /> : shown.length === 0 ? (v2 ? <p className="muted empty-line">Aucune action enregistrée pour l'instant. Les prochaines actions des administrateurs apparaîtront ici.</p> : null) : (
        <ol className="timeline">
          {shown.map((l) => (
            <li key={l.id}>
              <time dateTime={l.created_at}>{new Date(l.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
              <div>
                <p><b>{l.admin_email || 'Inconnu'}</b> · {ACTIONS[l.action] || l.action}</p>
                {detailText(l.details) ? <p className="small muted">{detailText(l.details)}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ page publique */
function PublicPage({ s, v2, reload, toast }) {
  const [story, setStory] = useState(null);
  const [ann, setAnn] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const cid = s?.challenge?.id;

  useEffect(() => {
    if (!cid || !v2) return;
    setStory(null);
    rpc('admin_story', { p_cid: cid }).then((r) => setStory(r.ok ? r : { title: '', body: '', photo: '' })).catch(() => setStory({ title: '', body: '', photo: '' }));
    setAnn(s?.challenge?.announcement || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, v2]);

  if (!s) return <Loading />;
  if (!v2) return (<><header className="head"><h1>Page publique</h1></header><V2Notice /></>);
  if (!story) return <Loading />;

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr('Choisissez une image (photo JPEG ou PNG).'); return; }
    try { setErr(''); setStory({ ...story, photo: await resizeImage(file) }); } catch { setErr('Impossible de lire cette image.'); }
  };
  const saveStory = async (e) => {
    e.preventDefault(); setErr(''); setBusy('story');
    try {
      const r = await rpc('admin_save_story', { p_cid: cid, p: { title: story.title, body: story.body, photo: story.photo } });
      if (r.error) setErr(r.error); else toast('Page publique enregistrée.');
    } catch { setErr('Connexion difficile. Réessayez.'); }
    setBusy('');
  };
  const saveAnn = async (text) => {
    setErr(''); setBusy('ann');
    try {
      const r = await rpc('admin_save_announcement', { p_cid: cid, p_text: text });
      if (r.error) setErr(r.error); else { setAnn(text); toast(text ? 'Annonce publiée.' : 'Annonce retirée.'); await reload(); }
    } catch { setErr('Connexion difficile. Réessayez.'); }
    setBusy('');
  };
  const paragraphs = String(story.body || '').split(/\n\s*\n/).filter((x) => x.trim());

  return (
    <>
      <header className="head head-row">
        <div><h1>Page publique</h1><p className="muted">Ce que voient les visiteurs et les participants.</p></div>
        <a className="mini" href={`/${s.challenge.slug}`} target="_blank" rel="noreferrer"><Icon name="external" size={15} /> Voir la page</a>
      </header>
      {err ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{err}</p></div> : null}

      <section className="panel">
        <div className="panel-head"><h2>Annonce aux participants</h2>{s.challenge.announcement ? <span className="chip ok"><i />En ligne</span> : <span className="chip mute"><i />Aucune</span>}</div>
        <p className="muted small">S'affiche en haut de l'application de chaque participant (et sur la page d'accueil) jusqu'à ce que vous la retiriez. Idéal pour un rappel, un encouragement ou un changement de programme.</p>
        <Field label="Texte de l'annonce"><textarea className="short" value={ann} maxLength={1000} onChange={(e) => setAnn(e.target.value)} placeholder="Ex. : Demain est un jour de rattrapage. Courage à tous !" /></Field>
        <div className="fiche-actions">
          <button className="btn primary fit" disabled={busy === 'ann' || !ann.trim()} onClick={() => saveAnn(ann.trim())}><Icon name="bell" /> Publier l'annonce</button>
          {s.challenge.announcement ? <button className="btn quiet fit" disabled={busy === 'ann'} onClick={() => saveAnn('')}>Retirer l'annonce</button> : null}
        </div>
      </section>

      <form className="panel" onSubmit={saveStory}>
        <div className="panel-head"><h2>L'histoire du challenge</h2>{story.updated_by ? <span className="muted small">Modifié par {story.updated_by}</span> : null}</div>
        <Field label="Titre"><input value={story.title} maxLength={120} onChange={(e) => setStory({ ...story, title: e.target.value })} /></Field>
        <Field label="Texte" hint="Laissez une ligne vide entre deux paragraphes. Laissez le texte vide pour masquer ce bloc.">
          <textarea className="tall" value={story.body} maxLength={8000} onChange={(e) => setStory({ ...story, body: e.target.value })} />
        </Field>
        <div className="photo-edit">
          {story.photo ? <img src={story.photo} alt="Aperçu de la photo" /> : <span className="photo-empty"><Icon name="image" size={28} /></span>}
          <div className="stack-tight">
            <span className="field-label">Photo (facultatif)</span>
            <span className="field-hint">Par exemple une photo de sœur Mary. Elle est réduite automatiquement pour rester légère.</span>
            <label className="mini file-pick"><Icon name="image" size={15} /> {story.photo ? 'Changer la photo' : 'Choisir une photo'}<input type="file" accept="image/*" onChange={pick} /></label>
            {story.photo ? <button type="button" className="mini" onClick={() => setStory({ ...story, photo: '' })}><Icon name="trash" size={15} /> Retirer la photo</button> : null}
          </div>
        </div>
        <button className="btn primary fit" disabled={busy === 'story'}>{busy === 'story' ? 'Enregistrement…' : 'Enregistrer la page'}</button>

        <h3 className="fiche-h">Aperçu</h3>
        <div className="story preview">
          {story.photo ? <img className="story-photo" src={story.photo} alt="" /> : null}
          {story.title ? <h2>{story.title}</h2> : null}
          {paragraphs.map((x, i) => <p key={i}>{x}</p>)}
        </div>
      </form>
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
