# Guide de l'administration — Challenge Bible 40 jours

*Toute la Bible en 40 jours ✨ — Challenge organisé par Mary Epie Fomum*

Du lundi 12 octobre au vendredi 20 novembre 2026 : 40 jours, 37 portions d'environ 32 chapitres, et 3 jours de rattrapage (24 octobre, 6 novembre et 20 novembre).

Ce guide va de la mise en ligne jusqu'à la fin du challenge. La **mise en place technique** se fait une seule fois, sur ordinateur, par une seule personne (environ 1 heure). Ensuite, tout se gère depuis un téléphone.

## Ce que vous avez reçu

| Fichier | À quoi il sert |
|---|---|
| `challenge-bible-app.zip` | L'application complète (site des participants, administration, e-mails automatiques) |
| `LISEZ-MOI.md` | Le guide technique pas à pas, pour la personne qui met le site en ligne |
| `Plan_de_lecture_Challenge_Bible_40j.pdf` | Le plan des 37 portions, à épingler dans le grand groupe |
| `Guide_participant_Challenge_Bible_40j.pdf` | À envoyer dans le grand groupe |
| `Messages_WhatsApp.md` | Les messages prêts à copier-coller, de l'annonce à la fin |

## Les dates à retenir

| Date | Quoi |
|---|---|
| Dès que le site est en ligne | Ouvrir les inscriptions (message 1) |
| Vendredi 9 octobre | Rappel des inscriptions (message 2) |
| Dimanche 11 octobre | Lancement : messages 3 et 4, plan et guide en pièces jointes |
| **Lundi 12 octobre** | **Jour 1** |
| Samedi 24 octobre | Jour 13 : rattrapage |
| Samedi 31 octobre | Jour 20 : mi-parcours (message 7) |
| Vendredi 6 novembre | Jour 26 : rattrapage |
| **Vendredi 20 novembre** | **Jour 40 : rattrapage final et fin (message 8)** |

## Comment fonctionne le système

**Deux groupes WhatsApp :**
- le **groupe des administrateurs**, pour l'équipe d'organisation ;
- le **grand groupe**, ouvert à tous, pour les orientations et les encouragements.

**Une plateforme avec un seul lien pour tout le monde** (par exemple `votre-domaine.org/bible`). Chaque participant ouvre ce lien et :
- crée son compte une seule fois (nom, numéro WhatsApp, point de départ ; le code secret de 4 chiffres est facultatif) ;
- voit sa portion à lire, sa progression et son parcours ;
- envoie ses rapports **quand il veut**, en indiquant le **nombre de chapitres lus** : toute la portion, ou seulement une partie. Son téléphone reste connecté ; sur un autre téléphone, il se reconnecte avec son numéro (et son code s'il en a choisi un).

**Une application installable** : sur téléphone, la plateforme se comporte comme une vraie application. Le bouton **Installer** s'affiche sur la page (ou menu du navigateur > « Installer l'application » / « Ajouter à l'écran d'accueil »). Rien à télécharger depuis une boutique. Faites-le vous-même en premier, puis montrez-le dans le groupe.

**Une page d'administration** (`votre-domaine.org/admin`) où chaque administrateur se connecte avec **son propre e-mail et son mot de passe**. Tout est calculé automatiquement et en direct : il n'y a rien à « mettre à jour ».

**Les administrateurs reçoivent automatiquement par e-mail**, à l'heure du Cameroun :
- **chaque matin (6 h)**, l'annonce du jour ;
- **chaque soir (21 h)**, le bilan du jour ;
- **chaque lundi (8 h)**, la liste des personnes à relancer.

Chaque e-mail contient un bouton **« Ouvrir dans WhatsApp »** : le message s'ouvre déjà écrit, vous choisissez le groupe et vous envoyez. Les e-mails arrivent **directement chez chaque administrateur** dont l'adresse est enregistrée : répartissez-vous les tâches dans le groupe des administrateurs.

---

## Étape 1 — Mettre le site en ligne (une personne, sur ordinateur)

Suivez `LISEZ-MOI.md`, qui détaille chaque clic. En résumé :

1. **Supabase** : créer le projet, exécuter `schema.sql` puis `seed.sql` (la session « bible » du 12 octobre est déjà préparée).
2. **Administrateurs** : créer un compte par administrateur, puis exécuter `admins.sql`.
3. **GitHub** : mettre le dossier de l'application en ligne.
4. **Vercel** : importer le dépôt, renseigner les variables, déployer.
5. **Nom de domaine** : le relier à Vercel.
6. **E-mails** : mot de passe d'application Gmail, test, puis `cron.sql` pour les heures d'envoi.

