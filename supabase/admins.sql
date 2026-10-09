-- ==================================================================
--  ADMINISTRATEURS
--  1) Supabase > Authentication > Users > Add user > Create new user
--     (e-mail + mot de passe, cochez « Auto Confirm User »), pour chaque administrateur.
--  2) Exécutez ce fichier : il donne le droit d'administration aux e-mails listés.
--  Vous pouvez le relancer à tout moment pour ajouter d'autres personnes.
-- ==================================================================
insert into public.admins (user_id, email)
select id, email
from auth.users
where lower(email) in (
  'ibrahimdaoudmoundou2026@gmail.com',
  'meponsime@gmail.com',
  'bahaesther2@gmail.com',
  'gotiertoue1@gmail.com',
  'bethelepie0@gmail.com'
)
on conflict (user_id) do nothing;

-- Vérification : doit afficher les administrateurs ajoutés
select email from public.admins order by email;
