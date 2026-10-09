import { useCallback, useEffect, useState } from 'react';
import { rpc, safeGet, safeSet } from '../supabase.js';
import { Icon, Brand, Lamp } from '../ui/icons.jsx';
import { Chip, Toast, Sheet, Field, Loading, addDays, longDate, initials } from '../ui/kit.jsx';
import { InstallCard, InstallButton } from '../ui/install.jsx';

const TABS = [
  { id: 'today', label: 'Aujourd\'hui', icon: 'sun' },
  { id: 'trail', label: 'Parcours', icon: 'route' },
  { id: 'reports', label: 'Mes rapports', icon: 'notes' },
];

// Jour du challenge où la k-ième portion (à partir de 0) est attendue
function dueDay(info, k) {
  const n = info.portions.length;
  for (let d = 1; d <= info.total_days; d++) {
    const att = Math.min(n, d - info.catchup_days.filter((x) => x <= d).length);
    if (att >= k + 1) return d;
  }
  return null;
}

export default function Participant({ slug }) {
  const [info, setInfo] = useState(null);
  const [fatal, setFatal] = useState('');
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState('loading');
  const [toast, setToast] = useState('');
  const [preset, setPreset] = useState(null);
  const [menu, setMenu] = useState(false);

  const tokenKey = info ? `cb_token_${info.slug}` : '';
  const token = () => (tokenKey ? safeGet(tokenKey) : null);
  const closeToast = useCallback(() => setToast(''), []);

  useEffect(() => {
    (async () => {
      try {
        const i = await rpc('api_info', { p_slug: slug });
        if (!i.ok) { setFatal(i.error || 'Challenge introuvable.'); return; }
        setInfo(i);
        document.title = i.name;
        const t = safeGet(`cb_token_${i.slug}`);
        if (t) {
          const r = await rpc('api_profile', { p_token: t });
          if (r.ok) { setProfile(r.profile); setScreen('today'); return; }
          safeSet(`cb_token_${i.slug}`, null);
        }
        setScreen('welcome');
      } catch {
        setFatal('La connexion est difficile. Vérifiez votre réseau, puis rechargez la page.');
      }
    })();
  }, [slug]);

  const enter = (tok, prof, message = '') => {
    safeSet(tokenKey, tok);
    setProfile(prof);
    if (message) setToast(message);
    setScreen('today');
  };
  const logout = () => { safeSet(tokenKey, null); setProfile(null); setMenu(false); setScreen('welcome'); };
  const lostSession = () => { safeSet(tokenKey, null); setProfile(null); setScreen('login'); };
  const openReport = (n) => { setPreset(n || null); setScreen('report'); };

  if (fatal) return <div className="solo"><div className="notice bad"><Icon name="help" /> <p>{fatal}</p></div></div>;
  if (screen === 'loading') return <div className="solo"><Loading /></div>;

  const inApp = profile && TABS.some((t) => t.id === screen);

  return (
    <div className={`shell ${inApp ? 'with-tabs' : ''}`}>
      {inApp ? (
        <header className="appbar">
          <Brand name={info.name} />
          <button className="avatar" onClick={() => setMenu(true)} aria-label="Mon compte">{initials(profile.name)}</button>
        </header>
      ) : null}

      <main className="content">
        {screen === 'welcome' ? <Welcome info={info} go={setScreen} /> : null}
        {screen === 'signup' ? <Signup info={info} go={setScreen} onDone={enter} /> : null}
        {screen === 'login' ? <Login info={info} go={setScreen} onDone={enter} /> : null}
        {screen === 'today' && profile ? <Today info={info} p={profile} openReport={openReport} /> : null}
        {screen === 'trail' && profile ? <Trail info={info} p={profile} openReport={openReport} /> : null}
        {screen === 'reports' && profile ? <Reports token={token()} openReport={openReport} lost={lostSession} /> : null}
        {screen === 'report' && profile ? (
          <ReportForm info={info} p={profile} token={token()} preset={preset} back={() => setScreen('today')} lost={lostSession}
            onDone={(p) => { setProfile(p); setToast('Rapport enregistré. Que Dieu bénisse votre lecture.'); setScreen('today'); }} />
        ) : null}
        {!inApp && screen !== 'report' && info.signature ? <footer className="signature">{info.signature}</footer> : null}
      </main>

      {inApp ? (
        <nav className="tabbar" aria-label="Navigation">
          {TABS.map((t) => (
            <button key={t.id} className={screen === t.id ? 'on' : ''} aria-current={screen === t.id ? 'page' : undefined} onClick={() => setScreen(t.id)}>
              <Icon name={t.icon} size={22} /><span>{t.label}</span>
            </button>
          ))}
        </nav>
      ) : null}

      <Toast message={toast} onClose={closeToast} />
      <Sheet open={menu} onClose={() => setMenu(false)} title="Mon compte">
        {profile ? (
          <>
            <div className="who">
              <span className="avatar big">{initials(profile.name)}</span>
              <div><b>{profile.name}</b><span>Identifiant {profile.code}</span><span>{profile.phone ? `+${profile.phone}` : ''}</span></div>
            </div>
            {info.plan_url ? <a className="btn quiet" href={info.plan_url} target="_blank" rel="noreferrer"><Icon name="file" /> Plan de lecture</a> : null}
            <a className="btn quiet" href="/Guide_participant_Challenge_Bible_40j.pdf" target="_blank" rel="noreferrer"><Icon name="file" /> Guide du participant</a>
            <InstallButton />
            <button className="btn quiet" onClick={logout}><Icon name="logout" /> Me déconnecter</button>
          </>
        ) : null}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ accueil */
function Welcome({ info, go }) {
  const end = addDays(info.start_date, info.total_days - 1);
  const start = addDays(info.start_date, 0);
  return (
    <div className="welcome">
      <Lamp />
      <h1>{info.name}</h1>
      {info.slogan ? <p className="lead">{info.slogan}</p> : null}
      <p className="dates">Du {longDate(start)} au {longDate(end)} {end.getFullYear()}</p>
      <ul className="facts">
        <li><Icon name="book" /> {info.portions.length} portions à lire dans l'ordre</li>
        <li><Icon name="clock" /> Environ 2 h de lecture par jour</li>
        <li><Icon name="repeat" /> {info.catchup_days.length} jours de rattrapage prévus</li>
      </ul>
      <div className="stack">
        <button className="btn primary" onClick={() => go('signup')}>Créer mon compte</button>
        <button className="btn quiet" onClick={() => go('login')}>J'ai déjà un compte</button>
      </div>
      <InstallCard />
    </div>
  );
}

function Back({ onClick, title }) {
  return (
    <div className="subhead">
      <button type="button" className="icon-btn" onClick={onClick} aria-label="Retour"><Icon name="back" /></button>
      <h1>{title}</h1>
    </div>
  );
}

/* ------------------------------------------------------------------ inscription */
function Signup({ info, go, onDone }) {
  const [f, setF] = useState({ nom: '', tel: '', pin: '', pin2: '', dep: 'at', livre: info.books[0] || '', chap: 1 });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const pin = f.pin.trim();
    if (pin && !/^\d{4}$/.test(pin)) return setErr('Le code secret doit contenir 4 chiffres, ou rester vide.');
    if (pin && pin !== f.pin2.trim()) return setErr('Les deux codes ne sont pas identiques.');
    setBusy(true);
    try {
      const r = await rpc('api_signup', {
        p_slug: info.slug, p_name: f.nom, p_phone: f.tel, p_pin: pin,
        p_start: f.dep, p_book: f.dep === 'ici' ? f.livre : null, p_chap: Number(f.chap) || 1,
      });
      if (r.error) setErr(r.error);
      else onDone(r.token, r.profile, pin
        ? 'Compte créé. Gardez bien votre code secret.'
        : 'Compte créé. Pour vous reconnecter, il suffira de votre numéro.');
    } catch { setErr('La connexion est difficile. Réessayez dans un instant.'); }
    setBusy(false);
  };

  const choices = [
    ['at', 'Au début de l\'Ancien Testament', 'Genèse'],
    ['nt', 'Au début du Nouveau Testament', 'Matthieu'],
    ['ici', 'Là où j\'en suis dans ma lecture', 'Je précise mon livre et mon chapitre'],
  ];

  return (
    <form className="page" onSubmit={submit} noValidate>
      <Back onClick={() => go('welcome')} title="Créer mon compte" />
      <Field label="Nom et prénom"><input value={f.nom} onChange={set('nom')} autoComplete="name" /></Field>
      <Field label="Numéro WhatsApp" hint="Avec l'indicatif du pays de préférence.">
        <input type="tel" inputMode="tel" value={f.tel} onChange={set('tel')} placeholder="+237 6 99 12 34 56" autoComplete="tel" />
      </Field>
      <Field label="Code secret (facultatif)" hint="4 chiffres. Avec un code, personne d'autre ne peut se connecter avec votre numéro.">
        <input className="pin" type="password" inputMode="numeric" maxLength={4} value={f.pin} onChange={set('pin')} autoComplete="new-password" />
      </Field>
      {f.pin ? (
        <Field label="Confirmez le code secret">
          <input className="pin" type="password" inputMode="numeric" maxLength={4} value={f.pin2} onChange={set('pin2')} autoComplete="new-password" />
        </Field>
      ) : null}

      <fieldset className="choices">
        <legend>Par où voulez-vous commencer ?</legend>
        {choices.map(([v, t, s]) => (
          <label key={v} className={`choice ${f.dep === v ? 'on' : ''}`}>
            <input type="radio" name="dep" value={v} checked={f.dep === v} onChange={set('dep')} />
            <span className="choice-text"><b>{t}</b><small>{s}</small></span>
            <span className="choice-dot" />
          </label>
        ))}
      </fieldset>
      {f.dep === 'ici' ? (
        <div className="two">
          <Field label="Livre actuel"><select value={f.livre} onChange={set('livre')}>{info.books.map((b) => <option key={b}>{b}</option>)}</select></Field>
          <Field label="Chapitre"><input type="number" inputMode="numeric" min="1" max="150" value={f.chap} onChange={set('chap')} /></Field>
        </div>
      ) : null}

      {err ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{err}</p></div> : null}
      <button className="btn primary" disabled={busy}>{busy ? 'Création en cours…' : 'Créer mon compte'}</button>
    </form>
  );
}

/* ------------------------------------------------------------------ connexion */
function Login({ info, go, onDone }) {
  const [tel, setTel] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await rpc('api_login', { p_slug: info.slug, p_phone: tel, p_pin: pin });
      if (r.error) setErr(r.error); else onDone(r.token, r.profile);
    } catch { setErr('La connexion est difficile. Réessayez dans un instant.'); }
    setBusy(false);
  };

  return (
    <form className="page" onSubmit={submit} noValidate>
      <Back onClick={() => go('welcome')} title="Me connecter" />
      <Field label="Numéro WhatsApp">
        <input type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="+237 6 99 12 34 56" autoComplete="tel" />
      </Field>
      <Field label="Code secret" hint="Seulement si vous en avez choisi un. Code oublié ? Contactez l'administration.">
        <input className="pin" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="current-password" />
      </Field>
      {err ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{err}</p></div> : null}
      <button className="btn primary" disabled={busy}>{busy ? 'Connexion…' : 'Me connecter'}</button>
    </form>
  );
}

