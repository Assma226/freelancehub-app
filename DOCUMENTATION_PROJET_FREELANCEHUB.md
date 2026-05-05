# Documentation Generale du Projet FreelanceHub

## 1. Presentation generale

FreelanceHub est une application mobile/web de mise en relation entre deux types d'utilisateurs:

- le `client`, qui publie un projet et recrute un freelancer
- le `freelancer`, qui consulte les projets, postule, discute avec le client et suit l'avancement de la mission

Le projet est compose de deux grandes parties:

- un `frontend` developpe avec `Angular 20 + Ionic 8`
- un `backend` developpe avec `Flask + MongoDB`

L'objectif fonctionnel est de couvrir le cycle complet d'une mission freelance:

1. inscription et connexion
2. publication d'un projet
3. consultation des freelancers et des categories
4. candidature sur un projet
5. acceptation ou refus de la candidature
6. creation d'un accord de mission
7. messagerie entre client et freelancer
8. suivi d'avancement du projet
9. notifications
10. favoris

Le projet integre aussi une logique metier importante: `essai gratuit pour le premier projet`, puis `commission de plateforme`, ainsi qu'un systeme de `plans d'abonnement`.

---

## 2. Idee et demarche generale

La demarche generale du projet est la suivante:

- construire une place de marche de services freelance
- separer clairement le front et le back
- exposer des API REST cote backend
- consommer ces API cote frontend avec `fetch`
- utiliser `MongoDB` pour stocker des donnees flexibles: utilisateurs, projets, candidatures, messages, favoris, notifications, abonnements

La logique du projet repose sur une architecture simple:

- le `frontend` gere l'affichage, la navigation, les formulaires et l'experience utilisateur
- le `backend` gere les regles metier, la securite, les verifications et l'acces a la base
- la `base MongoDB` stocke l'etat des utilisateurs et des interactions

Cette demarche est adaptee a un projet academique parce qu'elle permet de montrer:

- une architecture moderne en couches
- une authentification par token
- des roles utilisateur
- des operations CRUD
- des flux metier complets
- une base NoSQL avec relations gerees par references

---

## 3. Architecture globale

## 3.1 Frontend

Le frontend se trouve dans `freelancehub-ionic/`.

Technologies:

- `Angular 20`
- `Ionic 8`
- composants `standalone`
- `Angular Router`
- `localStorage` pour conserver la session

Role du frontend:

- afficher les pages
- recuperer les donnees depuis l'API
- envoyer les formulaires au backend
- proteger certaines routes avec un `authGuard`
- stocker localement le token JWT et l'utilisateur connecte

Les principales pages sont:

- `welcome`
- `auth`
- `home`
- `client-request`
- `service-market`
- `project-detail`
- `my-jobs`
- `messages`
- `notifications`
- `favorites`
- `project-progress`
- `edit-profile`
- `freelancer-profile`

## 3.2 Backend

Le backend se trouve dans `freelancehub-backend/`.

Technologies:

- `Flask`
- `Flask-PyMongo`
- `Flask-JWT-Extended`
- `Flask-CORS`
- `bcrypt`
- `MongoDB Atlas`

Role du backend:

- gerer l'authentification
- appliquer les regles metier
- verifier les roles
- exposer les API REST
- lire et ecrire dans MongoDB
- creer des notifications

Structure backend:

- `run.py` : point d'entree de l'application
- `app/__init__.py` : factory Flask + initialisation extensions + blueprints
- `app/config.py` : configuration
- `app/middleware/auth.py` : securite et verification des roles
- `app/routes/` : routes API
- `app/utils/notifications.py` : creation et serialisation des notifications

## 3.3 Base de donnees

Le projet utilise `MongoDB`, une base `NoSQL orientee documents`.

Pourquoi MongoDB est pertinent ici:

- les profils freelancers ont des champs variables
- les projets contiennent des sous-structures comme `contract` et `progress_entries`
- les relations peuvent etre gerees par `ObjectId`
- c'est souple pour un projet evolutif

---

## 4. Initialisation de l'application

Au demarrage:

1. `run.py` appelle `create_app()`
2. `create_app()` charge la configuration selon l'environnement
3. Flask initialise:
   - `PyMongo`
   - `JWTManager`
   - `CORS`
4. les blueprints sont enregistres sous le prefixe `/api`
5. une route `/api/health` permet de verifier que l'API et MongoDB fonctionnent

Cette approche s'appelle `Application Factory Pattern`.

Pourquoi c'est bien:

- facilite la maintenance
- facilite les tests
- separe creation de l'app et execution

---

## 5. Gestion de l'authentification et des roles

Le projet utilise principalement `JWT` pour l'authentification.

Fonctionnement:

1. l'utilisateur s'inscrit ou se connecte
2. le backend cree un `access_token` et un `refresh_token`
3. le frontend stocke le token dans `localStorage`
4. les requetes authentifiees envoient:
   - `Authorization: Bearer <token>`
   - et aussi `X-User-Id`

Le backend sait ensuite quel utilisateur effectue l'action.

Roles geres:

- `client`
- `freelancer`

Decorateurs de protection:

- `token_required`
- `client_only`
- `freelancer_only`

Exemples:

- seul un client peut creer un projet
- seul un freelancer peut postuler a un projet
- seuls les participants d'une conversation peuvent lire ses messages

---

## 6. Structure des API backend

Les principaux modules API sont:

- `/api/auth`
- `/api/users`
- `/api/projects`
- `/api/categories`
- `/api/payments`
- `/api/messages`
- `/api/notifications`

### 6.1 Auth

Fonctions principales:

- inscription
- connexion
- rafraichissement du token

Points techniques:

- validation email
- hash du mot de passe avec `bcrypt`
- verification du role
- creation automatique d'un profil freelancer si le role est `freelancer`

### 6.2 Users

Fonctions principales:

- recuperer son profil
- modifier son profil
- lister les freelancers
- consulter un freelancer
- voir ses candidatures
- gerer ses favoris
- poster un avis sur un freelancer

Le backend enrichit certains champs pour faciliter l'affichage mobile, par exemple:

- `hourlyRate`
- `completedJobs`
- `reviews`

### 6.3 Projects

C'est le coeur metier du projet.

Fonctions principales:

- lister les projets avec filtres et pagination
- creer un projet
- consulter un projet
- modifier et supprimer logiquement un projet
- postuler a un projet
- lister les candidatures
- accepter ou refuser une candidature
- changer le statut du projet
- gerer le contrat
- gerer le suivi d'avancement
- lister les projets du client ou du freelancer

Les statuts principaux d'un projet sont:

- `open`
- `in-progress`
- `completed`
- `cancelled`

### 6.4 Categories

Fonctions principales:

- lister les categories avec compteurs
- afficher le detail d'une categorie
- creer, modifier, desactiver une categorie

Le module calcule:

- nombre de projets ouverts
- nombre de freelancers disponibles
- budget moyen

### 6.5 Payments

Ce module simule la logique economique de la plateforme.

Fonctions principales:

- calcul de commission
- paiement d'un projet
- abonnement a un plan
- historique des transactions
- statut de l'abonnement

Logique metier:

- premier projet: `0% commission`
- ensuite: `5% client + 5% freelancer`
- plans possibles: `free-trial`, `basic`, `pro`

### 6.6 Messages

Fonctions principales:

- lister les conversations
- afficher les messages d'une conversation
- envoyer un message
- creer une nouvelle conversation

Le systeme marque aussi les messages comme lus.

### 6.7 Notifications

Fonctions principales:

- lister les notifications
- marquer une notification comme lue
- tout marquer comme lu

Les notifications sont creees automatiquement lors d'evenements metier:

- nouvelle candidature
- reponse a une candidature
- nouveau message
- signature de contrat
- avancement du projet

---

## 7. Modele de donnees principal

Les principales collections MongoDB identifiees dans le code et dans `seed_v2.js` sont:

- `users`
- `freelancers`
- `projects`
- `applications`
- `reviews`
- `categories`
- `conversations`
- `messages`
- `notifications`
- `favorites`
- `transactions`
- `subscriptions`
- `plans`

### 7.1 Collection users

Contient:

- nom
- email
- mot de passe hash
- role
- avatar
- telephone
- indicateur `trial_used`
- dates de creation et mise a jour

### 7.2 Collection freelancers

Contient:

- reference `user_id`
- titre
- bio
- competences
- tarif horaire
- localisation
- disponibilite
- note
- nombre d'avis
- jobs completes
- langues
- education
- experience
- portfolio

### 7.3 Collection projects

Contient:

- `client_id`
- titre
- description
- budget min et max
- categorie
- statut
- freelancer accepte
- montant convenu
- historique des statuts
- contrat
- entrees de progression

Le choix de MongoDB est tres utile ici car:

- `contract` est un sous-document
- `progress_entries` est un tableau de sous-documents
- `status_history` est un tableau de sous-documents

### 7.4 Collection applications

Contient:

- `project_id`
- `client_id`
- `freelancer_id`
- montant de l'offre
- commission
- montant net
- lettre de motivation
- statut de candidature

### 7.5 Collections conversations et messages

`conversations` contient la liste des participants.

`messages` contient:

- `conversation_id`
- `sender_id`
- texte
- statut de lecture
- date

### 7.6 Collections economiques

- `plans` : definition des offres
- `subscriptions` : abonnement actif d'un utilisateur
- `transactions` : historique des paiements

---

## 8. Fonctionnement du frontend

Le frontend Angular/Ionic fonctionne avec des composants `standalone`.

### 8.1 Routage

Le fichier de routage declare les pages et applique `authGuard` sur les pages reservees.

Exemples de routes protegees:

- `/home`
- `/client-request`
- `/my-jobs`
- `/messages`
- `/notifications`
- `/favorites`
- `/project-progress`
- `/edit-profile`

### 8.2 Gestion de session

Le frontend stocke dans `localStorage`:

- `fh_token`
- `fh_user`
- `fh_api_base`

Avantage:

- implementation simple
- pratique pour un prototype

Limite:

- `localStorage` est moins securise qu'un stockage via cookies `HttpOnly`

### 8.3 Communication avec l'API

Le frontend n'utilise pas `HttpClient Angular`, mais `fetch`.

Cela reste valable techniquement, mais il faut savoir l'expliquer:

- `fetch` simplifie la logique
- moins de couche supplementaire
- mais on perd certains avantages Angular comme les interceptors HTTP

### 8.4 Pages majeures

#### Home

Affiche:

- categories
- projets ouverts
- compteurs de notifications et messages

#### Client Request

Permet au client de:

- publier un projet
- voir ses projets
- rechercher des freelancers

#### Service Market

Permet:

- filtrage des projets
- filtrage des freelancers
- navigation par categorie

#### Project Detail

Permet:

- consulter un projet
- postuler
- changer le statut
- gerer le contrat
- gerer la progression
- ajouter en favori

#### My Jobs

Vue differente selon le role:

- pour le freelancer: ses candidatures
- pour le client: ses projets et les candidats

#### Messages

Permet la communication directe entre deux utilisateurs.

#### Edit Profile

Permet de modifier:

- donnees personnelles
- competences
- education
- experience
- portfolio

---

## 9. Flux metier principal

### Cas 1: creation et traitement d'un projet

1. le client se connecte
2. il cree un projet
3. le projet est stocke dans `projects` avec statut `open`
4. les freelancers consultent les projets
5. un freelancer postule
6. une candidature est enregistree dans `applications`
7. le client voit les candidatures
8. il accepte une candidature
9. le projet passe en `in-progress`
10. le freelancer retenu est associe au projet
11. les autres candidatures sont rejetees automatiquement

### Cas 2: contrat et suivi

1. le client redige les termes du contrat
2. le contrat est enregistre dans le projet
3. le freelancer signe
4. le projet peut ensuite etre suivi avec des entrees de progression
5. le client voit l'avancement, les heures et les blocages

### Cas 3: messagerie

1. un utilisateur ouvre une conversation
2. si elle n'existe pas, elle est creee
3. les messages sont stockes dans `messages`
4. le destinataire recoit une notification

### Cas 4: favoris

L'utilisateur peut ajouter un:

- projet
- freelancer

Les favoris sont stockes dans une collection separee, ce qui evite de dupliquer les donnees.

---

## 10. Choix techniques importants a expliquer

### 10.1 Pourquoi Flask?

- leger
- simple a comprendre
- rapide a mettre en place
- tres adapte a une API REST pour projet scolaire

### 10.2 Pourquoi Angular + Ionic?

- Angular structure bien une application complexe
- Ionic facilite la creation d'une interface mobile
- le meme code peut viser une experience proche du mobile

### 10.3 Pourquoi MongoDB?

- donnees heterogenes
- profils freelancers riches et variables
- sous-documents utiles pour contrat et progression
- souplesse de schema

### 10.4 Pourquoi JWT?

- authentification stateless
- bien adaptee aux API REST
- facile a utiliser entre frontend et backend separes

### 10.5 Pourquoi separer front et back?

- meilleure maintenance
- responsabilites claires
- possibilite de changer l'un sans casser l'autre
- facilite le travail en equipe

---

## 11. Questions techniques que le professeur peut poser

Voici les questions les plus probables, avec des reponses courtes que vous pouvez reprendre a l'oral.

### 11.1 Question: quelle est l'architecture de votre projet?

Reponse:
Le projet suit une architecture client-serveur. Le frontend Angular/Ionic gere l'interface et le backend Flask expose des API REST. MongoDB stocke les donnees sous forme de documents. Le frontend consomme les endpoints `/api/...` pour afficher ou modifier les donnees.

### 11.2 Question: pourquoi avoir choisi MongoDB au lieu d'une base relationnelle?

Reponse:
Parce que les profils freelancers, les contrats et le suivi de projet ont des structures flexibles. MongoDB permet de stocker facilement des tableaux et des sous-documents sans schema rigide, par exemple `progress_entries` et `contract`.

### 11.3 Question: comment gerez-vous l'authentification?

Reponse:
Le backend genere un token JWT a la connexion. Le frontend le stocke dans `localStorage` et l'envoie dans l'en-tete `Authorization`. Le backend verifie ce token pour autoriser l'acces aux routes protegees.

### 11.4 Question: comment differenciez-vous client et freelancer?

Reponse:
Chaque utilisateur a un champ `role`. Ensuite, le backend applique des decorateurs comme `client_only` ou `freelancer_only` pour restreindre certaines routes.

### 11.5 Question: comment protege-t-on une route cote frontend?

Reponse:
Avec `authGuard`. Si aucun token n'est present, l'utilisateur est redirige vers `/auth`.

### 11.6 Question: comment protege-t-on une route cote backend?

Reponse:
Avec des decorateurs comme `token_required`, puis des verifications de role et de propriete. Par exemple, un client ne peut modifier qu'un projet qui lui appartient.

### 11.7 Question: comment fonctionne le cycle d'un projet?

Reponse:
Le projet commence en `open`, puis passe en `in-progress` quand une candidature est acceptee. Ensuite il peut devenir `completed` ou `cancelled`. Un historique de statut est conserve.

### 11.8 Question: comment gerer les relations dans MongoDB?

Reponse:
Avec des `ObjectId`. Par exemple, un projet contient `client_id`, une candidature contient `project_id` et `freelancer_id`. On fait ensuite des recherches manuelles entre collections.

### 11.9 Question: pourquoi avez-vous utilise `bcrypt`?

Reponse:
Pour ne jamais stocker les mots de passe en clair. `bcrypt` hash le mot de passe avec salage, ce qui augmente la securite.

### 11.10 Question: comment fonctionne la messagerie?

Reponse:
Une collection `conversations` stocke les participants, et une collection `messages` stocke les messages. Quand un message est envoye, une notification est creee pour l'autre utilisateur.

### 11.11 Question: comment fonctionne le suivi d'avancement?

Reponse:
Le projet contient un tableau `progress_entries`. Chaque entree ajoute un resume, des heures, des taches, un pourcentage et d'eventuels blocages. Le backend recalcule ensuite les indicateurs globaux.

### 11.12 Question: comment gerez-vous les notifications?

Reponse:
Les notifications sont creees par le backend lors d'evenements importants, puis listees dans une collection dediee. Le frontend peut les afficher et les marquer comme lues.

### 11.13 Question: comment gerez-vous les favoris?

Reponse:
On ne modifie pas directement les documents projets ou freelancers. On cree une collection `favorites` avec `user_id`, `entity_type` et `entity_id`.

### 11.14 Question: comment fonctionne le systeme de commission?

Reponse:
Le premier projet peut etre gratuit via `trial_used = false`. Ensuite le backend applique une commission. Les montants client, freelancer et revenu plateforme sont calcules cote serveur.

### 11.15 Question: pourquoi le calcul de commission doit-il etre fait dans le backend?

Reponse:
Parce que la logique metier ne doit pas dependre du frontend. Si on la laisse seulement cote client, elle serait facile a contourner.

### 11.16 Question: comment gerez-vous la pagination?

Reponse:
Le backend lit `page` et `page_size`, applique `skip` et `limit`, puis renvoie aussi `total` et `pages`.

### 11.17 Question: quelle difference entre validation frontend et backend?

Reponse:
Le frontend valide pour l'experience utilisateur. Le backend valide pour la securite et l'integrite des donnees. Meme si le frontend est contourne, le backend doit rester correct.

### 11.18 Question: pourquoi avez-vous choisi une API REST?

Reponse:
Parce qu'elle est simple, standard, lisible et bien adaptee a la communication entre une app Angular/Ionic et un backend Flask.

### 11.19 Question: qu'est-ce qu'un blueprint Flask?

Reponse:
C'est un moyen de modulariser les routes. Au lieu d'avoir un seul gros fichier, on separe les routes par domaine: users, projects, messages, payments, etc.

### 11.20 Question: qu'est-ce que l'Application Factory?

Reponse:
C'est un pattern Flask ou l'application est creee dans une fonction `create_app()`. Cela rend le projet plus propre et plus facile a configurer selon les environnements.

### 11.21 Question: pourquoi avoir utilise des composants standalone dans Angular?

Reponse:
Parce que c'est la direction moderne d'Angular. Cela allege la structure et evite de multiplier les modules classiques.

### 11.22 Question: pourquoi utilisez-vous `fetch` et pas `HttpClient`?

Reponse:
Pour garder une implementation simple et directe. C'est suffisant pour ce projet, meme si `HttpClient` serait plus evolutif pour une grande application.

### 11.23 Question: comment assurez-vous qu'un freelancer ne peut pas postuler deux fois?

Reponse:
Le backend verifie s'il existe deja une candidature pour ce `project_id` et ce `freelancer_id` avant d'inserer une nouvelle candidature.

### 11.24 Question: comment assurez-vous qu'un utilisateur ne voit que ses messages?

Reponse:
Le backend verifie que son `ObjectId` est bien present dans `participants` de la conversation.

### 11.25 Question: quelle est la difference entre `users` et `freelancers`?

Reponse:
`users` contient les informations communes a tous les comptes. `freelancers` contient les informations specialisees du role freelancer comme les competences, le portfolio et le tarif horaire.

---

## 12. Points forts du projet

- architecture separee frontend/backend
- gestion de roles utilisateur
- authentification JWT
- API REST bien decoupee
- fonctionnalites metier riches
- gestion des candidatures
- contrat de mission
- suivi de progression
- messagerie
- notifications
- favoris
- logique economique avec commission et abonnement

---

## 13. Limites techniques et points a assumer devant le professeur

Il est tres important de ne pas presenter le projet comme parfait. Dire les limites montre de la maturite technique.

### 13.1 Securite perfectible

Points sensibles observes:

- des identifiants MongoDB sont ecrits en dur dans le code de configuration et dans le seed
- le frontend stocke le JWT dans `localStorage`
- le backend accepte aussi `X-User-Id`, ce qui simplifie les tests mais est moins strict qu'une authentification JWT pure

Ce que vous pouvez dire:
Pour un projet academique, cela a accelere le developpement. En production, il faudrait deplacer tous les secrets dans des variables d'environnement, supprimer la dependance a `X-User-Id` et utiliser une gestion de session plus securisee.

### 13.2 Absence d'index MongoDB explicites

Le code ne cree pas d'index pour les recherches frequentes.

Impact:

- performances moins bonnes si les donnees grandissent

Amelioration:

- index sur `email`, `project_id`, `freelancer_id`, `participants`, `user_id`, `status`

### 13.3 Pas de couche service frontend

Le frontend appelle `fetch` directement dans les pages.

Impact:

- code plus rapide a ecrire
- mais moins reutilisable et moins testable

Amelioration:

- centraliser les appels dans des services Angular

### 13.4 Pas de tests automatises visibles

Le projet ne montre pas de suite de tests backend ou frontend.

Amelioration:

- tests unitaires
- tests d'integration API
- tests de composants Angular

### 13.5 Transactions metier simplifiees

Certaines operations touchent plusieurs collections sans transaction MongoDB explicite.

Impact:

- risque d'incoherence en cas d'erreur en plein milieu

Amelioration:

- utiliser des transactions MongoDB si le cluster et le contexte le permettent

---

## 14. Ce que le professeur peut demander comme ameliorations futures

- ajouter un vrai systeme de paiement en ligne
- ajouter un chat temps reel avec WebSocket
- ajouter une authentification plus securisee
- ajouter des tests automatises
- ajouter un tableau de bord admin
- ajouter des index MongoDB
- ajouter une couche service cote Angular
- ajouter la gestion des fichiers et pieces jointes
- ajouter des appels video

---

## 15. Conclusion

FreelanceHub est un projet complet de marketplace freelance qui montre:

- une application front moderne en Angular/Ionic
- une API REST backend en Flask
- une base MongoDB adaptee aux donnees flexibles
- une vraie logique metier avec roles, projets, candidatures, contrats, progression, messagerie, notifications et paiements

Le projet est interessant pedagogiquement parce qu'il ne se limite pas a du CRUD simple. Il met en oeuvre plusieurs concepts importants du developpement full stack:

- architecture client-serveur
- authentification
- gestion des roles
- modelisation NoSQL
- orchestration de flux metier
- experience utilisateur mobile

Si vous presentez ce projet a l'oral, il faut insister sur:

- la separation claire entre frontend et backend
- le cycle de vie complet d'un projet freelance
- la logique de commission et d'abonnement
- les choix techniques faits pour aller vite tout en restant structure
- les limites connues et les ameliorations possibles

---

## 16. Resume ultra-court pour l'oral

Si le professeur demande un resume rapide, vous pouvez dire:

`Notre projet est une plateforme freelance full stack. Le frontend est en Angular/Ionic et le backend en Flask avec MongoDB. Un client peut publier un projet, un freelancer peut postuler, le client peut accepter une candidature, creer un contrat, suivre l'avancement, discuter via messagerie et recevoir des notifications. Nous avons aussi implemente une logique metier de commission et d'abonnement.`
