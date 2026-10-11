-- v2.2 : le pays et la ville deviennent obligatoires (inscription, profil, ajout/modification par un admin).
-- Les participants déjà inscrits sans pays/ville ne sont pas bloqués : l'application leur demande de compléter.

create or replace function public.api_signup_v2(
  p_slug text, p_name text, p_phone text, p_pin text,
  p_start text default 'at', p_book text default null, p_chap int default 1,
  p_country text default null, p_city text default null, p_previous int default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb; v_id uuid;
begin
  if btrim(coalesce(p_country, '')) = '' then return jsonb_build_object('error', 'Indiquez votre pays (obligatoire).'); end if;
  if btrim(coalesce(p_city, '')) = '' then return jsonb_build_object('error', 'Indiquez votre ville ou localité (obligatoire).'); end if;
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

create or replace function public.api_update_profile(p_token text, p_country text, p_city text, p_previous int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if btrim(coalesce(p_country, '')) = '' or btrim(coalesce(p_city, '')) = '' then
    return jsonb_build_object('error', 'Le pays et la ville sont obligatoires.');
  end if;
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

create or replace function public.admin_add_participant(p_cid uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c public.challenges; r jsonb; v_id uuid; v_prev int;
begin
  if not app_private.is_admin() then return jsonb_build_object('error', 'Accès refusé.'); end if;
  select * into c from public.challenges where id = p_cid;
  if not found then return jsonb_build_object('error', 'Session introuvable.'); end if;
  if btrim(coalesce(p ->> 'country', '')) = '' or btrim(coalesce(p ->> 'city', '')) = '' then
    return jsonb_build_object('error', 'Le pays et la ville sont obligatoires.');
  end if;
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
  if btrim(coalesce(p ->> 'country', '')) = '' or btrim(coalesce(p ->> 'city', '')) = '' then
    return jsonb_build_object('error', 'Le pays et la ville sont obligatoires.');
  end if;
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
