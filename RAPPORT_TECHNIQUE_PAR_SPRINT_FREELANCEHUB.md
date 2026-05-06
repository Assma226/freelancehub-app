# Rapport Technique Par Sprint - FreelanceHub

Date de reference : 06 mai 2026

## 1. Objet du rapport

Ce rapport decrit la solution technique reellement presente dans le depot `freelancehub-app` a la date de remise.

Il repond au cahier des charges sprint par sprint, avec trois niveaux de lecture :

- ce qui est implemente dans le code
- ce qui est implemente mais sous une forme differente de l'enonce
- ce qui n'apparait pas encore dans le depot

L'objectif est de produire un document defendable en soutenance, base sur le code existant et non sur une projection theorique.

## 2. Vue d'ensemble technique

### 2.1 Frontend mobile hybride

Le frontend se trouve dans `freelancehub-ionic/`.

Technologies utilisees :

- Angular 20
- Ionic 8
- composants standalone
- Angular Router
- `fetch` pour les appels REST
- `localStorage` pour la session utilisateur

Organisation principale :

- `src/app/app.routes.ts` : navigation de l'application
- `src/app/auth/` : inscription, connexion, choix du role
- `src/app/home/` : dashboard principal
- `src/app/client-request/` : publication d'offres cote client
- `src/app/service-market/` : marche des projets et freelancers
- `src/app/project-detail/` : detail projet, candidature, contrat, paiement, avancement
- `src/app/my-jobs/` : suivi des candidatures et missions
- `src/app/messages/` : conversations et messagerie
- `src/app/admin-dashboard/` : administration
- `src/app/payments/` : portefeuille, retraits, litiges, factures
- `src/app/shared/` : DTO, helpers API, navigation basse, menu compte

### 2.2 Backend API

Le backend se trouve dans `freelancehub-backend/`.

Technologies utilisees :

- Flask 3
- Flask-PyMongo
- Flask-JWT-Extended
- Flask-CORS
- bcrypt
- MongoDB

Organisation principale :

- `run.py` : point d'entree
- `app/__init__.py` : application factory, blueprints, CORS, JWT
- `app/config.py` : configuration, CORS, JWT, upload, commission
- `app/middleware/auth.py` : controle d'acces par role
- `app/routes/users.py` : auth, profil, freelancers, favoris, avis
- `app/routes/projects.py` : offres, candidatures, contrat, progression
- `app/routes/messages.py` : conversations, messages
- `app/routes/notifications.py` : notifications utilisateur
- `app/routes/payments.py` : escrow, wallet, retraits, litiges, PDF facture
- `app/routes/admin.py` : supervision admin

### 2.3 Base de donnees

Le projet repose sur MongoDB avec une modelisation par collections :

- `users`
- `freelancers`
- `categories`
- `projects`
- `applications`
- `conversations`
- `messages`
- `notifications`
- `favorites`
- `transactions`
- `payout_requests`
- `disputes`
- `subscriptions` et `plans` via le seed

### 2.4 Aspects transverses importants

- Authentification JWT avec persistance locale
- fallback `X-User-Id` cote backend pour resoudre l'identite
- separation des roles `client`, `freelancer`, `admin`
- notifications automatiques lors des candidatures, signatures, messages et paiements
- filtre PII dans la messagerie et les cover letters
- logique metier d'essai gratuit puis commission
- systeme d'escrow, litige, remboursement et generation de facture PDF

## 3. Modele fonctionnel reel du depot

### 3.1 Entites principales

#### Utilisateur

Champs importants :

- `name`, `email`, `password`
- `role`
- `trial_used`
- `is_active`

#### Profil freelancer

Champs importants :

- `title`, `bio`, `skills`, `hourly_rate`
- `location`, `languages`
- `education`, `experience`
- `portfolio`
- `rating`, `completed_jobs`, `earnings_total`

#### Projet / offre

Le depot implemente surtout la notion de projet publie par un client, plus proche de "offre" que de "gig".

Champs importants :

- `title`, `description`
- `budget_min`, `budget_max`
- `category_id`, `category_slug`
- `status`
- `accepted_freelancer`
- `agreed_amount`
- `contract`
- `progress_entries`
- `escrow_status`

