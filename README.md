# 📖 Challenge Bible — application complète (Vercel + Supabase)

Plateforme pour les participants (inscription, rapport quotidien, progression), administration
(tableau de bord, participants, questions, sessions) et e-mails automatiques pour les administrateurs.
Elle peut gérer **plusieurs sessions** : chaque session a son adresse (`votre-domaine.org/bible`,
`votre-domaine.org/bible-janvier`…).

| Élément | Outil gratuit |
|---|---|
| Site (participants + administration) | Vercel |
| Base de données | Supabase |
| E-mails aux administrateurs | Gmail (via une fonction Vercel) |
| Envois à heures fixes | Supabase (pg_cron) |

---

## Application installable sur le téléphone

Le site est une application web installable (PWA) : icône sur l'écran d'accueil, ouverture en plein écran, ouverture rapide même avec une connexion lente. Rien à publier sur une boutique d'applications.

- **Android (Chrome)** : un bouton « Installer » s'affiche sur la page d'accueil et sur « Aujourd'hui ». Sinon : menu ⋮ puis « Installer l'application ».
- **iPhone (Safari)** : bouton Partager puis « Sur l'écran d'accueil ».
- **Ordinateur (Chrome ou Edge)** : icône d'installation dans la barre d'adresse.
- L'installation exige l'adresse en **https** : c'est automatique sur Vercel (et avec votre nom de domaine).
- Les données ne sont jamais enregistrées sur le téléphone sans connexion : l'application s'ouvre, mais l'envoi d'un rapport demande du réseau.
- Pour changer l'icône ou la couleur : dossier `public/icons/`, `public/manifest.webmanifest` (`theme_color`).
- Après une mise à jour du site, un participant récupère la nouvelle version en rouvrant l'application (ou en la fermant puis la rouvrant).

## Documents fournis (dossier `documents/`)

| Fichier | Pour qui |
|---|---|
| `Plan_de_lecture_Challenge_Bible_40j.pdf` | Participants : à épingler dans le grand groupe |
| `Guide_participant_Challenge_Bible_40j.pdf` | Participants : à envoyer dans le grand groupe |
| `Guide_administrateur.md` | L'équipe d'administration |
| `Messages_WhatsApp.md` | Messages prêts à copier-coller, avec le calendrier de publication |
| `ancien-script-apps-script/` | Ancienne version Google Apps Script, gardée en secours |

Les deux PDF sont aussi dans le dossier `public/` : une fois le site publié, ils sont disponibles aux adresses
`https://votre-domaine/Plan_de_lecture_Challenge_Bible_40j.pdf` et `https://votre-domaine/Guide_participant_Challenge_Bible_40j.pdf`.
Le plan de lecture est déjà relié à la session (bouton dans le menu du compte et lien dans les messages) ; le guide
du participant figure aussi dans ce menu. Vous pouvez joindre les PDF à vos messages WhatsApp ou y partager ces liens.

---

## Mise à jour v2 (à faire une fois)

