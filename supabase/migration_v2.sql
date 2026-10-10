-- ==================================================================
--  CHALLENGE BIBLE — MISE À JOUR v2 (à exécuter UNE fois, après schema.sql)
--  Supabase > SQL Editor > New query > coller ce fichier > Run
--
--  Ce script ne fait QUE des ajouts : nouvelles colonnes facultatives,
--  nouvelles tables, nouvelles fonctions. Aucune donnée n'est supprimée
--  ni modifiée. Il peut être relancé sans danger.
--
--  Ajoute :
--   • champs facultatifs participants : pays, ville, participations précédentes
--   • ajout de participants et de rapports par les administrateurs
--   • historique des actions des administrateurs
--   • texte « L'histoire du challenge » + photo, modifiables dans /admin
--   • annonce affichée dans l'application des participants
--   • envoi des rapports hors connexion sans doublon
--   • statistiques (rapports par jour)
-- ==================================================================

-- ------------------------------------------------------------------
--  1. NOUVELLES COLONNES (toutes facultatives)
-- ------------------------------------------------------------------
alter table public.participants add column if not exists country text;
alter table public.participants add column if not exists city text;
alter table public.participants add column if not exists previous_participations int
  check (previous_participations is null or previous_participations between 0 and 100);
alter table public.participants add column if not exists added_by text;   -- e-mail de l'admin si ajouté depuis /admin

alter table public.reports add column if not exists entered_by text;      -- e-mail de l'admin si saisi depuis /admin
alter table public.reports add column if not exists client_id uuid;       -- évite les doublons lors des renvois hors connexion
create unique index if not exists reports_client_id_key on public.reports (client_id);

alter table public.challenges add column if not exists announcement text not null default '';
alter table public.challenges add column if not exists announcement_at timestamptz;

-- ------------------------------------------------------------------
--  2. NOUVELLES TABLES
-- ------------------------------------------------------------------
create table if not exists public.admin_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  admin_email text,
  challenge_id uuid references public.challenges(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb
);
create index if not exists admin_logs_challenge_idx on public.admin_logs (challenge_id, created_at desc);

create table if not exists public.challenge_story (
  challenge_id uuid primary key references public.challenges(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  photo text not null default '',          -- image JPEG redimensionnée (data:image/jpeg;base64,...)
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.admin_logs enable row level security;
alter table public.challenge_story enable row level security;
revoke all on public.admin_logs, public.challenge_story from anon, authenticated;

-- Texte de départ pour chaque session (modifiable ensuite dans /admin > Page publique)
insert into public.challenge_story (challenge_id, title, body)
select c.id, 'L''histoire du challenge',
'Ce challenge est né du fardeau personnel de sœur Mary Epie Fomum. Au départ, le but était simplement de s''aider elle-même à lire la Bible avec fidélité. Très vite, elle a vu que cette démarche pouvait aider beaucoup d''autres personnes.

Elle a été encouragée par un message du frère Theodore Andoseh, qui exhortait à lire abondamment la Bible, car c''est ce qui est en toi qui sort de toi. Même si tu batailles dans un péché, viens te plonger dans la Parole : elle va t''aider. Plonge-toi dans la Parole afin que ce soit elle qui sorte de toi.

L''un des buts de ce challenge est aussi d''amener d''autres personnes à lire la Bible trois fois par an, comme elle.'
from public.challenges c
on conflict (challenge_id) do nothing;

-- ------------------------------------------------------------------
--  3. OUTILS PRIVÉS
-- ------------------------------------------------------------------
create or replace function app_private.admin_email() returns text
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select email from auth.users where id = auth.uid()), '')
$$;