#### Candidature / proposal

Champs importants :

- `project_id`
- `freelancer_id`
- `bid_amount`
- `cover_letter`
- `status`
- `net_amount`

## 4. Reponse technique par sprint

### Sprint 1 - Analyse, roles, navigation, modele de donnees

### Objectifs demandes

- analyse des besoins
- definition des roles
- wireframes Figma Auth, Profil Freelancer, Gigs, Messages
- schema de navigation
- modele de donnees

### Solution technique effectivement realisee

Le depot montre clairement que la phase d'analyse a ete traduite dans l'architecture du code :

- les roles sont formalises par les routes et middlewares dans `app/middleware/auth.py`
- la navigation mobile est definie dans `freelancehub-ionic/src/app/app.routes.ts`
- les contrats de donnees front sont centralises dans `freelancehub-ionic/src/app/shared/api.dto.ts`
- le decoupage par modules backend correspond aux grands cas d'usage : users, projects, messages, notifications, payments, admin

Les roles reels identifies dans le code sont :

- `client`
- `freelancer`
- `admin`

Le schema de navigation implementee couvre deja :

- accueil public
- authentification
- dashboard utilisateur
- publication d'offre
- detail d'un projet
- messagerie
- favoris
- notifications
- suivi d'avancement
- administration
- paiements

### Fichiers de reference

- `freelancehub-ionic/src/app/app.routes.ts`
- `freelancehub-ionic/src/app/shared/api.dto.ts`
- `freelancehub-backend/app/middleware/auth.py`
- `freelancehub-backend/app/__init__.py`

### Evaluation du sprint

Points conformes :

- roles clairement definis
- navigation coherente
- modele de donnees exploitable
- architecture front/back deja structuree

Ecart notable :

- aucun fichier Figma, wireframe ou prototype n'est versionne dans le depot

### Sprint 2 - Maquettes, authentification, profil freelancer

### Objectifs demandes

- maquettes haute fidelite
- authentification avec roles
- profil freelancer
- upload CV simule

### Solution technique effectivement realisee

L'authentification est bien implemente :

- page Ionic de connexion / inscription dans `auth.page.ts`
- choix du role a l'inscription
- route backend `POST /api/auth/register`
- route backend `POST /api/auth/login`
- hash du mot de passe avec `bcrypt`
- emission de `access_token` et `refresh_token`
- stockage local via `localStorage`

Le profil freelancer est egalement bien present :

- lecture du profil courant via `GET /api/users/me`
- mise a jour via `PUT /api/users/me`
- edition de bio, skills, langue, taux horaire, education, experience et portfolio
- synchronisation automatique du portfolio avec les projets termines

### Fichiers de reference

- `freelancehub-ionic/src/app/auth/auth.page.ts`
- `freelancehub-ionic/src/app/edit-profile/edit-profile.page.ts`
- `freelancehub-backend/app/routes/users.py`
- `freelancehub-ionic/src/app/auth/auth.guard.ts`
- `freelancehub-ionic/src/app/shared/api-url.ts`

### Evaluation du sprint

Points conformes :

- authentification par role fonctionnelle
- profil freelancer riche
- persistance de session correcte
- maquette UI deja soignee cote Ionic

Ecarts notables :

- le depot ne contient pas d'upload reel ou simule de CV PDF
- les statuts demandes `actif / en attente / bloque` ne sont pas couverts completement
- le code implemente surtout `is_active` et un blocage admin
- le workflow `draft -> pending -> approved/rejected` du profil freelancer n'apparait pas

### Sprint 3 - CRUD Gigs, validation admin, messagerie, MVP

### Objectifs demandes

- CRUD Gigs
- validation Admin avant publication
- messagerie simple
- livrable MVP

### Solution technique effectivement realisee

Le depot ne met pas en place un module "gigs" au sens Fiverr.
En revanche, il implemente un flux solide base sur les offres/projets :

- `GET /api/projects`
- `POST /api/projects`
- `PUT /api/projects/<id>`
- `DELETE /api/projects/<id>` en soft delete

Le cycle de candidature est complet :

