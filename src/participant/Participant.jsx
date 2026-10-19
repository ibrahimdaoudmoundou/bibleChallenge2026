import { useCallback, useEffect, useMemo, useState } from 'react';
import { spreadChapters, reportDays } from '../ui/spread.js';
import { rpc, safeGet, safeSet, isMissingFn, isOffline } from '../supabase.js';
import { Icon, Brand, Lamp } from '../ui/icons.jsx';
import { Chip, Toast, Sheet, Field, Loading, addDays, longDate, initials } from '../ui/kit.jsx';
import { InstallCard, InstallButton } from '../ui/install.jsx';
import { Credit } from '../ui/credit.jsx';
import { enqueue, flushOutbox, readOutbox, readDraft, saveDraft, sendReport, uuid } from './outbox.js';

const OFFLINE_MSG = 'Vous n\'êtes pas connecté à Internet.';
const readJSON = (k) => { try { return JSON.parse(safeGet(k) || 'null'); } catch { return null; } };
const writeJSON = (k, v) => { try { safeSet(k, v ? JSON.stringify(v) : null); } catch { /* stockage plein */ } };

// Suit l'état de la connexion du téléphone
function useOnline() {
  const [on, setOn] = useState(() => !isOffline());
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

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

/* Le challenge a-t-il commencé ? (jour serveur, ou date du téléphone si l'appli est restée ouverte après minuit) */
const hasStarted = (info, p) => {
  const j = p?.jour ?? info?.jour;
  if (typeof j === 'number' && j >= 1) return true;
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: info?.timezone || 'Africa/Douala' });
    return today >= String(info?.start_date || '').slice(0, 10);
  } catch { return true; }
};
const notStartedMsg = (info) => `Le challenge commence le ${longDate(addDays(info.start_date, 0))}. Vous pourrez envoyer votre premier rapport à partir de ce jour-là.`;

