-- ==================================================================
--  CHALLENGE BIBLE — schéma Supabase (à exécuter une seule fois)
--  Supabase > SQL Editor > New query > coller ce fichier > Run
-- ==================================================================

create extension if not exists pgcrypto with schema extensions;
create schema if not exists app_private;

-- ------------------------------------------------------------------
--  TABLES
-- ------------------------------------------------------------------
create table if not exists public.books (
  position int primary key,
  name text not null unique,
  chapters int not null
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$' and slug <> 'admin' and slug <> 'api'),
  name text not null,
  slogan text not null default '',
  signature text not null default '',
  start_date date not null,
  total_days int not null default 40 check (total_days between 1 and 400),
  catchup_days int[] not null default '{}',
  country_code text not null default '237',
  timezone text not null default 'Africa/Douala',
  platform_url text not null default '',
  plan_url text not null default '',
  admin_emails text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.portions (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  n int not null,
  testament text not null default 'AT',
  label text not null,
  chapters int not null check (chapters > 0),
  book text,
  start_chapter int,
  primary key (challenge_id, n)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  code text not null,
  name text not null,
  phone text not null,
  start_portion int not null default 1,
  pin_hash text,
  token uuid not null unique default gen_random_uuid(),
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  unique (challenge_id, phone),
  unique (challenge_id, code)
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  portion_n int not null,
  chapters int not null check (chapters > 0),
  verse text not null,
  learned text not null,
  application text not null,
  question text not null default '',
  answered boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists reports_participant_idx on public.reports (participant_id);
create index if not exists reports_challenge_idx on public.reports (challenge_id, created_at);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text
);

-- Sécurité : aucune lecture directe des tables depuis le navigateur.
-- Tout passe par les fonctions ci-dessous (security definer).
alter table public.books enable row level security;
alter table public.challenges enable row level security;
alter table public.portions enable row level security;
alter table public.participants enable row level security;
alter table public.reports enable row level security;
alter table public.admins enable row level security;
revoke all on public.books, public.challenges, public.portions, public.participants, public.reports, public.admins
  from anon, authenticated;

-- ------------------------------------------------------------------
--  OUTILS PRIVÉS (schéma app_private : non exposé par l'API)
-- ------------------------------------------------------------------
create or replace function app_private.normalize_phone(t text, ind text) returns text
language plpgsql immutable as $$
declare
  s text := btrim(coalesce(t, ''));
  plus boolean := left(btrim(coalesce(t, '')), 1) = '+';
  i text := coalesce(ind, '');
begin
  s := regexp_replace(s, '\D', '', 'g');
  if s = '' then return ''; end if;
  if left(s, 2) = '00' then return substr(s, 3); end if;
  if plus then return s; end if;
  if i = '225' and length(s) = 10 then return i || s; end if;
  if i <> '' and left(s, 1) = '0' then return i || substr(s, 2); end if;
  if i <> '' and left(s, length(i)) <> i and length(s) <= 10 then return i || s; end if;
  return s;
end $$;

create or replace function app_private.challenge_day(c public.challenges) returns int
language sql stable as $$
  select ((now() at time zone c.timezone)::date - c.start_date) + 1
$$;

create or replace function app_private.expected_portions(v_day int, v_total int, v_catch int[], v_n int) returns int
language sql immutable as $$
  select case when v_day < 1 then 0
    else greatest(0, least(v_n, least(v_day, v_total)
         - (select count(*)::int from unnest(v_catch) x where x <= least(v_day, v_total))))
  end
$$;

create or replace function app_private.global_pos(p_book text, p_chap int) returns int
language sql stable as $$
  select coalesce((
    select coalesce((select sum(b2.chapters)::int from public.books b2 where b2.position < b.position), 0)
           + least(greatest(coalesce(p_chap, 1), 1), b.chapters)
    from public.books b where b.name = p_book
  ), 1)
$$;

create or replace function app_private.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- Profil complet d'un participant (progression, retard, statut, prochaine portion…)
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
  v_last timestamptz; v_today boolean;
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

  select max(created_at) into v_last from public.reports where participant_id = p.id;
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
    'jour', v_day, 'rapport_aujourdhui', v_today, 'dernier_rapport', v_last
  );
end $$;

-- Résumé d'une session (utilisé par l'administration et par les e-mails automatiques)
create or replace function app_private.challenge_summary(p_cid uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.challenges; v_today date;
begin
  select * into c from public.challenges where id = p_cid;
  if not found then return null; end if;
  v_today := (now() at time zone c.timezone)::date;
  return jsonb_build_object(
    'challenge', to_jsonb(c),
    'jour', app_private.challenge_day(c),
    'n_portions', (select count(*) from public.portions where challenge_id = c.id),
    'total_chapters', (select coalesce(sum(chapters), 0) from public.portions where challenge_id = c.id),
    'reports_total', (select count(*) from public.reports where challenge_id = c.id),
    'reports_today', (select count(*) from public.reports r where r.challenge_id = c.id
                       and (r.created_at at time zone c.timezone)::date = v_today),
    'questions_pending', (select count(*) from public.reports where challenge_id = c.id
                           and btrim(question) <> '' and not answered),
    'participants', (select coalesce(jsonb_agg(app_private.profile(pa.id) order by pa.code), '[]'::jsonb)
                      from public.participants pa where pa.challenge_id = c.id)
  );
end $$;

-- ------------------------------------------------------------------
--  API PARTICIPANTS (appelée depuis le navigateur avec la clé « anon »)
-- ------------------------------------------------------------------
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
    'total_chapters', (select coalesce(sum(po.chapters), 0) from public.portions po where po.challenge_id = c.id)
  );