create or replace function app_private.log(p_cid uuid, p_action text, p_details jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.admin_logs (admin_email, challenge_id, action, details)
  values (app_private.admin_email(), p_cid, p_action, coalesce(p_details, '{}'::jsonb))
$$;

-- Profil d'un participant : identique à la v1, avec en plus pays, ville, participations,
-- nombre de rapports et nombre de jours actifs (pour les classements).
create or replace function app_private.profile(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  p public.participants;
  c public.challenges;
  v_n int; v_tot int; v_day int; v_att int;
  v_read int := 0; v_done int := 0; v_exp int := 0; v_retard int; v_seuil int;
  v_lect jsonb := '{}'::jsonb;
  v_ordre jsonb;
  v_statut text;
  v_next_n int := 0; v_next_deja int := 0; v_next_label text; v_next_ch int := 0;
  v_last timestamptz; v_today boolean; v_nb int; v_jours int;
  rec record; v_lu int;
begin
  select * into p from public.participants where id = p_id;
  if not found then return null; end if;
  select * into c from public.challenges where id = p.challenge_id;
  select count(*), coalesce(sum(chapters), 0) into v_n, v_tot from public.portions where challenge_id = c.id;
  v_day := app_private.challenge_day(c);
  v_att := app_private.expected_portions(v_day, c.total_days, c.catchup_days, v_n);

  for rec in
    select po.n as pn, po.chapters as pch,
           least(po.chapters, coalesce(sum(r.chapters), 0))::int as lu
    from public.portions po
    left join public.reports r on r.participant_id = p.id and r.portion_n = po.n
    where po.challenge_id = c.id
    group by po.n, po.chapters
  loop
    if rec.lu > 0 then v_lect := v_lect || jsonb_build_object(rec.pn::text, rec.lu); end if;
    v_read := v_read + rec.lu;
    if rec.lu >= rec.pch then v_done := v_done + 1; end if;
  end loop;

  select coalesce(sum(po.chapters), 0) into v_exp
  from generate_series(0, v_att - 1) k
  join public.portions po on po.challenge_id = c.id and po.n = ((p.start_portion - 1 + k) % v_n) + 1;

  v_retard := greatest(0, v_exp - v_read);
  v_seuil := case when v_n > 0 then round(2.0 * v_tot / v_n)::int else 0 end;

  if v_n > 0 and v_done >= v_n then v_statut := 'termine';
  elsif v_att = 0 then v_statut := 'pas_commence';
  elsif v_read = 0 then v_statut := 'aucun';
  elsif v_retard = 0 then v_statut := 'a_jour';
  elsif v_retard <= v_seuil then v_statut := 'leger';
  else v_statut := 'retard';
  end if;

  select coalesce(jsonb_agg(((p.start_portion - 1 + k) % v_n) + 1 order by k), '[]'::jsonb)
    into v_ordre from generate_series(0, v_n - 1) k;

  for rec in
    select po.n as pn, po.chapters as pch, po.label as plabel
    from generate_series(0, v_n - 1) k
    join public.portions po on po.challenge_id = c.id and po.n = ((p.start_portion - 1 + k) % v_n) + 1
    order by k
  loop
    v_lu := coalesce((v_lect ->> rec.pn::text)::int, 0);
    if v_lu < rec.pch then
      v_next_n := rec.pn; v_next_deja := v_lu; v_next_label := rec.plabel; v_next_ch := rec.pch;
      exit;
    end if;
  end loop;

  select max(created_at), count(*), count(distinct (created_at at time zone c.timezone)::date)
    into v_last, v_nb, v_jours
    from public.reports where participant_id = p.id;
  select exists (select 1 from public.reports r where r.participant_id = p.id
                 and (r.created_at at time zone c.timezone)::date = (now() at time zone c.timezone)::date)
    into v_today;

  return jsonb_build_object(
    'id', p.id, 'code', p.code, 'name', p.name, 'first_name', split_part(p.name, ' ', 1),
    'phone', p.phone, 'start_portion', p.start_portion, 'created_at', p.created_at,
    'lect', v_lect, 'ordre', v_ordre, 'protected', p.pin_hash is not null,
    'chap_lus', v_read, 'completes', v_done, 'attendues', v_att, 'chap_attendus', v_exp,
    'retard', v_retard, 'statut', v_statut,
    'next', case when v_next_n > 0
                 then jsonb_build_object('n', v_next_n, 'label', v_next_label, 'deja', v_next_deja, 'chapters', v_next_ch)
                 else null end,
    'jour', v_day, 'rapport_aujourdhui', v_today, 'dernier_rapport', v_last,
    -- ajouts v2
    'country', coalesce(p.country, ''), 'city', coalesce(p.city, ''),
    'previous_participations', p.previous_participations,
    'added_by', coalesce(p.added_by, ''), 'nb_rapports', v_nb, 'jours_actifs', v_jours
  );
end $$;

-- ------------------------------------------------------------------
--  4. API PARTICIPANTS (clé « anon »)
-- ------------------------------------------------------------------
-- Infos publiques : identique à la v1 + annonce
create or replace function public.api_info(p_slug text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.challenges;
begin
  if p_slug is null or btrim(p_slug) = '' then
    select * into c from public.challenges where is_active order by start_date desc, created_at desc limit 1;
  else
    select * into c from public.challenges where slug = lower(btrim(p_slug));
  end if;
  if not found then return jsonb_build_object('error', 'Aucun challenge trouvé à cette adresse.'); end if;
  return jsonb_build_object(
    'ok', true, 'id', c.id, 'slug', c.slug, 'name', c.name, 'slogan', c.slogan, 'signature', c.signature,
    'start_date', c.start_date, 'total_days', c.total_days, 'jour', app_private.challenge_day(c),
    'catchup_days', c.catchup_days, 'is_catchup', app_private.challenge_day(c) = any (c.catchup_days),
    'plan_url', c.plan_url, 'country_code', c.country_code,
    'portions', (select coalesce(jsonb_agg(jsonb_build_object('n', po.n, 'label', po.label, 'chapters', po.chapters) order by po.n), '[]'::jsonb)
                  from public.portions po where po.challenge_id = c.id),
    'books', (select coalesce(jsonb_agg(b.name order by b.position), '[]'::jsonb) from public.books b),
    'total_chapters', (select coalesce(sum(po.chapters), 0) from public.portions po where po.challenge_id = c.id),
    'announcement', c.announcement, 'announcement_at', c.announcement_at, 'v2', true
  );
end $$;

-- Texte « L'histoire du challenge » (chargé à part : la photo peut être lourde)
create or replace function public.api_story(p_slug text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.challenges; s public.challenge_story;
begin
  if p_slug is null or btrim(p_slug) = '' then
    select * into c from public.challenges where is_active order by start_date desc, created_at desc limit 1;
  else
    select * into c from public.challenges where slug = lower(btrim(p_slug));
  end if;
  if not found then return jsonb_build_object('ok', true, 'title', '', 'body', '', 'photo', ''); end if;
  select * into s from public.challenge_story where challenge_id = c.id;
  return jsonb_build_object('ok', true, 'title', coalesce(s.title, ''), 'body', coalesce(s.body, ''), 'photo', coalesce(s.photo, ''));
end $$;

-- Inscription avec les champs facultatifs (s'appuie sur api_signup, inchangée)
create or replace function public.api_signup_v2(
  p_slug text, p_name text, p_phone text, p_pin text,
  p_start text default 'at', p_book text default null, p_chap int default 1,
  p_country text default null, p_city text default null, p_previous int default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb; v_id uuid;
begin
  r := public.api_signup(p_slug, p_name, p_phone, p_pin, p_start, p_book, p_chap);
  if r ? 'error' then return r; end if;
  update public.participants set
    country = nullif(left(btrim(coalesce(p_country, '')), 60), ''),
    city = nullif(left(btrim(coalesce(p_city, '')), 80), ''),
    previous_participations = case when p_previous between 0 and 100 then p_previous else null end
  where token = (r ->> 'token')::uuid
  returning id into v_id;
  return jsonb_build_object('ok', true, 'token', r ->> 'token', 'profile', app_private.profile(v_id));
end $$;

-- Le participant complète ou corrige ses champs facultatifs
create or replace function public.api_update_profile(p_token text, p_country text, p_city text, p_previous int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  begin
    update public.participants set
      country = nullif(left(btrim(coalesce(p_country, '')), 60), ''),
      city = nullif(left(btrim(coalesce(p_city, '')), 80), ''),
      previous_participations = case when p_previous between 0 and 100 then p_previous else null end
    where token = p_token::uuid
    returning id into v_id;
  exception when others then return jsonb_build_object('logged_out', true);
  end;
  if v_id is null then return jsonb_build_object('logged_out', true); end if;
  return jsonb_build_object('ok', true, 'profile', app_private.profile(v_id));
end $$;

-- Envoi de rapport avec identifiant unique : un rapport renvoyé après une coupure n'est jamais compté deux fois
create or replace function public.api_report_v2(
  p_token text, p_portion int, p_chapters int,
  p_verse text, p_learned text, p_application text, p_question text default '', p_client_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants; v_max int; v_verse text; v_learned text; v_app text;
begin
  begin
    select * into p from public.participants where token = p_token::uuid;
  exception when others then return jsonb_build_object('logged_out', true);
  end;
  if not found then return jsonb_build_object('logged_out', true); end if;

  if p_client_id is not null and exists (select 1 from public.reports where client_id = p_client_id) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'profile', app_private.profile(p.id));
  end if;

  select chapters into v_max from public.portions where challenge_id = p.challenge_id and n = p_portion;
  if v_max is null then return jsonb_build_object('error', 'Choisissez la portion lue.'); end if;
  if p_chapters is null or p_chapters < 1 or p_chapters > v_max then
    return jsonb_build_object('error', 'Indiquez le nombre de chapitres lus (entre 1 et ' || v_max || ').');
  end if;
  v_verse := left(btrim(coalesce(p_verse, '')), 1500);
  v_learned := left(btrim(coalesce(p_learned, '')), 3000);
  v_app := left(btrim(coalesce(p_application, '')), 3000);
  if v_verse = '' or v_learned = '' or v_app = '' then
    return jsonb_build_object('error', 'Merci de remplir les trois cases du rapport.');
  end if;

  insert into public.reports (challenge_id, participant_id, portion_n, chapters, verse, learned, application, question, client_id)
  values (p.challenge_id, p.id, p_portion, p_chapters, v_verse, v_learned, v_app, left(btrim(coalesce(p_question, '')), 1500), p_client_id)
  on conflict (client_id) do nothing;

  return jsonb_build_object('ok', true, 'profile', app_private.profile(p.id));
end $$;

-- ------------------------------------------------------------------
--  5. API ADMINISTRATION — nouvelles fonctions
-- ------------------------------------------------------------------
-- Ajouter un participant (numéro obligatoire, comme à l'inscription)
-- p : { name, phone, pin?, start?, book?, chap?, country?, city?, previous? }
create or replace function public.admin_add_participant(p_cid uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.challenges; r jsonb; v_id uuid; v_prev int;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select * into c from public.challenges where id = p_cid;
  if not found then return jsonb_build_object('error', 'Session introuvable.'); end if;
  begin v_prev := nullif(p ->> 'previous', '')::int; exception when others then v_prev := null; end;
  r := public.api_signup(c.slug, p ->> 'name', p ->> 'phone', coalesce(p ->> 'pin', ''),
                         coalesce(nullif(p ->> 'start', ''), 'at'), nullif(p ->> 'book', ''),
                         coalesce(nullif(p ->> 'chap', '')::int, 1));
  if r ? 'error' then
    if r ->> 'error' like 'Ce numéro a déjà un compte%' then
      return jsonb_build_object('error', 'Ce numéro est déjà inscrit dans cette session.');
    end if;
    return r;
  end if;
  update public.participants set
    country = nullif(left(btrim(coalesce(p ->> 'country', '')), 60), ''),
    city = nullif(left(btrim(coalesce(p ->> 'city', '')), 80), ''),
    previous_participations = case when v_prev between 0 and 100 then v_prev else null end,
    added_by = app_private.admin_email()
  where token = (r ->> 'token')::uuid
  returning id into v_id;
  perform app_private.log(p_cid, 'participant_ajoute',
    jsonb_build_object('participant', (select name || ' (' || code || ')' from public.participants where id = v_id)));
  return jsonb_build_object('ok', true, 'profile', app_private.profile(v_id));
end $$;

-- Modifier un participant. p : { name, phone, country, city, previous }
create or replace function public.admin_update_participant(p_participant uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare pa public.participants; c public.challenges; v_name text; v_phone text; v_prev int;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select * into pa from public.participants where id = p_participant;
  if not found then return jsonb_build_object('error', 'Participant introuvable.'); end if;
  select * into c from public.challenges where id = pa.challenge_id;
  v_name := left(btrim(coalesce(p ->> 'name', pa.name)), 80);
  if length(v_name) < 3 then return jsonb_build_object('error', 'Le nom doit contenir au moins 3 caractères.'); end if;
  v_phone := app_private.normalize_phone(coalesce(p ->> 'phone', pa.phone), c.country_code);
  if length(v_phone) < 8 then return jsonb_build_object('error', 'Numéro de téléphone invalide.'); end if;
  begin v_prev := nullif(p ->> 'previous', '')::int; exception when others then v_prev := null; end;
  update public.participants set
    name = v_name, phone = v_phone,
    country = nullif(left(btrim(coalesce(p ->> 'country', '')), 60), ''),
    city = nullif(left(btrim(coalesce(p ->> 'city', '')), 80), ''),
    previous_participations = case when v_prev between 0 and 100 then v_prev else null end
  where id = p_participant;
  perform app_private.log(pa.challenge_id, 'participant_modifie', jsonb_build_object('participant', v_name || ' (' || pa.code || ')'));
  return jsonb_build_object('ok', true, 'profile', app_private.profile(p_participant));
exception when unique_violation then
  return jsonb_build_object('error', 'Ce numéro est déjà utilisé par un autre participant.');
end $$;

-- Saisir un rapport pour un participant. Les textes sont facultatifs pour l'admin.
-- p_date (facultatif) : jour de lecture, pour saisir un rapport en retard.
create or replace function public.admin_add_report(
  p_participant uuid, p_portion int, p_chapters int,
  p_verse text default '', p_learned text default '', p_application text default '',
  p_question text default '', p_date date default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare pa public.participants; c public.challenges; v_max int; v_at timestamptz; v_label text;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select * into pa from public.participants where id = p_participant;
  if not found then return jsonb_build_object('error', 'Participant introuvable.'); end if;
  select * into c from public.challenges where id = pa.challenge_id;
  select chapters, label into v_max, v_label from public.portions where challenge_id = pa.challenge_id and n = p_portion;
  if v_max is null then return jsonb_build_object('error', 'Choisissez la portion lue.'); end if;
  if p_chapters is null or p_chapters < 1 or p_chapters > v_max then
    return jsonb_build_object('error', 'Indiquez le nombre de chapitres lus (entre 1 et ' || v_max || ').');
  end if;
  if p_date is not null and p_date > (now() at time zone c.timezone)::date then
    return jsonb_build_object('error', 'La date de lecture ne peut pas être dans le futur.');
  end if;
  v_at := case when p_date is null or p_date = (now() at time zone c.timezone)::date then now()
               else (p_date + time '12:00') at time zone c.timezone end;

  insert into public.reports (challenge_id, participant_id, portion_n, chapters, verse, learned, application, question, created_at, entered_by)
  values (pa.challenge_id, pa.id, p_portion, p_chapters,
          left(btrim(coalesce(p_verse, '')), 1500), left(btrim(coalesce(p_learned, '')), 3000),
          left(btrim(coalesce(p_application, '')), 3000), left(btrim(coalesce(p_question, '')), 1500),
          v_at, app_private.admin_email());
  perform app_private.log(pa.challenge_id, 'rapport_saisi', jsonb_build_object(
    'participant', pa.name || ' (' || pa.code || ')', 'portion', 'P' || p_portion || ' — ' || v_label,
    'chapitres', p_chapters, 'date', coalesce(p_date, (now() at time zone c.timezone)::date)));
  return jsonb_build_object('ok', true, 'profile', app_private.profile(pa.id));
end $$;

-- Supprimer un rapport (correction d'une erreur de saisie)
create or replace function public.admin_delete_report(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select rp.challenge_id, rp.portion_n, rp.chapters, rp.created_at, pa.name, pa.code into r
    from public.reports rp join public.participants pa on pa.id = rp.participant_id where rp.id = p_id;
  if not found then return jsonb_build_object('error', 'Rapport introuvable.'); end if;
  delete from public.reports where id = p_id;
  perform app_private.log(r.challenge_id, 'rapport_supprime', jsonb_build_object(
    'participant', r.name || ' (' || r.code || ')', 'portion', 'P' || r.portion_n, 'chapitres', r.chapters, 'du', r.created_at));
  return jsonb_build_object('ok', true);
end $$;

-- Tous les rapports d'un participant (fiche de suivi)
create or replace function public.admin_participant_reports(p_participant uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  return jsonb_build_object('ok', true, 'list', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'created_at', r.created_at, 'portion_n', r.portion_n, 'label', po.label, 'chapters', r.chapters,
      'verse', r.verse, 'learned', r.learned, 'application', r.application, 'question', r.question,
      'entered_by', coalesce(r.entered_by, '')) order by r.created_at desc), '[]'::jsonb)
    from public.reports r
    left join public.portions po on po.challenge_id = r.challenge_id and po.n = r.portion_n
    where r.participant_id = p_participant));
end $$;

-- Rapports d'une session sur une période (export)
create or replace function public.admin_reports(p_cid uuid, p_from date default null, p_to date default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.challenges;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select * into c from public.challenges where id = p_cid;
  if not found then return jsonb_build_object('error', 'Session introuvable.'); end if;
  return jsonb_build_object('ok', true, 'list', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'created_at', r.created_at, 'code', pa.code, 'name', pa.name, 'phone', pa.phone,
      'country', coalesce(pa.country, ''), 'city', coalesce(pa.city, ''),
      'portion_n', r.portion_n, 'label', po.label, 'chapters', r.chapters,
      'verse', r.verse, 'learned', r.learned, 'application', r.application, 'question', r.question,
      'entered_by', coalesce(r.entered_by, '')) order by r.created_at desc), '[]'::jsonb)
    from public.reports r
    join public.participants pa on pa.id = r.participant_id
    left join public.portions po on po.challenge_id = r.challenge_id and po.n = r.portion_n
    where r.challenge_id = p_cid
      and (p_from is null or (r.created_at at time zone c.timezone)::date >= p_from)
      and (p_to is null or (r.created_at at time zone c.timezone)::date <= p_to)));
end $$;

-- Statistiques : rapports, chapitres et inscriptions par jour
create or replace function public.admin_stats(p_cid uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.challenges;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select * into c from public.challenges where id = p_cid;
  if not found then return jsonb_build_object('error', 'Session introuvable.'); end if;
  return jsonb_build_object('ok', true,
    'reports_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'reports', n, 'chapters', ch, 'people', pe) order by d), '[]'::jsonb)
      from (select (r.created_at at time zone c.timezone)::date as d, count(*) as n, sum(r.chapters) as ch,
                   count(distinct r.participant_id) as pe
            from public.reports r where r.challenge_id = c.id group by 1) x),
    'signups_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]'::jsonb)
      from (select (pa.created_at at time zone c.timezone)::date as d, count(*) as n
            from public.participants pa where pa.challenge_id = c.id group by 1) y));
end $$;

-- Historique des actions
create or replace function public.admin_logs(p_cid uuid default null, p_limit int default 300) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  return jsonb_build_object('ok', true, 'list', (
    select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'created_at', l.created_at, 'admin_email', l.admin_email,
      'action', l.action, 'details', l.details) order by l.created_at desc), '[]'::jsonb)
    from (select * from public.admin_logs
          where p_cid is null or challenge_id = p_cid or challenge_id is null
          order by created_at desc limit least(greatest(coalesce(p_limit, 300), 1), 2000)) l));
end $$;

-- Page publique : lire / enregistrer le texte et la photo
create or replace function public.admin_story(p_cid uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.challenge_story;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select * into s from public.challenge_story where challenge_id = p_cid;
  return jsonb_build_object('ok', true, 'title', coalesce(s.title, ''), 'body', coalesce(s.body, ''),
    'photo', coalesce(s.photo, ''), 'updated_at', s.updated_at, 'updated_by', s.updated_by);
end $$;

-- p : { title, body, photo }  (photo = data:image/... ou '' pour la retirer)
create or replace function public.admin_save_story(p_cid uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_photo text; v_old text;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  v_photo := coalesce(p ->> 'photo', '');
  if v_photo <> '' and v_photo !~ '^data:image/(jpeg|png|webp);base64,' then
    return jsonb_build_object('error', 'Format de photo non reconnu.');
  end if;
  if length(v_photo) > 1500000 then return jsonb_build_object('error', 'Photo trop lourde.'); end if;
  select photo into v_old from public.challenge_story where challenge_id = p_cid;
  insert into public.challenge_story (challenge_id, title, body, photo, updated_at, updated_by)
  values (p_cid, left(coalesce(p ->> 'title', ''), 120), left(coalesce(p ->> 'body', ''), 8000), v_photo, now(), app_private.admin_email())
  on conflict (challenge_id) do update set title = excluded.title, body = excluded.body, photo = excluded.photo,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  perform app_private.log(p_cid, 'page_publique_modifiee', jsonb_build_object(
    'photo', case when v_photo = coalesce(v_old, '') then 'inchangée' when v_photo = '' then 'retirée' else 'nouvelle photo' end));
  return jsonb_build_object('ok', true);
end $$;

-- Annonce affichée dans l'application des participants ('' pour la retirer)
create or replace function public.admin_save_announcement(p_cid uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v text := left(btrim(coalesce(p_text, '')), 1000);
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  update public.challenges set announcement = v, announcement_at = case when v = '' then null else now() end where id = p_cid;
  perform app_private.log(p_cid, case when v = '' then 'annonce_retiree' else 'annonce_publiee' end, jsonb_build_object('texte', v));
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------
--  6. FONCTIONS ADMIN EXISTANTES : même comportement + historique
-- ------------------------------------------------------------------
create or replace function public.admin_mark_question(p_id bigint, p_answered boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  update public.reports set answered = p_answered where id = p_id
    returning challenge_id, participant_id into r;
  if r.challenge_id is not null then
    perform app_private.log(r.challenge_id, case when p_answered then 'question_traitee' else 'question_rouverte' end,
      jsonb_build_object('participant', (select name || ' (' || code || ')' from public.participants where id = r.participant_id)));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_reset_pin(p_participant uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare pa public.participants;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  update public.participants set pin_hash = null, failed_attempts = 0, locked_until = null where id = p_participant
    returning * into pa;
  if pa.id is not null then
    perform app_private.log(pa.challenge_id, 'code_secret_efface', jsonb_build_object('participant', pa.name || ' (' || pa.code || ')'));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_delete_participant(p_participant uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare pa public.participants; v_nb int;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select * into pa from public.participants where id = p_participant;
  if found then
    select count(*) into v_nb from public.reports where participant_id = pa.id;
    delete from public.participants where id = p_participant;
    perform app_private.log(pa.challenge_id, 'participant_supprime',
      jsonb_build_object('participant', pa.name || ' (' || pa.code || ')', 'telephone', pa.phone, 'rapports', v_nb));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_save_challenge(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_catch int[]; v_slug text; v_new boolean;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  v_slug := lower(btrim(coalesce(p ->> 'slug', '')));
  if v_slug !~ '^[a-z0-9-]+$' or v_slug in ('admin', 'api') then
    return jsonb_build_object('error', 'Adresse courte invalide (lettres minuscules, chiffres et tirets seulement).');
  end if;
  if coalesce(btrim(p ->> 'name'), '') = '' then return jsonb_build_object('error', 'Le nom est obligatoire.'); end if;
  begin
    select coalesce(array_agg(x::int), '{}') into v_catch from jsonb_array_elements_text(coalesce(p -> 'catchup_days', '[]'::jsonb)) x;
    perform (p ->> 'start_date')::date;
  exception when others then
    return jsonb_build_object('error', 'Date ou jours de rattrapage invalides.');
  end;
  v_new := (p ->> 'id') is null or (p ->> 'id') = '';
  if not v_new then
    v_id := (p ->> 'id')::uuid;
    update public.challenges set
      slug = v_slug, name = btrim(p ->> 'name'), slogan = coalesce(p ->> 'slogan', ''), signature = coalesce(p ->> 'signature', ''),
      start_date = (p ->> 'start_date')::date, total_days = coalesce((p ->> 'total_days')::int, 40), catchup_days = v_catch,
      country_code = coalesce(nullif(p ->> 'country_code', ''), '237'), timezone = coalesce(nullif(p ->> 'timezone', ''), 'Africa/Douala'),
      platform_url = coalesce(p ->> 'platform_url', ''), plan_url = coalesce(p ->> 'plan_url', ''),
      admin_emails = coalesce(p ->> 'admin_emails', ''), is_active = coalesce((p ->> 'is_active')::boolean, true)
    where id = v_id;
  else
    insert into public.challenges (slug, name, slogan, signature, start_date, total_days, catchup_days, country_code, timezone,
                                   platform_url, plan_url, admin_emails, is_active)
    values (v_slug, btrim(p ->> 'name'), coalesce(p ->> 'slogan', ''), coalesce(p ->> 'signature', ''),
            (p ->> 'start_date')::date, coalesce((p ->> 'total_days')::int, 40), v_catch,
            coalesce(nullif(p ->> 'country_code', ''), '237'), coalesce(nullif(p ->> 'timezone', ''), 'Africa/Douala'),
            coalesce(p ->> 'platform_url', ''), coalesce(p ->> 'plan_url', ''), coalesce(p ->> 'admin_emails', ''),
            coalesce((p ->> 'is_active')::boolean, true))
    returning id into v_id;
  end if;
  perform app_private.log(v_id, case when v_new then 'session_creee' else 'session_modifiee' end,
    jsonb_build_object('session', btrim(p ->> 'name')));
  return jsonb_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  return jsonb_build_object('error', 'Cette adresse courte est déjà utilisée.');
end $$;

create or replace function public.admin_clone_challenge(p_from uuid, p_slug text, p_name text, p_start date) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare src public.challenges; v_id uuid; v_slug text;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select * into src from public.challenges where id = p_from;
  if not found then return jsonb_build_object('error', 'Session source introuvable.'); end if;
  v_slug := lower(btrim(coalesce(p_slug, '')));
  if v_slug !~ '^[a-z0-9-]+$' or v_slug in ('admin', 'api') then
    return jsonb_build_object('error', 'Adresse courte invalide (lettres minuscules, chiffres et tirets seulement).');
  end if;
  insert into public.challenges (slug, name, slogan, signature, start_date, total_days, catchup_days, country_code, timezone,
                                 platform_url, plan_url, admin_emails, is_active)
  values (v_slug, coalesce(nullif(btrim(p_name), ''), src.name), src.slogan, src.signature, p_start, src.total_days, src.catchup_days,
          src.country_code, src.timezone, src.platform_url, src.plan_url, src.admin_emails, true)
  returning id into v_id;
  insert into public.portions (challenge_id, n, testament, label, chapters, book, start_chapter)
  select v_id, n, testament, label, chapters, book, start_chapter from public.portions where challenge_id = p_from;
  insert into public.challenge_story (challenge_id, title, body, photo, updated_by)
  select v_id, title, body, photo, app_private.admin_email() from public.challenge_story where challenge_id = p_from
  on conflict (challenge_id) do nothing;
  perform app_private.log(v_id, 'session_copiee', jsonb_build_object('depuis', src.name, 'session', coalesce(nullif(btrim(p_name), ''), src.name)));
  return jsonb_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  return jsonb_build_object('error', 'Cette adresse courte est déjà utilisée.');
end $$;

-- ------------------------------------------------------------------
--  7. DROITS D'EXÉCUTION (même règle que schema.sql)
-- ------------------------------------------------------------------
revoke all on schema app_private from public, anon, authenticated;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'admin\_%' or p.proname like 'cron\_%' or p.proname like 'api\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname like 'api\_%' then
      execute format('grant execute on function %s to anon, authenticated', r.sig);
    elsif r.proname like 'admin\_%' then
      execute format('grant execute on function %s to authenticated', r.sig);
    else
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------
--  8. NOUVEAUX ADMINISTRATEURS
--  Créez d'abord leur compte : Authentication > Users > Add user > Create new user
--  (e-mail + mot de passe, cochez « Auto Confirm User »), puis relancez ce bloc si besoin.
-- ------------------------------------------------------------------
insert into public.admins (user_id, email)
select id, email from auth.users
where lower(email) in ('samnicksehpierrefranckie@gmail.com', 'bahajacques1997@gmail.com')
on conflict (user_id) do nothing;

-- Vérification : la liste des administrateurs enregistrés
select email from public.admins order by email;
