-- v2.1 : seuls la portion et le nombre de chapitres sont obligatoires dans le rapport

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

  insert into public.reports (challenge_id, participant_id, portion_n, chapters, verse, learned, application, question)
  values (p.challenge_id, p.id, p_portion, p_chapters, v_verse, v_learned, v_app, left(btrim(coalesce(p_question, '')), 1500));

  return jsonb_build_object('ok', true, 'profile', app_private.profile(p.id));
end $$;

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

  insert into public.reports (challenge_id, participant_id, portion_n, chapters, verse, learned, application, question, client_id)
  values (p.challenge_id, p.id, p_portion, p_chapters, v_verse, v_learned, v_app, left(btrim(coalesce(p_question, '')), 1500), p_client_id)
  on conflict (client_id) do nothing;

  return jsonb_build_object('ok', true, 'profile', app_private.profile(p.id));
end $$;
