-- v2.3 : remise à zéro avant le démarrage + aucun rapport participant avant la date de début.
-- 1) Sauvegarde des rapports envoyés AVANT la date de début (table privée, non exposée).
-- 2) Suppression de ces rapports : les chapitres lus repartent de zéro pour tout le monde.
--    (les participants, leurs comptes, codes, pays/ville ne sont PAS touchés)
-- 3) Les participants ne peuvent plus envoyer de rapport avant la date de début.
-- Le script peut être relancé sans danger : il ne supprime que des rapports antérieurs à la date de début.

create table if not exists app_private.reports_avant_debut (like public.reports including defaults);
alter table app_private.reports_avant_debut add column if not exists archived_at timestamptz default now();

insert into app_private.reports_avant_debut
select r.*, now() from public.reports r
join public.challenges c on c.id = r.challenge_id
where (r.created_at at time zone c.timezone)::date < c.start_date
  and not exists (select 1 from app_private.reports_avant_debut a where a.id = r.id);

delete from public.reports r
using public.challenges c
where c.id = r.challenge_id
  and (r.created_at at time zone c.timezone)::date < c.start_date;

create or replace function public.api_report(
  p_token text, p_portion int, p_chapters int,
  p_verse text, p_learned text, p_application text, p_question text default ''
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants; c public.challenges; v_max int; v_verse text; v_learned text; v_app text;
begin
  begin
    select * into p from public.participants where token = p_token::uuid;
  exception when others then return jsonb_build_object('logged_out', true);
  end;
  if not found then return jsonb_build_object('logged_out', true); end if;

  select * into c from public.challenges where id = p.challenge_id;
  if app_private.challenge_day(c) < 1 then
    return jsonb_build_object('error', 'Le challenge commence le ' || to_char(c.start_date, 'DD/MM/YYYY') || '. Vous pourrez envoyer votre premier rapport à partir de ce jour-là.');
  end if;

  select chapters into v_max from public.portions where challenge_id = p.challenge_id and n = p_portion;
  if v_max is null then return jsonb_build_object('error', 'Choisissez la portion lue.'); end if;
  if p_chapters is null or p_chapters < 1 or p_chapters > v_max then
    return jsonb_build_object('error', 'Indiquez le nombre de chapitres lus (entre 1 et ' || v_max || ').');
  end if;
  v_verse := left(btrim(coalesce(p_verse, '')), 1500);
  v_learned := left(btrim(coalesce(p_learned, '')), 3000);
  v_app := left(btrim(coalesce(p_application, '')), 3000);

  insert into public.reports (challenge_id, participant_id, portion_n, chapters, verse, learned, application, question)
  values (p.challenge_id, p.id, p_portion, p_chapters, v_verse, v_learned, v_app, left(btrim(coalesce(p_question, '')), 1500));

  return jsonb_build_object('ok', true, 'profile', app_private.profile(p.id));
end $$;

create or replace function public.api_report_v2(
  p_token text, p_portion int, p_chapters int,
  p_verse text, p_learned text, p_application text, p_question text default '', p_client_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants; c public.challenges; v_max int; v_verse text; v_learned text; v_app text;
begin
  begin
    select * into p from public.participants where token = p_token::uuid;
  exception when others then return jsonb_build_object('logged_out', true);
  end;
  if not found then return jsonb_build_object('logged_out', true); end if;

  select * into c from public.challenges where id = p.challenge_id;
  if app_private.challenge_day(c) < 1 then
    return jsonb_build_object('error', 'Le challenge commence le ' || to_char(c.start_date, 'DD/MM/YYYY') || '. Vous pourrez envoyer votre premier rapport à partir de ce jour-là.');
  end if;

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

  insert into public.reports (challenge_id, participant_id, portion_n, chapters, verse, learned, application, question, client_id)
  values (p.challenge_id, p.id, p_portion, p_chapters, v_verse, v_learned, v_app, left(btrim(coalesce(p_question, '')), 1500), p_client_id)
  on conflict (client_id) do nothing;

  return jsonb_build_object('ok', true, 'profile', app_private.profile(p.id));
end $$;
