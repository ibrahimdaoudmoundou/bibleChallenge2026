-- v2.6 : départ au chapitre exact.
-- Un participant peut commencer au milieu d'une portion (ex. Psaumes 1, dans la portion 17 « Job 15-42 ; Psaumes 1-7 »).
-- Pour lui, cette portion est coupée en deux : le début de son parcours (Psaumes 1-7), et le reste (Job 15-42)
-- placé à la fin de son parcours (ajouté à sa dernière portion). Total inchangé : 1 189 chapitres.
--
-- ADDITIF, SANS PERTE :
--  * une seule colonne ajoutée (participants.start_offset, 0 par défaut = comportement actuel inchangé) ;
--  * aucun rapport, aucune portion, aucun participant n'est modifié ou supprimé par ce script ;
--  * les rapports restent rangés par numéro de portion, comme avant.
-- Seuls les administrateurs peuvent changer le point de départ d'un participant déjà inscrit (admin_set_start).

alter table public.participants add column if not exists start_offset int not null default 0;

-- Texte lisible d'un intervalle de positions globales (ex. 479..485 -> « Psaumes 1-7 »)
create or replace function app_private.range_label(p_from int, p_to int) returns text
language sql stable set search_path = public as $$
  select string_agg(
           case when b.chapters = 1 then b.name
                when x.lo = x.hi then b.name || ' ' || x.lo
                else b.name || ' ' || x.lo || '-' || x.hi end,
           ' ; ' order by b.position)
  from (select bb.*, coalesce(sum(bb.chapters) over (order by bb.position rows between unbounded preceding and 1 preceding), 0)::int as cb
        from public.books bb) b
  cross join lateral (select greatest(p_from - b.cb, 1) as lo, least(p_to - b.cb, b.chapters) as hi) x
  where b.cb + b.chapters >= p_from and b.cb + 1 <= p_to
$$;