Gardez précieusement, et ne les partagez qu'avec la personne technique : le mot de passe de la base Supabase, la clé `service_role`, le mot de passe d'application Gmail et le `CRON_SECRET`. Les administrateurs n'ont besoin que de leur e-mail et de leur mot de passe personnel.

## Étape 2 — Régler la session (page d'administration)

Connectez-vous sur `votre-domaine.org/admin`, onglet **Sessions**. Vérifiez :

| Réglage | Ce qu'il faut mettre |
|---|---|
| Nom, slogan, signature | Déjà remplis : « Challenge Bible 40 jours », « Toute la Bible en 40 jours ✨ », « Challenge organisé par Mary Epie Fomum ». Ils apparaissent sur la plateforme et dans les annonces. |
| Date de début (jour 1) | **12/10/2026**. Le jour 40 tombe ainsi le 20 novembre 2026. |
| Nombre de jours / rattrapage | 40 jours, rattrapage aux jours 13, 26 et 40 |
| Indicatif pays | 237 (Cameroun), à changer si besoin. Il sert si quelqu'un tape son numéro sans indicatif. |
| Fuseau horaire | Africa/Douala |
| Lien de la plateforme | L'adresse finale, par exemple `https://votre-domaine.org/bible`. Elle est ajoutée dans les annonces et les relances. |
| Lien du plan de lecture | Facultatif : déposez le PDF dans Google Drive, faites **Partager → Tous les utilisateurs disposant du lien**, puis collez le lien |
| E-mails des administrateurs | Les adresses qui reçoivent les e-mails automatiques, séparées par des virgules |
| Session active | Cochée |

**À propos du slogan :** l'ancien slogan « Finir l'année 2026 en beauté » ne correspondait plus au calendrier (le challenge se termine le 20 novembre). Il est remplacé par « Toute la Bible en 40 jours » dans l'application, les messages et les PDF. Vous pouvez en choisir un autre dans l'onglet **Sessions**, puis **Enregistrer** ; pensez alors à modifier aussi les messages WhatsApp.

Les **heures d'envoi** (6 h, 21 h, lundi 8 h) se règlent dans `cron.sql`, par la personne technique.

## Étape 3 — Faire un test complet

1. Sur votre téléphone, ouvrez le lien de la plateforme et **créez un compte** avec votre numéro.
2. **Envoyez un rapport de test.**
3. Dans `/admin`, onglet **Participants** : vous apparaissez avec vos chapitres lus. Le **Tableau de bord** se met à jour.
4. Demandez à la personne technique d'envoyer les e-mails de test (commande dans `LISEZ-MOI.md`, étape 6). Ouvrez-les **sur le téléphone** et touchez le bouton vert pour vérifier que WhatsApp s'ouvre bien.
5. Avant le lancement, supprimez votre compte de test avec le bouton **✕** (il supprime aussi son rapport). Vous pouvez ensuite recréer votre compte pour participer vous aussi !

## Étape 4 — Les deux groupes WhatsApp (sur téléphone)

**Le grand groupe** est ouvert à tous. Pour que vos orientations restent visibles malgré les messages :
- **épinglez** le message 3 (fonctionnement), le message 4 (règles) et le plan de lecture : appui long sur le message, puis **Épingler** ;
- dans **Infos du groupe → Paramètres du groupe**, laissez « Envoyer des messages » à **Tous les membres**, mais réservez **Modifier les paramètres du groupe** aux administrateurs ;
- nommez 3 ou 4 co-administrateurs pour modérer.

Un groupe WhatsApp peut contenir jusqu'à environ 1 000 membres : 500 participants, c'est donc possible.

**Le groupe des administrateurs** sert à se répartir les tâches : qui publie l'annonce du matin, qui publie le bilan, qui fait quelle partie des relances, qui répond aux questions.

## Étape 5 — Ouvrir les inscriptions

1. Publiez le **message 1** de `Messages_WhatsApp.md`, avec le lien de la plateforme.
2. Les comptes apparaissent **immédiatement** dans l'onglet **Participants**. Les numéros en double sont refusés automatiquement.
3. Publiez le **message 2** (rappel) le vendredi 9 octobre.
4. Le matin, pendant les 6 jours qui précèdent le début, vous recevez aussi une annonce « Plus que X jours » à publier (à partir du moment où les envois automatiques sont programmés).

Les inscriptions restent ouvertes pendant tout le challenge. Une personne qui arrive en cours de route apparaît en retard au départ ; elle rattrape avec les jours de rattrapage.

## Étape 6 — Le lancement (dimanche 11 octobre)