export default function Participant({ slug }) {
  const [info, setInfo] = useState(null);
  const [fatal, setFatal] = useState('');
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState('loading');
  const [toast, setToast] = useState('');
  const [preset, setPreset] = useState(null);
  const [menu, setMenu] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [loginNotice, setLoginNotice] = useState('');
  const [pending, setPending] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const online = useOnline();

  const tokenKey = info ? `cb_token_${info.slug}` : '';
  const token = () => (tokenKey ? safeGet(tokenKey) : null);
  const closeToast = useCallback(() => setToast(''), []);

  useEffect(() => {
    (async () => {
      try {
        if (isOffline()) throw new Error('offline');
        const i = await rpc('api_info', { p_slug: slug });
        if (!i.ok) { setFatal(i.error || 'Challenge introuvable.'); return; }
        setInfo(i);
        writeJSON(`cb_info_${slug || 'index'}`, i);
        document.title = i.name;
        setPending(readOutbox(i.slug).length);
        const t = safeGet(`cb_token_${i.slug}`);
        if (t) {
          const r = await rpc('api_profile', { p_token: t });
          if (r.ok) { setProfile(r.profile); writeJSON(`cb_profile_${i.slug}`, r.profile); setScreen('today'); return; }
          safeSet(`cb_token_${i.slug}`, null);
          setLoginNotice('Votre session a expiré. Reconnectez-vous avec votre numéro WhatsApp pour continuer.');
          setScreen('login');
          return;
        }
        setScreen('welcome');
      } catch {
        // Hors connexion : on ouvre l'application avec les dernières informations enregistrées sur le téléphone
        const i = readJSON(`cb_info_${slug || 'index'}`);
        if (!i) { setFatal(`${OFFLINE_MSG} Connectez-vous (données mobiles ou Wi-Fi), puis rechargez la page.`); return; }
        setInfo(i); setFromCache(true);
        document.title = i.name;
        setPending(readOutbox(i.slug).length);
        const prof = safeGet(`cb_token_${i.slug}`) ? readJSON(`cb_profile_${i.slug}`) : null;
        if (prof) { setProfile(prof); setScreen('today'); } else setScreen('welcome');
      }
    })();
  }, [slug]);

  // Envoi automatique des rapports gardés sur le téléphone, dès que la connexion revient
  useEffect(() => {
    if (!info || !online) return undefined;
    const run = async () => {
      if (!readOutbox(info.slug).length) { setPending(0); return; }
      const r = await flushOutbox(info.slug);
      setPending(readOutbox(info.slug).length);
      if (r.profile) { setProfile(r.profile); writeJSON(`cb_profile_${info.slug}`, r.profile); }
      if (r.sent) setToast(r.sent > 1 ? `${r.sent} rapports en attente ont été envoyés. Merci !` : 'Votre rapport en attente a été envoyé. Merci !');
      if (r.failed?.length) setToast(`Un rapport n'a pas pu être enregistré : ${r.failed[0]}`);
      if (r.needLogin) { setLoginNotice('Reconnectez-vous avec votre numéro pour envoyer le rapport gardé sur ce téléphone.'); }
    };
    run();
    const t = setInterval(run, 45000);
    return () => clearInterval(t);
  }, [info, online]);

  // De retour en ligne après une ouverture hors connexion : on rafraîchit les données
  useEffect(() => {
    if (!online || !fromCache || !info) return;
    (async () => {
      try {
        const i = await rpc('api_info', { p_slug: slug });
        if (i.ok) { setInfo(i); writeJSON(`cb_info_${slug || 'index'}`, i); setFromCache(false); }
        const t = safeGet(`cb_token_${i.slug}`);
        if (t) { const r = await rpc('api_profile', { p_token: t }); if (r.ok) { setProfile(r.profile); writeJSON(`cb_profile_${i.slug}`, r.profile); } }
      } catch { /* toujours hors connexion */ }
    })();
  }, [online, fromCache, info, slug]);

  const enter = (tok, prof, message = '') => {
    safeSet(tokenKey, tok);
    setProfile(prof);
    writeJSON(`cb_profile_${info.slug}`, prof);
    setLoginNotice('');
    if (message) setToast(message);
    setScreen(readDraft(info.slug) ? 'report' : 'today');
  };
  const logout = () => { safeSet(tokenKey, null); writeJSON(`cb_profile_${info.slug}`, null); setProfile(null); setMenu(false); setScreen('welcome'); };
  const lostSession = () => {
    safeSet(tokenKey, null); setProfile(null);
    setLoginNotice('Votre session a expiré. Reconnectez-vous avec votre numéro WhatsApp : votre rapport en cours est gardé et vous le retrouverez juste après.');
    setScreen('login');
  };
  const updateProfile = (prof) => { setProfile(prof); writeJSON(`cb_profile_${info.slug}`, prof); };
  const openReport = (n) => {
    if (!hasStarted(info, profile)) { setToast(notStartedMsg(info)); return; }
    setPreset(n || null); setScreen('report');
  };

  if (fatal) return <div className="solo"><div className="notice bad"><Icon name={isOffline() ? 'wifioff' : 'help'} /> <p>{fatal}</p></div></div>;
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
        {!online ? (
          <div className="notice offline" role="status">
            <Icon name="wifioff" />
            <p><b>{OFFLINE_MSG}</b> Vous pouvez quand même écrire votre rapport : il sera gardé sur ce téléphone et envoyé automatiquement dès le retour de la connexion.</p>
          </div>
        ) : null}
        {pending > 0 ? (
          <div className="notice pending" role="status">
            <Icon name="clock" />
            <p><b>{pending > 1 ? `${pending} rapports en attente d'envoi.` : '1 rapport en attente d\'envoi.'}</b> {online ? 'Envoi en cours…' : 'Il partira tout seul dès que vous serez connecté. Rouvrez simplement l\'application.'}</p>
          </div>
        ) : null}
        {screen !== 'report' ? <Announcement info={info} /> : null}
        {inApp && profile.country !== undefined && (!String(profile.country || '').trim() || !String(profile.city || '').trim()) ? (
          <div className="notice pending" role="status">
            <Icon name="globe" />
            <p><b>Complétez vos informations.</b> Votre pays et votre ville sont maintenant obligatoires.{' '}
              <button type="button" className="link" onClick={() => setMenu(true)}>Les indiquer</button></p>
          </div>
        ) : null}
        {screen === 'welcome' ? <Welcome info={info} go={setScreen} /> : null}
        {screen === 'signup' ? <Signup info={info} go={setScreen} onDone={enter} /> : null}
        {screen === 'login' ? <Login info={info} go={setScreen} onDone={enter} notice={loginNotice} /> : null}
        {screen === 'today' && profile ? <Today info={info} p={profile} openReport={openReport} /> : null}
        {screen === 'trail' && profile ? <Trail info={info} p={profile} openReport={openReport} /> : null}
        {screen === 'reports' && profile ? <Reports token={token()} openReport={openReport} lost={lostSession} /> : null}
        {screen === 'report' && profile ? (
          <ReportForm info={info} p={profile} token={token()} preset={preset} back={() => setScreen('today')} lost={lostSession}
            onDone={(p, msg) => { updateProfile(p); setToast(msg || 'Rapport enregistré. Que Dieu bénisse votre lecture.'); setScreen('today'); }}
            onQueued={(n) => { setPending(n); setToast('Rapport gardé sur ce téléphone. Il sera envoyé automatiquement dès le retour d\'Internet.'); setScreen('today'); }} />
        ) : null}
        {!inApp && screen !== 'report' && info.signature ? <footer className="signature">{info.signature}</footer> : null}
        {screen !== 'report' ? <Credit /> : null}
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
            <MyInfo info={info} p={profile} token={token()} onSaved={(p) => { updateProfile(p); setToast('Informations enregistrées.'); }} lost={() => { setMenu(false); lostSession(); }} />
            <button className="btn quiet" onClick={() => { setMenu(false); setStoryOpen(true); }}><Icon name="heart" /> L'histoire du challenge</button>
            {info.plan_url ? <a className="btn quiet" href={info.plan_url} target="_blank" rel="noreferrer"><Icon name="file" /> Plan de lecture</a> : null}
            <a className="btn quiet" href="/Guide_participant_Challenge_Bible_40j.pdf" target="_blank" rel="noreferrer"><Icon name="file" /> Guide du participant</a>
            <InstallButton />
            <button className="btn quiet" onClick={logout}><Icon name="logout" /> Me déconnecter</button>
          </>
        ) : null}
      </Sheet>
      <Sheet open={storyOpen} onClose={() => setStoryOpen(false)} title="L'histoire du challenge">
        <Story slug={info.slug} bare />
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ annonce des administrateurs */
function Announcement({ info }) {
  const k = `cb_ann_${info.slug}`;
  const [hidden, setHidden] = useState(() => safeGet(k));
  const text = String(info.announcement || '').trim();
  if (!text || hidden === String(info.announcement_at)) return null;
  return (
    <div className="announce" role="status">
      <Icon name="bell" />
      <div><b>Annonce</b><p>{text}</p></div>
      <button className="icon-btn" onClick={() => { safeSet(k, String(info.announcement_at)); setHidden(String(info.announcement_at)); }} aria-label="Masquer l'annonce"><Icon name="close" size={18} /></button>
    </div>
  );
}