/* ------------------------------------------------------------------ aujourd'hui */
function Today({ info, p, openReport }) {
  const total = info.total_chapters || 1;
  const pct = Math.min(100, Math.round((100 * p.chap_lus) / total));
  const expPct = Math.min(100, Math.round((100 * p.chap_attendus) / total));
  const fini = p.completes >= info.portions.length;
  const j = p.jour;
  const rest = info.catchup_days.includes(j);
  const end = addDays(info.start_date, info.total_days - 1);
  const kicker = p.rapport_aujourdhui ? 'Rapport du jour envoyé. Prochaine lecture' : 'À lire maintenant';

  return (
    <div className="page today">
      <InstallCard />
      <div className="greet">
        <p>Bonjour {p.first_name}</p>
        <Chip status={p.statut} />
      </div>

      <section className="hero" aria-label="Lecture du jour">
        <span className="bookmark" aria-hidden="true" />
        {fini ? (
          <>
            <p className="kicker">Challenge accompli</p>
            <h2>Vous avez lu toute la Bible.</h2>
            <p className="hero-sub">Louange à Dieu pour cette fidélité.</p>
          </>
        ) : p.next ? (
          <>
            <p className="kicker">{kicker}</p>
            <h2>{p.next.label}</h2>
            <p className="hero-sub">
              Portion {p.next.n} sur {info.portions.length}, {p.next.chapters} chapitres
              {p.next.deja ? `. Déjà lu : ${p.next.deja} sur ${p.next.chapters}.` : '.'}
            </p>
            <button className="btn gold" onClick={() => openReport(p.next.n)}>
              <Icon name="pen" /> Envoyer mon rapport
            </button>
          </>
        ) : null}
      </section>

      <section className="block">
        <div className="block-head">
          <h3>Le challenge</h3>
          <span className="muted">
            {j < 1 ? `Commence le ${longDate(addDays(info.start_date, 0))}` : j > info.total_days ? 'Terminé' : `Jour ${j} sur ${info.total_days}`}
          </span>
        </div>
        <div className="ribbon" role="img" aria-label={`Jour ${Math.max(j, 0)} sur ${info.total_days}`}>
          {Array.from({ length: info.total_days }, (_, i) => {
            const d = i + 1;
            const cls = [d < j ? 'past' : '', d === j ? 'now' : '', info.catchup_days.includes(d) ? 'rest' : ''].join(' ');
            return <span key={d} className={cls} />;
          })}
        </div>
        <p className="muted small">Fin le {longDate(end)}. Les barres hautes sont les jours de rattrapage.</p>
        {rest && j >= 1 && j <= info.total_days ? (
          <div className="notice"><Icon name="repeat" /> <p>Aujourd'hui, pas de nouvelle portion : c'est un jour de rattrapage.</p></div>
        ) : null}
      </section>

      <section className="block">
        <div className="block-head">
          <h3>Ma lecture</h3>
          <span className="muted">{pct} %</span>
        </div>
        <div className="meter" role="img" aria-label={`${p.chap_lus} chapitres lus sur ${info.total_chapters}`}>
          <div className="meter-fill" style={{ width: `${pct}%` }} />
          {p.attendues > 0 ? <div className="meter-mark" style={{ left: `${expPct}%` }} /> : null}
        </div>
        <p className="meter-line"><b>{p.chap_lus}</b> chapitres lus sur {info.total_chapters}</p>
        {p.attendues > 0 ? (
          <p className="muted small">
            {p.retard > 0
              ? `Le repère doré montre où vous devriez en être aujourd'hui. Il vous reste ${p.retard} chapitres à rattraper.`
              : 'Le repère doré montre où vous devriez en être aujourd\'hui. Vous êtes à jour.'}
          </p>
        ) : null}
        <p className="muted small">{p.completes} portion{p.completes > 1 ? 's' : ''} terminée{p.completes > 1 ? 's' : ''} sur {info.portions.length}.</p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ parcours */
function Trail({ info, p, openReport }) {
  const byN = Object.fromEntries(info.portions.map((x) => [x.n, x]));
  const [sel, setSel] = useState(p.next ? p.next.n : p.ordre[0]);
  const stateOf = (n) => {
    const d = p.lect[n] || 0, ch = byN[n]?.chapters || 1;
    if (d >= ch) return 'done';
    if (p.next && p.next.n === n) return 'next';
    return d ? 'part' : 'todo';
  };
  const cur = byN[sel];
  const d = p.lect[sel] || 0;
  const due = dueDay(info, p.ordre.indexOf(sel));
  const dueTxt = due ? longDate(addDays(info.start_date, due - 1)) : null;

  return (
    <div className="page">
      <h1 className="title">Mon parcours</h1>
      <p className="muted">Les {info.portions.length} portions, dans l'ordre de ma lecture. Touchez une portion pour la voir.</p>
      <div className="trail">
        {p.ordre.map((n) => {
          const st = stateOf(n);
          const pct = Math.round((100 * (p.lect[n] || 0)) / (byN[n]?.chapters || 1));
          return (
            <button key={n} className={`node ${st} ${sel === n ? 'sel' : ''}`} style={{ '--pct': `${pct}%` }}
              onClick={() => setSel(n)} aria-label={`Portion ${n}`} aria-pressed={sel === n}>
              {st === 'done' ? <Icon name="check" size={16} strokeWidth={2.6} /> : <span>{n}</span>}
            </button>
          );
        })}
      </div>
      <ul className="legend">
        <li><i className="done" /> Terminée</li>
        <li><i className="part" /> Commencée</li>
        <li><i className="next" /> À lire</li>
        <li><i className="todo" /> À venir</li>
      </ul>

      {cur ? (
        <section className="detail">
          <p className="muted small">Portion {sel}{dueTxt ? `, prévue le ${dueTxt}` : ''}</p>
          <h2>{cur.label}</h2>
          <p>
            {d >= cur.chapters ? 'Portion terminée.' : d ? `${d} sur ${cur.chapters} chapitres lus.` : `${cur.chapters} chapitres, pas encore commencée.`}
          </p>
          <button className="btn quiet" onClick={() => openReport(sel)}><Icon name="pen" /> Envoyer un rapport pour cette portion</button>
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ mes rapports */
function Reports({ token, openReport, lost }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const r = await rpc('api_my_reports', { p_token: token });
        if (r.logged_out) return lost();
        setList(r.list || []);
      } catch { setErr('Impossible d\'afficher vos rapports pour le moment.'); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fmt = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="page">
      <h1 className="title">Mes rapports</h1>
      {err ? <div className="notice bad"><Icon name="help" /> <p>{err}</p></div> : null}
      {!err && list === null ? <Loading /> : null}
      {list && list.length === 0 ? (
        <div className="empty">
          <p>Aucun rapport pour l'instant. Envoyez le premier après votre lecture du jour.</p>
          <button className="btn primary" onClick={() => openReport(null)}>Envoyer mon rapport</button>
        </div>
      ) : null}
      {list && list.length > 0 ? (
        <ol className="entries">
          {list.map((x, i) => (
            <li key={i}>
              <div className="entry-meta">
                <b>{x.label || `Portion ${x.portion_n}`}</b>
                <span>{fmt(x.created_at)}, {x.chapters} chapitre{x.chapters > 1 ? 's' : ''}</span>
              </div>
              <blockquote>{x.verse}</blockquote>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ formulaire de rapport */
function ReportForm({ info, p, token, preset, back, onDone, lost }) {
  const byN = Object.fromEntries(info.portions.map((x) => [x.n, x]));
  const [portion, setPortion] = useState(preset || (p.next ? p.next.n : p.ordre[0]));
  const ch = byN[portion]?.chapters || 1;
  const deja = p.lect[portion] || 0;
  const reste = deja >= ch ? ch : ch - deja;
  const [chap, setChap] = useState(String(reste));
  const [f, setF] = useState({ verset: '', appris: '', appli: '', question: '' });
  const [askQ, setAskQ] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const changePortion = (e) => {
    const n = Number(e.target.value);
    const c = byN[n]?.chapters || 1, d = p.lect[n] || 0;
    setPortion(n);
    setChap(String(d >= c ? c : c - d));
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.verset.trim() || !f.appris.trim() || !f.appli.trim()) return setErr('Merci de remplir les trois premières cases.');
    setBusy(true);
    try {
      const r = await rpc('api_report', {
        p_token: token, p_portion: portion, p_chapters: Number(chap),
        p_verse: f.verset, p_learned: f.appris, p_application: f.appli, p_question: f.question,
      });
      if (r.logged_out) return lost();
      if (r.error) setErr(r.error); else onDone(r.profile);
    } catch { setErr('La connexion est difficile. Réessayez : votre texte est conservé.'); }
    setBusy(false);
  };

  const opts = [];
  for (let k = 1; k < reste; k++) opts.push(<option key={k} value={k}>{k} chapitre{k > 1 ? 's' : ''}</option>);

  return (
    <form className="page report" onSubmit={submit} noValidate>
      <Back onClick={back} title="Mon rapport" />
      <Field label="Portion lue">
        <select value={portion} onChange={changePortion}>
          {p.ordre.map((n) => {
            const d = p.lect[n] || 0, c = byN[n]?.chapters || 0;
            return <option key={n} value={n}>{d >= c ? '✓ ' : d ? `${d}/${c} · ` : ''}P{n} — {byN[n]?.label}</option>;
          })}
        </select>
      </Field>
      <Field label="Chapitres lus" hint={deja >= ch ? 'Portion déjà terminée : ce rapport sera enregistré en plus.' : deja ? `Déjà lu dans cette portion : ${deja} sur ${ch}.` : ''}>
        <select value={chap} onChange={(e) => setChap(e.target.value)}>
          <option value={reste}>
            {deja >= ch ? `Toute la portion (${ch})` : deja ? `Tout le reste (${reste})` : `Toute la portion (${ch})`}
          </option>
          {opts}
        </select>
      </Field>
      <Field label="Le verset qui m'a marqué"><textarea value={f.verset} onChange={set('verset')} placeholder="Référence et texte du verset" /></Field>
      <Field label="Ce que j'ai appris"><textarea value={f.appris} onChange={set('appris')} /></Field>
      <Field label="Comment je vais l'appliquer"><textarea value={f.appli} onChange={set('appli')} /></Field>
      {askQ ? (
        <Field label="Ma question" hint="L'équipe répond dans le grand groupe.">
          <textarea className="short" value={f.question} onChange={set('question')} />
        </Field>
      ) : (
        <button type="button" className="link" onClick={() => setAskQ(true)}><Icon name="plus" size={16} /> Poser une question sur ma lecture</button>
      )}
      {err ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{err}</p></div> : null}
      <div className="submitbar">
        <button className="btn primary" disabled={busy}><Icon name="send" /> {busy ? 'Envoi en cours…' : 'Envoyer mon rapport'}</button>
      </div>
    </form>
  );
}