-- Point de départ d'un participant : portion, décalage, libellés du début et du reste
create or replace function app_private.depart(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pa public.participants; po public.portions; g0 int; o int;
begin
  select * into pa from public.participants where id = p_id;
  if not found then return null; end if;
  select * into po from public.portions where challenge_id = pa.challenge_id and n = pa.start_portion;
  if not found then return null; end if;
  g0 := app_private.global_pos(po.book, po.start_chapter);
  o := least(greatest(coalesce(pa.start_offset, 0), 0), po.chapters - 1);
  return jsonb_build_object(
    'n', po.n, 'offset', o,
    'label', app_private.range_label(g0 + o, g0 + o),
    'head', po.chapters - o,
    'head_label', case when o > 0 then app_private.range_label(g0 + o, g0 + po.chapters - 1) else po.label end,
    'tail', o,
    'tail_label', case when o > 0 then app_private.range_label(g0, g0 + o - 1) else null end
  );
end $$;

-- Profil : identique à la v2.4, en tenant compte du départ exact
create or replace function app_private.profile(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  p public.participants;
  c public.challenges;
  v_n int; v_tot int; v_day int; v_att int;
  v_read int := 0; v_done int := 0; v_exp int := 0; v_retard int; v_seuil int;
  v_att_due int; v_exp_due int := 0;
  v_lect jsonb := '{}'::jsonb;
  v_ordre jsonb;
  v_statut text;
  v_next_n int := 0; v_next_deja int := 0; v_next_label text; v_next_ch int := 0;
  v_last timestamptz; v_today boolean; v_nb int; v_jours int;
  rec record; v_lu int;
  v_dep jsonb; v_off int := 0; v_head int; v_lu_s int;
begin
  select * into p from public.participants where id = p_id;
  if not found then return null; end if;
  select * into c from public.challenges where id = p.challenge_id;
  select count(*), coalesce(sum(chapters), 0) into v_n, v_tot from public.portions where challenge_id = c.id;
  v_day := app_private.challenge_day(c);
  v_att := app_private.expected_portions(v_day, c.total_days, c.catchup_days, v_n);          -- objectif de fin de journée
  v_att_due := app_private.expected_portions(v_day - 1, c.total_days, c.catchup_days, v_n);  -- dû à la fin d'hier

  v_dep := app_private.depart(p.id);
  v_off := coalesce((v_dep ->> 'offset')::int, 0);
  v_head := coalesce((v_dep ->> 'head')::int, 0);

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

  select coalesce(sum(po.chapters), 0) into v_exp_due
  from generate_series(0, v_att_due - 1) k
  join public.portions po on po.challenge_id = c.id and po.n = ((p.start_portion - 1 + k) % v_n) + 1;

  -- Départ au milieu d'une portion : le reste de la première portion est attendu avec la dernière.
  if v_off > 0 then
    v_exp := v_exp - (case when v_att >= 1 then v_off else 0 end) + (case when v_att >= v_n then v_off else 0 end);
    v_exp_due := v_exp_due - (case when v_att_due >= 1 then v_off else 0 end) + (case when v_att_due >= v_n then v_off else 0 end);
  end if;

  -- Le retard ne compte que les journées terminées : la portion du jour n'est jamais « en retard » le jour même.
  v_retard := greatest(0, v_exp_due - v_read);
  v_seuil := case when v_n > 0 then round(2.0 * v_tot / v_n)::int else 0 end;

  if v_n > 0 and v_done >= v_n then v_statut := 'termine';
  elsif v_day < 1 or v_att = 0 then v_statut := 'pas_commence';
  elsif v_att_due = 0 then v_statut := case when v_read > 0 then 'a_jour' else 'aucun' end;
  elsif v_read = 0 then v_statut := 'aucun';
  elsif v_retard = 0 then v_statut := 'a_jour';
  elsif v_retard <= v_seuil then v_statut := 'leger';
  else v_statut := 'retard';
  end if;

  select coalesce(jsonb_agg(((p.start_portion - 1 + k) % v_n) + 1 order by k), '[]'::jsonb)
    into v_ordre from generate_series(0, v_n - 1) k;

  -- Prochaine lecture
  v_lu_s := coalesce((v_lect ->> p.start_portion::text)::int, 0);
  if v_off > 0 and v_lu_s < v_head then
    v_next_n := p.start_portion; v_next_deja := v_lu_s; v_next_label := v_dep ->> 'head_label'; v_next_ch := v_head;
  else
    for rec in
      select po.n as pn, po.chapters as pch, po.label as plabel
      from generate_series(case when v_off > 0 then 1 else 0 end, v_n - 1) k
      join public.portions po on po.challenge_id = c.id and po.n = ((p.start_portion - 1 + k) % v_n) + 1
      order by k
    loop
      v_lu := coalesce((v_lect ->> rec.pn::text)::int, 0);
      if v_lu < rec.pch then
        v_next_n := rec.pn; v_next_deja := v_lu; v_next_label := rec.plabel; v_next_ch := rec.pch;
        exit;
      end if;
    end loop;
    if v_next_n = 0 and v_off > 0 and v_lu_s < v_head + v_off then
      v_next_n := p.start_portion; v_next_deja := v_lu_s - v_head; v_next_label := v_dep ->> 'tail_label'; v_next_ch := v_off;
    end if;
  end if;

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
    'country', coalesce(p.country, ''), 'city', coalesce(p.city, ''),
    'previous_participations', p.previous_participations,
    'added_by', coalesce(p.added_by, ''), 'nb_rapports', v_nb, 'jours_actifs', v_jours,
    -- v2.6
    'depart', v_dep
  );
end $$;

-- Rapport simple : même répartition, avec la première portion coupée (début au départ, reste à la fin)
create or replace function app_private.report_spread(
  p_participant uuid, p_chapters int, p_date date,
  p_verse text, p_learned text, p_application text, p_question text,
  p_client_id uuid, p_entered_by text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  pa public.participants; c public.challenges;
  v_today date; v_day date; v_at timestamptz;
  v_n int; v_left int; v_reste_total int; v_take int; v_first boolean := true;
  v_parts jsonb := '[]'::jsonb;
  v_dep jsonb; v_off int; v_head int;
  k int; v_pn int; v_label text; v_cap int; v_lu int; v_lu_p int; v_pch int;
begin
  select * into pa from public.participants where id = p_participant;
  if not found then return jsonb_build_object('error', 'Participant introuvable.'); end if;
  select * into c from public.challenges where id = pa.challenge_id;
  v_today := (now() at time zone c.timezone)::date;
  v_day := coalesce(p_date, v_today);

  if p_chapters is null or p_chapters < 1 then
    return jsonb_build_object('error', 'Indiquez le nombre de chapitres lus.');
  end if;
  if v_day > v_today then
    return jsonb_build_object('error', 'Le jour choisi ne peut pas être dans le futur.');
  end if;
  if v_day < c.start_date then
    return jsonb_build_object('error', 'Le challenge a commencé le ' || to_char(c.start_date, 'DD/MM/YYYY') || '.');
  end if;

  select count(*) into v_n from public.portions where challenge_id = c.id;
  if v_n = 0 then return jsonb_build_object('error', 'Plan de lecture introuvable.'); end if;

  select coalesce(sum(greatest(0, po.chapters - least(po.chapters, coalesce(r.lu, 0)))), 0) into v_reste_total
  from public.portions po
  left join (select portion_n, sum(chapters) lu from public.reports where participant_id = pa.id group by portion_n) r
         on r.portion_n = po.n
  where po.challenge_id = c.id;
  if v_reste_total = 0 then
    return jsonb_build_object('error', 'Toute la Bible est déjà lue : bravo ! Utilisez « Choisir la portion moi-même » pour une relecture.');
  end if;
  if p_chapters > v_reste_total then
    return jsonb_build_object('error', 'Il ne reste que ' || v_reste_total || ' chapitre(s) à lire dans le plan.');
  end if;

  v_dep := app_private.depart(pa.id);
  v_off := coalesce((v_dep ->> 'offset')::int, 0);
  v_head := coalesce((v_dep ->> 'head')::int, 0);

  v_at := case when v_day = v_today then now() else (v_day + time '20:00') at time zone c.timezone end;
  v_left := p_chapters;

  -- segments : k = 0 .. v_n-1 (portions dans l'ordre), puis k = v_n = reste de la première portion (si départ en cours de portion)
  for k in 0 .. (case when v_off > 0 then v_n else v_n - 1 end) loop
    exit when v_left <= 0;
    v_pn := ((pa.start_portion - 1 + (k % v_n)) % v_n) + 1;
    select po.chapters, po.label into v_pch, v_label from public.portions po where po.challenge_id = c.id and po.n = v_pn;
    select least(v_pch, coalesce(sum(x.chapters), 0))::int into v_lu_p
      from public.reports x where x.participant_id = pa.id and x.portion_n = v_pn;
    if v_off > 0 and k = 0 then
      v_cap := v_head; v_lu := least(v_lu_p, v_head); v_label := v_dep ->> 'head_label';
    elsif v_off > 0 and k = v_n then
      v_cap := v_off; v_lu := greatest(0, v_lu_p - v_head); v_label := v_dep ->> 'tail_label';
    else
      v_cap := v_pch; v_lu := v_lu_p;
    end if;
    continue when v_lu >= v_cap;
    v_take := least(v_left, v_cap - v_lu);
    insert into public.reports (challenge_id, participant_id, portion_n, chapters, verse, learned, application, question,
                                created_at, client_id, entered_by)
    values (c.id, pa.id, v_pn, v_take,
            case when v_first then left(btrim(coalesce(p_verse, '')), 1500) else '' end,
            case when v_first then left(btrim(coalesce(p_learned, '')), 3000) else '' end,
            case when v_first then left(btrim(coalesce(p_application, '')), 3000) else '' end,
            case when v_first then left(btrim(coalesce(p_question, '')), 1500) else '' end,
            v_at, case when v_first then p_client_id else null end, p_entered_by);
    v_parts := v_parts || jsonb_build_object('n', v_pn, 'label', v_label, 'chapters', v_take,
                                             'complete', v_lu + v_take >= v_cap, 'total', v_cap);
    v_left := v_left - v_take;
    v_first := false;
  end loop;

  return jsonb_build_object('ok', true, 'parts', v_parts, 'profile', app_private.profile(pa.id));
end $$;

-- Calcul portion + décalage à partir d'un livre et d'un chapitre
create or replace function app_private.start_from(p_cid uuid, p_book text, p_chap int,
  out o_portion int, out o_offset int, out o_error text)
language plpgsql stable set search_path = public as $$
declare b public.books; v_pos int; po public.portions;
begin
  select * into b from public.books where name = btrim(coalesce(p_book, ''));
  if not found then o_error := 'Livre inconnu : choisissez-le dans la liste.'; return; end if;
  if p_chap is null or p_chap < 1 or p_chap > b.chapters then
    o_error := b.name || case when b.chapters = 1 then ' n''a qu''un seul chapitre.' else ' compte ' || b.chapters || ' chapitres : indiquez un chapitre entre 1 et ' || b.chapters || '.' end;
    return;
  end if;
  v_pos := app_private.global_pos(b.name, p_chap);
  select * into po from public.portions
    where challenge_id = p_cid and book is not null and app_private.global_pos(book, start_chapter) <= v_pos
    order by n desc limit 1;
  if not found then o_error := 'Plan de lecture introuvable.'; return; end if;
  o_portion := po.n;
  o_offset := greatest(0, least(po.chapters - 1, v_pos - app_private.global_pos(po.book, po.start_chapter)));
end $$;

-- Inscription : identique, mais « Là où j'en suis » enregistre le chapitre exact
create or replace function public.api_signup(
  p_slug text, p_name text, p_phone text, p_pin text,
  p_start text default 'at', p_book text default null, p_chap int default 1
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  c public.challenges; v_name text; v_pin text; v_phone text;
  v_start int := 1; v_off int := 0; v_num int; v_code text; v_id uuid; v_token uuid; s record;
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
    select * into s from app_private.start_from(c.id, p_book, p_chap);
    if s.o_error is not null then return jsonb_build_object('error', s.o_error); end if;
    v_start := s.o_portion; v_off := s.o_offset;
  end if;

  perform pg_advisory_xact_lock(hashtext(c.id::text));
  if exists (select 1 from public.participants where challenge_id = c.id and phone = v_phone) then
    return jsonb_build_object('error', 'Ce numéro a déjà un compte. Utilisez « J''ai déjà un compte » pour vous connecter.');
  end if;
  select coalesce(max(substr(code, 3)::int), 0) + 1 into v_num from public.participants where challenge_id = c.id;
  v_code := 'CB' || lpad(v_num::text, 4, '0');

  insert into public.participants (challenge_id, code, name, phone, start_portion, start_offset, pin_hash)
  values (c.id, v_code, v_name, v_phone, v_start, v_off,
          case when v_pin <> '' then extensions.crypt(v_pin, extensions.gen_salt('bf')) else null end)
  returning id, token into v_id, v_token;

  return jsonb_build_object('ok', true, 'token', v_token, 'profile', app_private.profile(v_id));
end $$;

-- Admin uniquement : changer le point de départ d'un participant (aucun rapport n'est touché)
create or replace function public.admin_set_start(p_participant uuid, p_book text, p_chap int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare pa public.participants; s record; v_avant text; v_apres text;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select * into pa from public.participants where id = p_participant;
  if not found then return jsonb_build_object('error', 'Participant introuvable.'); end if;
  select * into s from app_private.start_from(pa.challenge_id, p_book, p_chap);
  if s.o_error is not null then return jsonb_build_object('error', s.o_error); end if;
  v_avant := app_private.depart(pa.id) ->> 'label';
  update public.participants set start_portion = s.o_portion, start_offset = s.o_offset where id = pa.id;
  v_apres := app_private.depart(pa.id) ->> 'label';
  perform app_private.log(pa.challenge_id, 'depart_modifie', jsonb_build_object(
    'participant', pa.name || ' (' || pa.code || ')', 'avant', v_avant, 'apres', v_apres));
  return jsonb_build_object('ok', true, 'profile', app_private.profile(pa.id));
end $$;

-- Droits
revoke all on function app_private.range_label(int, int) from public, anon, authenticated;
revoke all on function app_private.depart(uuid) from public, anon, authenticated;
revoke all on function app_private.start_from(uuid, text, int) from public, anon, authenticated;
revoke all on function public.admin_set_start(uuid, text, int) from public, anon;
grant execute on function public.admin_set_start(uuid, text, int) to authenticated;