end $$;

create or replace function public.api_signup(
  p_slug text, p_name text, p_phone text, p_pin text,
  p_start text default 'at', p_book text default null, p_chap int default 1
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  c public.challenges; v_name text; v_pin text; v_phone text;
  v_start int := 1; v_pos int; v_num int; v_code text; v_id uuid; v_token uuid;
begin
  select * into c from public.challenges where slug = lower(btrim(coalesce(p_slug, '')));
  if not found then return jsonb_build_object('error', 'Challenge introuvable.'); end if;

  v_name := left(btrim(coalesce(p_name, '')), 80);
  v_pin := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  if length(v_name) < 3 then return jsonb_build_object('error', 'Merci d''indiquer votre nom et prénom.'); end if;
  if v_pin <> '' and length(v_pin) <> 4 then
    return jsonb_build_object('error', 'Le code secret doit contenir 4 chiffres (ou laissez la case vide).');
  end if;
  v_phone := app_private.normalize_phone(p_phone, c.country_code);
  if length(v_phone) < 8 then
    return jsonb_build_object('error', 'Numéro de téléphone invalide. Exemple : +237 6 99 12 34 56');
  end if;

  if p_start = 'nt' then
    select coalesce(min(n), 1) into v_start from public.portions where challenge_id = c.id and testament = 'NT';
  elsif p_start = 'ici' and p_book is not null and btrim(p_book) <> '' then
    v_pos := app_private.global_pos(p_book, p_chap);
    select coalesce(max(n), 1) into v_start from public.portions
      where challenge_id = c.id and book is not null
        and app_private.global_pos(book, start_chapter) <= v_pos;
  end if;

  perform pg_advisory_xact_lock(hashtext(c.id::text));
  if exists (select 1 from public.participants where challenge_id = c.id and phone = v_phone) then
    return jsonb_build_object('error', 'Ce numéro a déjà un compte. Utilisez « J''ai déjà un compte » pour vous connecter.');
  end if;
  select coalesce(max(substr(code, 3)::int), 0) + 1 into v_num from public.participants where challenge_id = c.id;
  v_code := 'CB' || lpad(v_num::text, 4, '0');

  insert into public.participants (challenge_id, code, name, phone, start_portion, pin_hash)
  values (c.id, v_code, v_name, v_phone, v_start,
          case when v_pin <> '' then extensions.crypt(v_pin, extensions.gen_salt('bf')) else null end)
  returning id, token into v_id, v_token;

  return jsonb_build_object('ok', true, 'token', v_token, 'profile', app_private.profile(v_id));
end $$;

create or replace function public.api_login(p_slug text, p_phone text, p_pin text default '') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.challenges; p public.participants; v_phone text; v_pin text;
begin
  select * into c from public.challenges where slug = lower(btrim(coalesce(p_slug, '')));
  if not found then return jsonb_build_object('error', 'Challenge introuvable.'); end if;
  v_phone := app_private.normalize_phone(p_phone, c.country_code);
  v_pin := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');

  select * into p from public.participants where challenge_id = c.id and phone = v_phone;
  if not found then
    return jsonb_build_object('error', 'Aucun compte avec ce numéro. Vérifiez le numéro ou créez votre compte.');
  end if;
  if p.locked_until is not null and p.locked_until > now() then
    return jsonb_build_object('error', 'Trop d''essais. Réessayez dans quelques minutes.', 'need_code', true);
  end if;

  if p.pin_hash is not null then
    if v_pin = '' then
      return jsonb_build_object('error', 'Ce compte est protégé par un code secret : entrez votre code à 4 chiffres.', 'need_code', true);
    end if;
    if p.pin_hash <> extensions.crypt(v_pin, p.pin_hash) then
      update public.participants
        set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
            locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
        where id = p.id;
      return jsonb_build_object('error', 'Code secret incorrect.', 'need_code', true);
    end if;
    update public.participants set failed_attempts = 0, locked_until = null where id = p.id;
  elsif length(v_pin) = 4 then
    update public.participants set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf')) where id = p.id;
  end if;

  return jsonb_build_object('ok', true, 'token', p.token, 'profile', app_private.profile(p.id));
end $$;

create or replace function public.api_profile(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  begin
    select id into v_id from public.participants where token = p_token::uuid;
  exception when others then v_id := null;
  end;
  if v_id is null then return jsonb_build_object('logged_out', true); end if;
  return jsonb_build_object('ok', true, 'profile', app_private.profile(v_id));
end $$;

create or replace function public.api_report(
  p_token text, p_portion int, p_chapters int,
  p_verse text, p_learned text, p_application text, p_question text default ''
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants; v_max int; v_verse text; v_learned text; v_app text;
begin
  begin
    select * into p from public.participants where token = p_token::uuid;
  exception when others then return jsonb_build_object('logged_out', true);
  end;
  if not found then return jsonb_build_object('logged_out', true); end if;

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

  insert into public.reports (challenge_id, participant_id, portion_n, chapters, verse, learned, application, question)
  values (p.challenge_id, p.id, p_portion, p_chapters, v_verse, v_learned, v_app, left(btrim(coalesce(p_question, '')), 1500));

  return jsonb_build_object('ok', true, 'profile', app_private.profile(p.id));
end $$;

create or replace function public.api_my_reports(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants;
begin
  begin
    select * into p from public.participants where token = p_token::uuid;
  exception when others then return jsonb_build_object('logged_out', true);
  end;
  if not found then return jsonb_build_object('logged_out', true); end if;
  return jsonb_build_object('ok', true, 'list', (
    select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb) from (
      select jsonb_build_object('created_at', r.created_at, 'portion_n', r.portion_n,
             'label', po.label, 'chapters', r.chapters, 'verse', r.verse) as x
      from public.reports r
      left join public.portions po on po.challenge_id = r.challenge_id and po.n = r.portion_n
      where r.participant_id = p.id
      order by r.created_at desc limit 60
    ) s));
end $$;

-- ------------------------------------------------------------------
--  API ADMINISTRATION (réservée aux comptes listés dans la table admins)
-- ------------------------------------------------------------------
create or replace function public.admin_me() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  return jsonb_build_object('is_admin', app_private.is_admin());
end $$;

create or replace function public.admin_challenges() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  return jsonb_build_object('ok', true, 'list', (
    select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'participants', (select count(*) from public.participants pa where pa.challenge_id = c.id),
      'jour', app_private.challenge_day(c)) order by c.start_date desc), '[]'::jsonb)
    from public.challenges c));