- un freelancer propose un montant et un message via `POST /api/projects/<id>/apply`
- le client consulte les candidatures via `GET /api/projects/<id>/apply`
- le client accepte ou rejette via `PUT /api/projects/<id>/apply/<app_id>`
- si la candidature est acceptee, le projet passe automatiquement en `in-progress`

La messagerie simple est bien realisee :

- liste des conversations
- ouverture d'un thread
- creation d'une conversation
- envoi d'un message
- marquage lu / non lu
- notifications a la reception

Le MVP reel du depot peut donc etre formule ainsi :

1. un client se connecte
2. il publie une offre
3. un freelancer postule
4. le client accepte
5. les deux parties echangent par messagerie

### Fichiers de reference

- `freelancehub-backend/app/routes/projects.py`
- `freelancehub-backend/app/routes/messages.py`
- `freelancehub-backend/app/utils/notifications.py`
- `freelancehub-ionic/src/app/project-detail/project-detail.page.ts`
- `freelancehub-ionic/src/app/messages/messages.page.ts`
- `freelancehub-ionic/src/app/my-jobs/my-jobs.page.ts`

### Evaluation du sprint

Points conformes :

- CRUD principal sur les offres/projets
- cycle proposal/candidature complet
- messagerie fonctionnelle
- MVP exploitable de bout en bout

Ecarts notables :

- pas de CRUD dedie aux services/gigs crees par les freelancers
- pas de validation admin avant publication d'un gig ou d'un projet

### Sprint 4 - Offres, proposals, store mockup

### Objectifs demandes

- wireframes et maquettes pour Offres / Proposals
- wireframes et maquettes pour Store

### Solution technique effectivement realisee

Ce sprint correspond tres bien a l'evolution UX visible dans le front :

- `client-request` pour publier et relire les offres cote client
- `service-market` pour naviguer par categorie, filtrer projets et freelancers
- `project-detail` pour consulter une offre et soumettre une proposition
- `my-jobs` pour suivre les candidatures et missions par role
- `freelancer-profile` pour consulter un profil et laisser un avis

L'application va meme au-dela du simple wireframe en implementant deja des ecrans operationnels.

Des ajouts fonctionnels apparaissent dans ce perimetre :

- favoris
- avis clients sur freelancer
- tableaux de bord par role
- suivi d'avancement du projet

### Fichiers de reference

- `freelancehub-ionic/src/app/client-request/`
- `freelancehub-ionic/src/app/service-market/`
- `freelancehub-ionic/src/app/project-detail/`
- `freelancehub-ionic/src/app/my-jobs/`
- `freelancehub-ionic/src/app/freelancer-profile/`

### Evaluation du sprint

Points conformes :

- couverture UI forte pour les offres et propositions
- experience mobile coherente
- filtres, navigation et dashboards bien integres

Ecart notable :

- aucun module Store n'apparait encore dans le depot a ce stade

### Sprint 5 - Store, achat simule, telechargement

### Objectifs demandes

- store de produits numeriques
- liste des produits
- fiche produit
- achat simule
- telechargement avec Capacitor Filesystem

### Solution technique effectivement realisee

Le depot ne livre pas le Store demande.

En remplacement, il propose une brique paiement bien plus avancee que le sujet initial :

- calcul de commission
- essai gratuit sur le premier projet
- paiement client en escrow
- liberation du paiement
- remboursement admin
- ouverture et resolution de litige
- portefeuille freelancer
- demandes de retrait
- generation de facture PDF

Le detail projet cote front permet :

- previsualisation de commission
- placement de l'argent en escrow
- liberation du paiement en fin de mission

Le module paiements ajoute donc une vraie profondeur metier, mais il ne couvre pas le besoin Store.

### Fichiers de reference

- `freelancehub-backend/app/routes/payments.py`
- `freelancehub-ionic/src/app/payments/payments.page.ts`
- `freelancehub-ionic/src/app/project-detail/project-detail.page.ts`

### Evaluation du sprint

Points forts techniques :

- logique escrow complete
- modele commission clair
- factures PDF generees sans service externe
- gestion des litiges et retraits

Ecarts majeurs par rapport au cahier des charges :