/* ------------------------------------------------------------------ l'histoire du challenge */
function Story({ slug, bare = false }) {
  const k = `cb_story_${slug}`;
  const [st, setSt] = useState(() => readJSON(k));
  useEffect(() => {
    rpc('api_story', { p_slug: slug })
      .then((r) => { if (r.ok) { setSt(r); writeJSON(k, r); } })
      .catch(() => { /* base pas encore à jour ou hors connexion : on garde la version enregistrée */ });
  }, [slug, k]);
  if (!st || !String(st.body || '').trim()) return bare ? <p className="muted">Bientôt disponible.</p> : null;
  const paragraphs = String(st.body).split(/\n\s*\n/).filter((x) => x.trim());
  return (
    <section className={`story ${bare ? 'bare' : ''}`} aria-label={st.title || 'Histoire du challenge'}>
      {st.photo ? <img className="story-photo" src={st.photo} alt="Photo illustrant l'histoire du challenge" loading="lazy" /> : null}
      {st.title && !bare ? <h2>{st.title}</h2> : null}
      {paragraphs.map((x, i) => <p key={i}>{x}</p>)}
    </section>
  );
}

/* ------------------------------------------------------------------ mes informations (pays et ville obligatoires) */
function MyInfo({ info, p, token, onSaved, lost }) {
  const [open, setOpen] = useState(!String(p.country || '').trim() || !String(p.city || '').trim());
  const [f, setF] = useState({ country: p.country || '', city: p.city || '', previous: p.previous_participations ?? '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (p.country === undefined) return null; // base pas encore à jour
  const set = (key) => (e) => setF({ ...f, [key]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setErr('');
    const miss = placeMissing(f);
    if (miss) return setErr(miss);
    if (isOffline()) return setErr(`${OFFLINE_MSG} Réessayez quand vous serez connecté.`);
    setBusy(true);
    try {
      const r = await rpc('api_update_profile', { p_token: token, p_country: f.country, p_city: f.city, p_previous: f.previous === '' ? null : Number(f.previous) });
      if (r.logged_out) return lost();
      if (r.error) setErr(r.error);
      else if (r.ok) { onSaved(r.profile); setOpen(false); }
    } catch { setErr('La connexion est difficile. Réessayez dans un instant.'); }
    setBusy(false);
  };
  if (!open) {
    return <button className="btn quiet" onClick={() => setOpen(true)}><Icon name="globe" /> Mes informations{p.country || p.city ? ` (${[p.city, p.country].filter(Boolean).join(', ')})` : ''}</button>;
  }
  return (
    <form className="myinfo" onSubmit={save} data-slug={info.slug}>
      <p className="small muted">Le pays et la ville sont obligatoires : ils aident l'équipe à mieux vous accompagner.</p>
      <PlaceFields f={f} set={set} />
      {err ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{err}</p></div> : null}
      <button className="btn primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
    </form>
  );
}

const placeMissing = (f) => {
  if (!String(f.country || '').trim()) return 'Indiquez votre pays (obligatoire).';
  if (!String(f.city || '').trim()) return 'Indiquez votre ville ou localité (obligatoire).';
  return '';
};

function PlaceFields({ f, set }) {
  return (
    <>
      <div className="two">
        <Field label="Pays (obligatoire)"><input value={f.country} onChange={set('country')} placeholder="Cameroun" autoComplete="country-name" /></Field>
        <Field label="Ville / localité (obligatoire)"><input value={f.city} onChange={set('city')} placeholder="Douala" autoComplete="address-level2" /></Field>
      </div>
      <Field label="Nombre de participations précédentes (facultatif)" hint="Combien de fois avez-vous déjà fait ce challenge ? Laissez vide si c'est la première fois.">
        <input type="number" inputMode="numeric" min="0" max="100" value={f.previous} onChange={set('previous')} />
      </Field>
    </>
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
      <Story slug={info.slug} />
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
  const [f, setF] = useState({ nom: '', tel: '', pin: '', pin2: '', dep: 'at', livre: info.books[0] || '', chap: 1, country: '', city: '', previous: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const pin = f.pin.trim();
    if (pin && !/^\d{4}$/.test(pin)) return setErr('Le code secret doit contenir 4 chiffres, ou rester vide.');
    if (pin && pin !== f.pin2.trim()) return setErr('Les deux codes ne sont pas identiques.');
    const miss = placeMissing(f);
    if (miss) return setErr(miss);
    if (isOffline()) return setErr(`${OFFLINE_MSG} La création du compte demande une connexion : réessayez dès que vous êtes connecté.`);
    setBusy(true);
    try {
      const base = {
        p_slug: info.slug, p_name: f.nom, p_phone: f.tel, p_pin: pin,
        p_start: f.dep, p_book: f.dep === 'ici' ? f.livre : null, p_chap: Number(f.chap) || 1,
      };
      let r;
      try {
        r = await rpc('api_signup_v2', { ...base, p_country: f.country, p_city: f.city, p_previous: f.previous === '' ? null : Number(f.previous) });
      } catch (e2) {
        if (!isMissingFn(e2)) throw e2;
        r = await rpc('api_signup', base);
      }
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
      {f.dep === 'ici' ? <p className="small muted">Votre lecture commencera exactement à ce chapitre. Le début de la portion que vous sautez sera prévu à la fin de votre parcours : rien n'est perdu.</p> : null}

      <PlaceFields f={f} set={set} />

      {err ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{err}</p></div> : null}
      <button className="btn primary" disabled={busy}>{busy ? 'Création en cours…' : 'Créer mon compte'}</button>
    </form>
  );
}

/* ------------------------------------------------------------------ connexion */
function Login({ info, go, onDone, notice = '' }) {
  const [tel, setTel] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (isOffline()) return setErr(`${OFFLINE_MSG} La connexion à votre compte demande Internet : réessayez dès que vous êtes connecté.`);
    setBusy(true);
    try {
      const r = await rpc('api_login', { p_slug: info.slug, p_phone: tel, p_pin: pin });
      if (r.error) setErr(r.error); else onDone(r.token, r.profile);
    } catch { setErr('La connexion est difficile. Réessayez dans un instant.'); }
    setBusy(false);
  };

  return (
    <form className="page" onSubmit={submit} noValidate>
      <Back onClick={() => go('welcome')} title="Me connecter" />
      {notice ? <div className="notice" role="status"><Icon name="key" /> <p>{notice}</p></div> : null}
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
        ) : p.next && !hasStarted(info, p) ? (
          <>
            <p className="kicker">Votre première lecture</p>
            <h2>{p.next.label}</h2>
            <p className="hero-sub">{notStartedMsg(info)}</p>
          </>
        ) : p.next ? (
          <>
            <p className="kicker">{kicker}</p>
            <h2>{p.next.label}</h2>
            <p className="hero-sub">
              Portion {p.next.n} sur {info.portions.length}, {p.next.chapters} chapitres
              {p.next.deja ? `. Déjà lu : ${p.next.deja} sur ${p.next.chapters}.` : '.'}
            </p>
            <button className="btn gold" onClick={() => openReport(null)}>
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
              ? `Le repère doré montre l'objectif de ce soir. Il vous reste ${p.retard} chapitres à rattraper des jours précédents.`
              : p.chap_lus < p.chap_attendus
                ? 'Le repère doré montre l\'objectif de ce soir. Vous êtes à jour : il reste la lecture du jour.'
                : 'Le repère doré montre l\'objectif de ce soir. Vous êtes à jour.'}
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
  const dep = p.depart || null;
  const split = !!(dep && dep.offset > 0 && p.ordre[0] === dep.n);
  const isSplit = split && sel === dep.n;
  const lastDue = dueDay(info, p.ordre.length - 1);
  const headLu = isSplit ? Math.min(d, dep.head) : 0;
  const tailLu = isSplit ? Math.max(0, d - dep.head) : 0;

  return (
    <div className="page">
      <h1 className="title">Mon parcours</h1>
      <p className="muted">Les {info.portions.length} portions, dans l'ordre de ma lecture. Touchez une portion pour la voir.</p>
      {dep ? (
        <p className="muted small">
          Ma lecture commence à <b>{dep.label}</b>.
          {split ? ` La portion ${dep.n} est coupée en deux : ${dep.head_label} au début, et ${dep.tail_label} à la fin de mon parcours.` : ''}
          {' '}Pour changer de point de départ, adressez-vous à un administrateur.
        </p>
      ) : null}
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
          {isSplit ? (
            <>
              <h2>{dep.head_label}</h2>
              <p>{headLu >= dep.head ? 'Terminé.' : headLu ? `${headLu} sur ${dep.head} chapitres lus.` : `${dep.head} chapitres, pas encore commencé.`}</p>
              <p className="muted small">
                Le reste de cette portion, <b>{dep.tail_label}</b> ({dep.tail} chapitre{dep.tail > 1 ? 's' : ''}), est prévu à la fin de mon parcours
                {lastDue ? `, le ${longDate(addDays(info.start_date, lastDue - 1))}` : ''}
                {tailLu >= dep.tail ? ' : terminé.' : tailLu ? ` : ${tailLu} sur ${dep.tail} lus.` : '.'}
              </p>
            </>
          ) : (
            <>
              <h2>{cur.label}</h2>
              <p>
                {d >= cur.chapters ? 'Portion terminée.' : d ? `${d} sur ${cur.chapters} chapitres lus.` : `${cur.chapters} chapitres, pas encore commencée.`}
              </p>
            </>
          )}
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
              {x.verse ? <blockquote>{x.verse}</blockquote> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ formulaire de rapport */
function ReportForm({ info, p, token, preset, back, onDone, onQueued, lost }) {
  const byN = Object.fromEntries(info.portions.map((x) => [x.n, x]));
  const draft = readDraft(info.slug);
  // « simple » : seulement le nombre de chapitres (répartition automatique) ; « portion » : l'ancien formulaire
  const [mode, setMode] = useState(draft?.mode || (preset ? 'portion' : 'simple'));
  const [portion, setPortion] = useState(draft?.portion && byN[draft.portion] ? draft.portion : preset || (p.next ? p.next.n : p.ordre[0]));
  const ch = byN[portion]?.chapters || 1;
  const deja = p.lect[portion] || 0;
  const reste = deja >= ch ? ch : ch - deja;
  const [chap, setChap] = useState(draft?.chap ? String(draft.chap) : String(reste));
  const { today, days } = useMemo(() => reportDays(info.start_date, info.total_days, info.timezone), [info.start_date, info.total_days, info.timezone]);
  const [day, setDay] = useState(draft?.day && days.some((d) => d.iso === draft.day) ? draft.day : (days[0]?.iso || today));
  const [nb, setNb] = useState(draft?.nb ? String(draft.nb) : '');
  const [f, setF] = useState(draft?.f || { verset: '', appris: '', appli: '', question: '' });
  const [askQ, setAskQ] = useState(Boolean(draft?.f?.question));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Brouillon gardé sur le téléphone pendant la saisie
  useEffect(() => {
    const empty = !f.verset.trim() && !f.appris.trim() && !f.appli.trim() && !f.question.trim() && !nb;
    saveDraft(info.slug, empty ? null : { mode, portion, chap, f, day, nb });
  }, [info.slug, mode, portion, chap, f, day, nb]);

  const changePortion = (e) => {
    const n = Number(e.target.value);
    const c = byN[n]?.chapters || 1, d = p.lect[n] || 0;
    setPortion(n);
    setChap(String(d >= c ? c : c - d));
  };

  const nbVal = Math.floor(Number(nb) || 0);
  const plan = spreadChapters({ order: p.ordre, byN, lect: p.lect, chapters: nbVal, depart: p.depart });
  const step = (k) => setNb(String(Math.max(0, nbVal + k) || ''));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    let payload;
    if (mode === 'simple') {
      if (nbVal < 1) return setErr('Indiquez le nombre de chapitres lus.');
      if (plan.overflow > 0) return setErr(`Il ne reste que ${plan.remainingTotal} chapitre(s) à lire dans le plan.`);
      payload = {
        p_token: token, p_chapters: nbVal, p_date: day && day !== today ? day : null,
        p_verse: f.verset, p_learned: f.appris, p_application: f.appli, p_question: f.question, p_client_id: uuid(),
      };
    } else {
      payload = {
        p_token: token, p_portion: portion, p_chapters: Number(chap),
        p_verse: f.verset, p_learned: f.appris, p_application: f.appli, p_question: f.question, p_client_id: uuid(),
      };
    }
    const queue = () => { const n = enqueue(info.slug, token, payload); saveDraft(info.slug, null); onQueued(n); };
    if (isOffline()) return queue();
    setBusy(true);
    try {
      const r = await sendReport(payload);
      if (r.logged_out) { setBusy(false); return lost(); }
      if (r.error) setErr(r.error);
      else {
        saveDraft(info.slug, null);
        const parts = r.parts || [];
        const msg = parts.length > 1
          ? `Rapport enregistré : ${parts.map((x) => `${x.chapters} ch. en P${x.n}`).join(', ')}. Que Dieu bénisse votre lecture.`
          : '';
        onDone(r.profile, msg);
      }
    } catch (e2) {
      if (e2?.fatal) setErr('Le rapport n\'a pas pu être enregistré. Réessayez dans un instant : votre texte est conservé.');
      else { setBusy(false); return queue(); } // réseau coupé pendant l'envoi : on garde le rapport sur le téléphone
    }
    setBusy(false);
  };

  const opts = [];
  for (let k = 1; k < reste; k++) opts.push(<option key={k} value={k}>{k} chapitre{k > 1 ? 's' : ''}</option>);
  const lastPart = plan.parts[plan.parts.length - 1];

  return (
    <form className="page report" onSubmit={submit} noValidate>
      <Back onClick={back} title="Mon rapport" />
      {mode === 'simple' ? (
        <>
          <Field label="Pour quel jour ?" hint="Vous pouvez aussi rendre compte d'un jour passé que vous avez oublié.">
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              {days.map((d) => <option key={d.iso} value={d.iso}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="Combien de chapitres avez-vous lus ?" hint="Un seul nombre suffit : l'application les range toute seule dans vos portions.">
            <div className="stepper">
              <button type="button" className="step-btn" onClick={() => step(-1)} aria-label="Un chapitre de moins">−</button>
              <input type="number" inputMode="numeric" min="1" value={nb} onChange={(e) => setNb(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" aria-label="Nombre de chapitres lus" />
              <button type="button" className="step-btn" onClick={() => step(1)} aria-label="Un chapitre de plus">+</button>
            </div>
          </Field>
          {nbVal > 0 ? (
            <div className={`spread ${plan.overflow > 0 ? 'bad' : ''}`} aria-live="polite">
              {plan.overflow > 0 ? (
                <p><b>Il ne reste que {plan.remainingTotal} chapitre(s) à lire dans le plan.</b></p>
              ) : (
                <>
                  <p>Vos <b>{nbVal} chapitre{nbVal > 1 ? 's' : ''}</b> seront comptés ainsi :</p>
                  <ul>
                    {plan.parts.map((x, i) => (
                      <li key={i}>
                        <span className={x.complete ? 'ok' : 'plus'}>{x.complete ? '✓' : '+'}</span>
                        <span><b>P{x.n}</b> {x.label} : {x.chapters} chapitre{x.chapters > 1 ? 's' : ''}
                          {x.complete ? (x.part ? ' (terminé)' : ' (portion terminée)') : ` (${x.deja + x.chapters} sur ${x.total})`}</span>
                      </li>
                    ))}
                  </ul>
                  {lastPart && !lastPart.complete ? <p className="small muted">Vous reprendrez dans la portion P{lastPart.n}, après {lastPart.deja + lastPart.chapters} chapitre{lastPart.deja + lastPart.chapters > 1 ? 's' : ''}.</p> : null}
                </>
              )}
            </div>
          ) : null}
          <button type="button" className="link" onClick={() => setMode('portion')}>Choisir la portion moi-même</button>
        </>
      ) : (
        <>
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
          <button type="button" className="link" onClick={() => setMode('simple')}>Plus simple : indiquer seulement le nombre de chapitres lus</button>
        </>
      )}
      <Field label="Le verset qui m'a marqué (facultatif)"><textarea value={f.verset} onChange={set('verset')} placeholder="Référence et texte du verset" /></Field>
      <Field label="Ce que j'ai appris (facultatif)"><textarea value={f.appris} onChange={set('appris')} /></Field>
      <Field label="Comment je vais l'appliquer (facultatif)"><textarea value={f.appli} onChange={set('appli')} /></Field>
      {askQ ? (
        <Field label="Ma question" hint="L'équipe répond dans le grand groupe.">
          <textarea className="short" value={f.question} onChange={set('question')} />
        </Field>
      ) : (
        <button type="button" className="link" onClick={() => setAskQ(true)}><Icon name="plus" size={16} /> Poser une question sur ma lecture</button>
      )}
      {err ? <div className="notice bad" role="alert"><Icon name="help" /> <p>{err}</p></div> : null}
      {isOffline() ? <p className="small muted offline-hint"><Icon name="wifioff" size={15} /> Hors connexion : en appuyant sur « Envoyer », le rapport sera gardé sur ce téléphone puis envoyé automatiquement.</p> : null}
      <div className="submitbar">
        <button className="btn primary" disabled={busy}><Icon name="send" /> {busy ? 'Envoi en cours…' : 'Envoyer mon rapport'}</button>
      </div>
    </form>
  );
}