end $$;

create or replace function public.admin_summary(p_cid uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  return jsonb_build_object('ok', true, 'summary', app_private.challenge_summary(p_cid));
end $$;

create or replace function public.admin_questions(p_cid uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  return jsonb_build_object('ok', true, 'list', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'created_at', r.created_at, 'name', pa.name, 'phone', pa.phone, 'code', pa.code,
      'label', po.label, 'portion_n', r.portion_n, 'question', r.question, 'answered', r.answered)
      order by r.answered, r.created_at desc), '[]'::jsonb)
    from public.reports r
    join public.participants pa on pa.id = r.participant_id
    left join public.portions po on po.challenge_id = r.challenge_id and po.n = r.portion_n
    where r.challenge_id = p_cid and btrim(r.question) <> ''));
end $$;

create or replace function public.admin_mark_question(p_id bigint, p_answered boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  update public.reports set answered = p_answered where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_reset_pin(p_participant uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  update public.participants set pin_hash = null, failed_attempts = 0, locked_until = null where id = p_participant;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_delete_participant(p_participant uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  delete from public.participants where id = p_participant;
  return jsonb_build_object('ok', true);
end $$;

-- Crée ou modifie une session. p : { id?, slug, name, slogan, signature, start_date, total_days,
--   catchup_days: [..], country_code, timezone, platform_url, plan_url, admin_emails, is_active }
create or replace function public.admin_save_challenge(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_catch int[]; v_slug text;
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
  if (p ->> 'id') is not null and (p ->> 'id') <> '' then
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
  return jsonb_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  return jsonb_build_object('error', 'Cette adresse courte est déjà utilisée.');
end $$;

-- Copie une session existante (réglages + plan de lecture) avec une nouvelle date de début.
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
  return jsonb_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  return jsonb_build_object('error', 'Cette adresse courte est déjà utilisée.');
end $$;

-- ------------------------------------------------------------------
--  FONCTION RÉSERVÉE AU ROBOT D'E-MAILS (clé « service_role » côté serveur)
-- ------------------------------------------------------------------
create or replace function public.cron_summaries() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  return (
    select coalesce(jsonb_agg(app_private.challenge_summary(c.id)), '[]'::jsonb)
    from public.challenges c
    where c.is_active
      and app_private.challenge_day(c) between -6 and c.total_days + 3
  );
end $$;

-- ------------------------------------------------------------------
--  DROITS D'EXÉCUTION
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