- aucune collection `products` ou `store`
- aucune page produit ou fiche produit
- aucun achat de produit numerique
- aucune integration `@capacitor`
- aucune utilisation de `Capacitor Filesystem`

### Sprint 6 - Admin avance, UX, APK final

### Objectifs demandes

- admin avance pour produits, offres, stats
- optimisation UX
- APK final

### Solution technique effectivement realisee

L'administration est partiellement bien couverte :

- dashboard overview avec KPI
- liste des utilisateurs
- blocage / activation utilisateur
- liste des projets
- suivi des transactions
- suivi des demandes de retrait
- supervision des escrows a liberer

L'optimisation UX est visible dans plusieurs zones :

- design system global dans `src/global.scss`
- dashboards role-based sur `home`, `my-jobs`, `payments`, `admin-dashboard`
- navigation basse simplifiee
- composants compte partages
- responsive design et safe-area mobile

Un document de synthese UX existe aussi :

- `UI_UX_IMPROVEMENTS.md`

### Fichiers de reference

- `freelancehub-backend/app/routes/admin.py`
- `freelancehub-ionic/src/app/admin-dashboard/admin-dashboard.page.ts`
- `freelancehub-ionic/src/app/home/`
- `freelancehub-ionic/src/app/shared/user-bottom-nav.component.ts`
- `freelancehub-ionic/src/global.scss`

### Evaluation du sprint

Points conformes :

- statistiques admin
- moderation des utilisateurs
- supervision paiements / retraits
- amelioration UX nette

Ecarts notables :

- pas de moderation de produits puisque le Store n'existe pas
- pas de validation admin dediee aux gigs
- aucun APK final n'est stocke dans le depot

## 5. Elements techniques distinctifs du projet

Le depot contient plusieurs solutions techniques interessantes, parfois au-dela du cahier des charges :

- architecture Flask propre avec application factory
- front Angular moderne en composants standalone
- DTO centralises cote mobile
- gestion multi-role coherente
- systeme de notifications transverse
- filtre PII avec regles regex et fallback LLM optionnel
- workflow contrat -> signature -> paiement -> progression -> cloture
- logique escrow, retraits, litiges, facture PDF

## 6. Bilan de couverture fonctionnelle

### Fonctionnalites conformes ou proches du sujet

- authentification et roles
- profils freelancers
- offres et propositions
- messagerie
- administration
- UX mobile soignee

### Fonctionnalites partiellement couvertes

- gestion des statuts utilisateur
- moderation admin
- documentation design
- livraison finale mobile

### Fonctionnalites absentes du depot

- gigs / services freelancers avec validation admin avant publication
- store de produits numeriques
- achat simule de produits
- telechargement via Capacitor Filesystem
- upload CV PDF
- APK final versionne
- Figma versionne dans le depot

## 7. Conclusion generale

FreelanceHub est techniquement un projet plus mature sur le flux "offres freelance + candidatures + messagerie + contrat + escrow + admin" que sur le flux "gigs + store numerique" demande dans l'enonce.

Autrement dit :

- la base mobile hybride Ionic est reussie
- le backend Flask + MongoDB est bien structure
- le parcours client/freelancer principal fonctionne
- le projet diverge du sujet initial sur deux blocs majeurs : les gigs et le Store

Si le but est de presenter le depot tel qu'il existe reellement, la formulation la plus juste est :

"Le projet livre une marketplace freelance orientee offres, candidatures, messagerie, suivi de mission et paiements escrow, avec une administration partielle. Les modules Gigs valides par admin et Store numerique avec Capacitor ne sont pas encore implementes dans la version actuelle du depot."

## 8. Recommandations pour alignement complet avec le cahier des charges

Priorite 1 :

- creer une collection `products`
- ajouter les routes `store` et `products`
- ajouter les pages Ionic liste produit / detail produit / achat
- integrer `@capacitor/filesystem` pour le telechargement

Priorite 2 :

- creer un vrai module `gigs` distinct de `projects`
- permettre au freelancer de publier un service
- ajouter un workflow admin `pending -> approved/rejected`

Priorite 3 :

- ajouter un upload CV PDF reel
- produire et archiver l'APK final
- rattacher les maquettes Figma a la documentation finale
