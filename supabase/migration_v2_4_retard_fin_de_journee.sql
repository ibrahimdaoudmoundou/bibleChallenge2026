-- v2.4 : le retard ne compte que les journées terminées (la portion du jour n'est pas « en retard » le jour même)
-- + la suppression d'un rapport par un admin renvoie la fiche à jour (l'espace admin n'a plus besoin de tout recharger).
-- Aucune donnée n'est modifiée : uniquement des fonctions de calcul.

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
begin
  select * into p from public.participants where id = p_id;
  if not found then return null; end if;
  select * into c from public.challenges where id = p.challenge_id;
  select count(*), coalesce(sum(chapters), 0) into v_n, v_tot from public.portions where challenge_id = c.id;
  v_day := app_private.challenge_day(c);
  v_att := app_private.expected_portions(v_day, c.total_days, c.catchup_days, v_n);          -- objectif de fin de journée
  v_att_due := app_private.expected_portions(v_day - 1, c.total_days, c.catchup_days, v_n);  -- dû à la fin d'hier

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

create or replace function public.admin_delete_report(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select rp.challenge_id, rp.participant_id, rp.portion_n, rp.chapters, rp.created_at, pa.name, pa.code into r
    from public.reports rp join public.participants pa on pa.id = rp.participant_id where rp.id = p_id;
  if not found then return jsonb_build_object('error', 'Rapport introuvable.'); end if;
  delete from public.reports where id = p_id;
  perform app_private.log(r.challenge_id, 'rapport_supprime', jsonb_build_object(
    'participant', r.name || ' (' || r.code || ')', 'portion', 'P' || r.portion_n, 'chapitres', r.chapters, 'du', r.created_at));
  return jsonb_build_object('ok', true, 'profile', app_private.profile(r.participant_id));
end $$;
