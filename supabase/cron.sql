-- ==================================================================
--  ENVOIS AUTOMATIQUES (à exécuter APRÈS le déploiement sur Vercel)
--  1) Supabase > Database > Extensions : activez « pg_cron » et « pg_net ».
--  2) Remplacez VOTRE-DOMAINE et VOTRE_SECRET ci-dessous
--     (VOTRE_SECRET = la valeur de CRON_SECRET mise dans Vercel).
--  3) Exécutez le fichier.
--
--  Heures en UTC. Le Cameroun est à UTC+1, sans changement d'heure :
--     05:00 UTC = 06:00 au Cameroun (annonce du matin)
--     20:00 UTC = 21:00 au Cameroun (bilan du soir)
--     07:00 UTC le lundi = 08:00 au Cameroun (relances)
--  Autre pays : retirez/ajoutez votre décalage horaire.
-- ==================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule('cb-morning', '0 5 * * *', $$
  select net.http_post(url := 'https://VOTRE-DOMAINE/api/cron?task=morning',
    headers := jsonb_build_object('x-cron-secret', 'VOTRE_SECRET'), timeout_milliseconds := 55000) $$);

select cron.schedule('cb-evening', '0 20 * * *', $$
  select net.http_post(url := 'https://VOTRE-DOMAINE/api/cron?task=evening',
    headers := jsonb_build_object('x-cron-secret', 'VOTRE_SECRET'), timeout_milliseconds := 55000) $$);

select cron.schedule('cb-reminders', '0 7 * * 1', $$
  select net.http_post(url := 'https://VOTRE-DOMAINE/api/cron?task=reminders',
    headers := jsonb_build_object('x-cron-secret', 'VOTRE_SECRET'), timeout_milliseconds := 55000) $$);

-- Garde la base éveillée (Supabase gratuit met en pause après 7 jours sans activité)
select cron.schedule('cb-ping', '0 12 * * *', $$
  select net.http_post(url := 'https://VOTRE-DOMAINE/api/cron?task=ping',
    headers := jsonb_build_object('x-cron-secret', 'VOTRE_SECRET'), timeout_milliseconds := 20000) $$);

-- Vérifier : select jobname, schedule from cron.job;
-- Voir les derniers appels : select status_code, created from net._http_response order by created desc limit 10;
-- Arrêter un envoi : select cron.unschedule('cb-morning');