Publiez le **message 3** avec le plan de lecture PDF et le guide du participant, puis le **message 4** (règles). Épinglez-les.

## Pendant les 40 jours : la routine de l'équipe

| Quand | Ce qu'il faut faire | Temps |
|---|---|---|
| Matin | Ouvrir l'e-mail « annonce du matin », toucher le bouton vert, choisir le grand groupe, envoyer | 30 s |
| Soir | Ouvrir l'e-mail « bilan du soir », même geste | 30 s |
| Chaque lundi (premier envoi le 19 octobre) | Ouvrir l'e-mail « personnes à relancer » et toucher chaque nom pour envoyer un encouragement en privé. Les listes arrivent par lots de 100 : répartissez-les entre administrateurs. Vous pouvez aussi utiliser `/admin > Participants`, filtre « En retard », bouton **Relancer**. | 20 à 40 min |
| 2 à 3 fois par semaine | Onglet **Questions** de `/admin` : répondre (seul ou avec un pasteur), marquer « traitée », publier les réponses utiles dans le grand groupe (message 6) | 20 min |
| Quand vous voulez | **Tableau de bord** : suivre les inscriptions, les rapports du jour, la progression globale | — |

Le bilan publié dans le groupe ne montre que des chiffres globaux, jamais les noms des personnes en retard. Si un e-mail n'est pas arrivé, l'onglet **Tableau de bord** de `/admin` contient les mêmes messages (annonce du matin et bilan du soir) avec les boutons **Copier** et **Ouvrir dans WhatsApp**.

**Comment le retard est calculé** : la progression se compte en chapitres (1 189 au total), car chacun peut déclarer une lecture partielle. Le retard est la différence entre les chapitres attendus à ce jour et les chapitres lus. Jusqu'à 64 chapitres de retard (environ 2 portions), la personne est en « léger retard » ; au-delà, « en retard ».

## En cas de problème

| Problème | Solution |
|---|---|
| Un participant a oublié son code secret | `/admin > Participants`, bouton **Code** sur sa ligne. Il se reconnecte avec son numéro seul et peut choisir un nouveau code. **Vérifiez d'abord que la demande vient bien de lui** (message depuis son propre numéro). |
| Un participant est bloqué après plusieurs codes faux | Le blocage dure 15 minutes. Il peut réessayer ensuite, ou vous effacez son code. |
| Un numéro a été mal saisi | Dans Supabase, **Table Editor > participants**, corrigez la colonne `phone` sans le + (par exemple 237699123456). |
| Quelqu'un veut changer de point de départ | Dans Supabase, **Table Editor > participants**, modifiez `start_portion` (de 1 à 37 ; Matthieu = 29). |
| Un rapport est envoyé par erreur | Dans Supabase, **Table Editor > reports**, supprimez la ligne (ou corrigez `chapters`). Le calcul se met à jour tout seul. |
| Un compte est en double ou de test | `/admin > Participants`, bouton **✕** (supprime aussi ses rapports). |
| Je ne reçois pas les e-mails | Regardez dans les spams. Demandez à la personne technique de vérifier les envois dans Supabase (requête indiquée dans `LISEZ-MOI.md`) et le mot de passe d'application Gmail. En attendant, utilisez le **Tableau de bord** de `/admin`. |
| Je ne peux pas me connecter à `/admin` | Le compte n'est pas encore ajouté aux administrateurs : la personne technique relance `admins.sql`. |
| La plateforme ne s'ouvre pas pour certains | Publiez le message 9 (aide réseau) : patienter, changer de réseau, changer de navigateur. |
| Ralentissements le soir | La plateforme réessaie automatiquement. Si le problème persiste, publiez le bilan un peu plus tôt pour étaler les connexions. |

## Bon à savoir

- **Tout est calculé en direct** : une modification (rapport corrigé, point de départ changé) se voit immédiatement, sans action supplémentaire.
- **Les données sont dans Supabase**, plus dans Google Sheets. Le bouton **Exporter (CSV)** de l'onglet Participants donne un fichier lisible dans Excel ou Google Sheets.
- **Une nouvelle session plus tard ?** `/admin > Sessions > Créer une nouvelle session à partir de celle-ci` copie le plan de lecture et les réglages ; les participants repartent de zéro. Chaque session a sa propre adresse (`/bible-janvier`, par exemple).
- **Confidentialité** : les numéros de téléphone et les rapports sont personnels. Ne partagez l'accès à `/admin` et à Supabase qu'avec l'équipe d'administration, et ne faites jamais circuler les clés secrètes dans un groupe WhatsApp.