Supabase > **SQL Editor** > New query > coller `supabase/migration_v2.sql` > **Run**.
Le script ne fait que des ajouts (rien n'est supprimé) et peut être relancé sans danger. Il apporte :

- **Participants** : pays, ville et nombre de participations précédentes (facultatifs) ; ajout d'un participant et saisie de ses rapports par un administrateur (fiche de suivi).
- **Suivi** : filtres (statut, pays, ville, participations, origine), tris (plus avancés, plus réguliers…), **podium** avec message WhatsApp prêt à envoyer.
- **Exports** PDF, Excel et CSV (liste filtrée, rapports sur une période, statistiques, fiche d'un participant, historique).
- **Statistiques** avec diagrammes (activité par jour, avancement, pays, villes).
- **Historique** : qui a fait quoi dans l'administration.
- **Page publique** : texte « L'histoire du challenge » et photo modifiables dans `/admin > Page publique`, annonce affichée chez tous les participants.
- **Hors connexion** : le rapport est gardé sur le téléphone et envoyé automatiquement au retour d'Internet (sans doublon).

Le site fonctionne aussi avant l'exécution du script : les nouvelles fonctions affichent simplement un rappel.

## Étape 1 — Supabase (base de données)

1. Créez un compte sur **supabase.com**, puis **New project** (nom `challenge-bible`, région la plus proche, notez le mot de passe de la base).
2. Menu **SQL Editor > New query** : ouvrez `supabase/schema.sql`, copiez tout, collez, **Run**. Message « Success » attendu.
3. Nouvelle requête : collez `supabase/seed.sql` (livres, première session « bible » du 12 octobre 2026, plan de lecture), **Run**.
4. Menu **Project Settings > API** : notez
   - **Project URL** (`https://xxxx.supabase.co`),
   - la clé **anon public**,
   - la clé **service_role** (secrète : ne la mettez jamais dans le code ni dans un message).

## Étape 2 — Les administrateurs

1. **Authentication > Sign In / Providers** : désactivez « Allow new users to sign up » (personne ne peut alors se créer un compte administrateur).
2. **Authentication > Users > Add user > Create new user** : pour chaque administrateur, saisissez son e-mail et un mot de passe, cochez **Auto Confirm User**.
3. **SQL Editor** : exécutez `supabase/admins.sql`. La dernière ligne affiche la liste des administrateurs enregistrés.

Chacun se connecte ensuite sur `votre-site/admin`.

## Étape 3 — Mettre le code sur GitHub

Dans le dossier du projet (après avoir décompressé l'archive) :

```powershell
git init
git add .
git commit -m "Challenge Bible"
git branch -M main
git remote add origin git@github.com:VOTRE-COMPTE/challenge-bible.git
git push -u origin main
```

Créez d'abord un dépôt vide `challenge-bible` sur GitHub (**New repository**, sans README). GitLab fonctionne de la même façon.

## Étape 4 — Vercel (publication)

1. Sur **vercel.com** : **Add New > Project**, choisissez le dépôt. Vercel détecte Vite tout seul.
2. Avant de cliquer sur **Deploy**, ouvrez **Environment Variables** et ajoutez :

| Nom | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | Project URL de Supabase |
| `VITE_SUPABASE_ANON_KEY` | clé **anon** |
| `SUPABASE_URL` | Project URL de Supabase (même valeur) |
| `SUPABASE_SERVICE_ROLE_KEY` | clé **service_role** |
| `CRON_SECRET` | une longue phrase au hasard (gardez-la, elle sert à l'étape 6) |
| `GMAIL_USER` | l'adresse Gmail qui enverra les e-mails |
| `GMAIL_APP_PASSWORD` | mot de passe d'application Gmail (étape 6) |

3. Cliquez sur **Deploy**. Le site est en ligne sur `xxxx.vercel.app`. Ouvrez `xxxx.vercel.app/bible` : la page d'accueil du challenge s'affiche.

> Si vous ajoutez ou modifiez une variable plus tard, faites **Deployments > ⋯ > Redeploy** pour qu'elle soit prise en compte.

## Étape 5 — Votre nom de domaine

1. Vercel > votre projet > **Settings > Domains > Add** : saisissez votre domaine (par exemple `challenge.votredomaine.org`).
2. Vercel affiche l'enregistrement DNS à créer chez votre vendeur de domaine (en général un **CNAME** vers `cname.vercel-dns.com` pour un sous-domaine, ou un **A** vers l'adresse indiquée pour un domaine principal). Recopiez exactement ce que Vercel montre.
3. Attendez quelques minutes (parfois quelques heures) : Vercel passe le domaine en « Valid » et ajoute le certificat HTTPS tout seul.
4. Dans `/admin > Sessions`, renseignez **Lien de la plateforme** avec l'adresse finale (ex. `https://challenge.votredomaine.org/bible`). Ce lien est utilisé dans les messages WhatsApp. Laissé vide, l'adresse du site est utilisée automatiquement.

## Étape 6 — E-mails automatiques

1. **Mot de passe d'application Gmail** : compte Google de l'adresse expéditrice > **Sécurité > Validation en deux étapes** (à activer) > **Mots de passe des applications** > créez-en un. Google affiche 16 lettres : c'est `GMAIL_APP_PASSWORD` (sans espaces).
2. Vérifiez que les variables Vercel de l'étape 4 sont bien renseignées, puis redéployez si besoin.
3. **Test** (PowerShell, en remplaçant les valeurs) :

```powershell
Invoke-RestMethod -Method Post -Uri "https://VOTRE-DOMAINE/api/cron?task=morning&force=1&to=votre@email.com" -Headers @{ "x-cron-secret" = "VOTRE_SECRET" }
```

   Vous devez recevoir l'annonce du matin avec le bouton « Ouvrir dans WhatsApp ». Essayez aussi `task=evening` et `task=reminders`.
4. **Programmation** : dans Supabase > **Database > Extensions**, activez `pg_cron` et `pg_net`. Ouvrez `supabase/cron.sql`, remplacez `VOTRE-DOMAINE` et `VOTRE_SECRET`, exécutez dans le **SQL Editor**.
   - 06 h : annonce du matin · 21 h : bilan du soir · lundi 08 h : liste des relances (heure du Cameroun).
5. Les destinataires sont les adresses saisies dans `/admin > Sessions > E-mails des administrateurs`.

## Lancer une nouvelle session

`/admin > Sessions > Créer une nouvelle session à partir de celle-ci` : choisissez une adresse courte (ex. `bible-janvier`), un nom et la date de début. Le plan de lecture et les réglages sont copiés ; les participants repartent de zéro. Chaque session a ses propres administrateurs destinataires, son slogan et ses jours de rattrapage. L'ancienne session peut être désactivée (case « Session active »).

Pour un autre plan de lecture que la Bible en 37 portions, modifiez la table `portions` de la nouvelle session dans Supabase (**Table Editor > portions**).

## Avant le 12 octobre : liste de vérification

- [ ] `votre-site/bible` s'ouvre sur un téléphone en Wi-Fi **et** en données mobiles
- [ ] Inscription, rapport et reconnexion fonctionnent (puis supprimez ce compte test dans `/admin > Participants > ✕`)
- [ ] Connexion à `/admin` de chaque administrateur
- [ ] Les trois e-mails de test arrivent chez les administrateurs
- [ ] `select jobname, schedule from cron.job;` affiche 4 tâches
- [ ] Lien de la plateforme renseigné dans Sessions

## À savoir

- **Sécurité** : le navigateur n'a jamais accès directement aux tables. Il appelle seulement des fonctions qui vérifient les droits. Les codes secrets sont chiffrés, et un compte est bloqué 15 minutes après 5 codes faux. Un compte sans code se connecte avec le seul numéro : encouragez les participants à choisir un code.
- **Supabase gratuit** met un projet en pause après 7 jours sans activité. La tâche `cb-ping` de `cron.sql` évite cela.
- **Limites gratuites** : Gmail envoie environ 500 e-mails par jour (largement suffisant : quelques e-mails par jour pour les administrateurs). Vercel Hobby est prévu pour un usage non commercial.
- **Réseau** : le site utilise votre domaine (ou `vercel.app`) et `supabase.co`. Aucun domaine `googleusercontent.com` n'est impliqué. Aucun hébergement n'est accessible à 100 % depuis tous les réseaux, mais ces domaines sont bien plus courants que celui d'Apps Script.
- **Fuseau horaire** : réglé sur `Africa/Douala` dans chaque session (modifiable dans Sessions).

## Dépannage

| Problème | Piste |
|---|---|
| Page « Configuration manquante » | Variables `VITE_…` absentes dans Vercel, ou pas de redéploiement après ajout |
| `/admin` : « Accès refusé » | L'e-mail n'est pas dans la table `admins` : relancez `admins.sql` après avoir créé l'utilisateur |
| `/admin` : « E-mail ou mot de passe incorrect » | Utilisateur non créé ou non confirmé (cochez Auto Confirm User) |
| `/api/cron` répond 401 | `CRON_SECRET` différent entre Vercel et la requête |
| `/api/cron` répond 500 « Invalid login » | Mot de passe d'application Gmail erroné, ou validation en deux étapes non activée |
| Pas d'e-mail le matin | `select status_code, created from net._http_response order by created desc limit 10;` pour voir la réponse du serveur |
| Nom de domaine « Invalid Configuration » | Enregistrement DNS différent de celui affiché par Vercel |

## Développement local (facultatif)

```powershell
npm install
copy .env.example .env     # puis renseignez les valeurs
npm run dev
```
