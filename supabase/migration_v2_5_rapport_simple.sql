-- v2.5 : « Rapport simple » — le participant indique seulement le nombre de chapitres lus (et le jour) ;
-- les chapitres sont répartis automatiquement sur ses portions, dans son ordre de lecture.
-- Additif : aucune table ni donnée existante n'est modifiée. Les rapports créés sont des rapports
-- « par portion » ordinaires (même table), donc tout le reste (admin, exports, stats, e-mails) fonctionne tel quel.

-- Répartition commune (participant et admin)
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
  v_parts jsonb := '[]'::jsonb; rec record;
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

  -- chapitres restant à lire dans tout le plan
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

  v_at := case when v_day = v_today then now() else (v_day + time '20:00') at time zone c.timezone end;
  v_left := p_chapters;

  for rec in
    select po.n, po.label, po.chapters,
           least(po.chapters, coalesce((select sum(chapters) from public.reports x
                                        where x.participant_id = pa.id and x.portion_n = po.n), 0))::int as lu
    from generate_series(0, v_n - 1) k
    join public.portions po on po.challenge_id = c.id and po.n = ((pa.start_portion - 1 + k) % v_n) + 1
    order by k
  loop
    exit when v_left <= 0;
    continue when rec.lu >= rec.chapters;
    v_take := least(v_left, rec.chapters - rec.lu);
    insert into public.reports (challenge_id, participant_id, portion_n, chapters, verse, learned, application, question,
                                created_at, client_id, entered_by)
    values (c.id, pa.id, rec.n, v_take,
            case when v_first then left(btrim(coalesce(p_verse, '')), 1500) else '' end,
            case when v_first then left(btrim(coalesce(p_learned, '')), 3000) else '' end,
            case when v_first then left(btrim(coalesce(p_application, '')), 3000) else '' end,
            case when v_first then left(btrim(coalesce(p_question, '')), 1500) else '' end,
            v_at, case when v_first then p_client_id else null end, p_entered_by);
    v_parts := v_parts || jsonb_build_object('n', rec.n, 'label', rec.label, 'chapters', v_take,
                                             'complete', rec.lu + v_take >= rec.chapters, 'total', rec.chapters);
    v_left := v_left - v_take;
    v_first := false;
  end loop;

  return jsonb_build_object('ok', true, 'parts', v_parts, 'profile', app_private.profile(pa.id));
end $$;

-- Participant
create or replace function public.api_report_simple(
  p_token text, p_chapters int, p_date date default null,
  p_verse text default '', p_learned text default '', p_application text default '', p_question text default '',
  p_client_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p public.participants; c public.challenges;
begin
  begin
    select * into p from public.participants where token = p_token::uuid;
  exception when others then return jsonb_build_object('logged_out', true);
  end;
  if not found then return jsonb_build_object('logged_out', true); end if;

  if p_client_id is not null and exists (select 1 from public.reports where client_id = p_client_id) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'profile', app_private.profile(p.id));
  end if;

  select * into c from public.challenges where id = p.challenge_id;
  if app_private.challenge_day(c) < 1 then
    return jsonb_build_object('error', 'Le challenge commence le ' || to_char(c.start_date, 'DD/MM/YYYY') || '. Vous pourrez envoyer votre premier rapport à partir de ce jour-là.');
  end if;

  return app_private.report_spread(p.id, p_chapters, p_date, p_verse, p_learned, p_application, p_question, p_client_id, null);
exception when unique_violation then
  return jsonb_build_object('ok', true, 'duplicate', true, 'profile', app_private.profile(p.id));
end $$;

-- Admin (saisie pour un participant)
create or replace function public.admin_add_report_simple(
  p_participant uuid, p_chapters int, p_date date default null,
  p_verse text default '', p_learned text default '', p_application text default '', p_question text default ''
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare pa public.participants; r jsonb;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select * into pa from public.participants where id = p_participant;
  if not found then return jsonb_build_object('error', 'Participant introuvable.'); end if;
  r := app_private.report_spread(pa.id, p_chapters, p_date, p_verse, p_learned, p_application, p_question, null, app_private.admin_email());
  if r ? 'ok' then
    perform app_private.log(pa.challenge_id, 'rapport_saisi', jsonb_build_object(
      'participant', pa.name || ' (' || pa.code || ')', 'portion', 'répartition automatique',
      'chapitres', p_chapters, 'date', coalesce(p_date, (now() at time zone (select timezone from public.challenges where id = pa.challenge_id))::date)));
  end if;
  return r;
end $$;

-- Droits
revoke all on function app_private.report_spread(uuid, int, date, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.api_report_simple(text, int, date, text, text, text, text, uuid) from public;
grant execute on function public.api_report_simple(text, int, date, text, text, text, text, uuid) to anon, authenticated;
revoke all on function public.admin_add_report_simple(uuid, int, date, text, text, text, text) from public, anon;
grant execute on function public.admin_add_report_simple(uuid, int, date, text, text, text, text) to authenticated;
