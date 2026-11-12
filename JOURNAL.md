# JOURNAL DU PROJET : Plateforme Achats · Engineering · Project Master

Règle : après chaque modification, ajouter une ligne datée dans la section du sujet (version + décision + raison).
Pour travailler sur un sujet, lire sa section et celles listées dans « Liens ». Ne pas relire tout le fichier.

| Sujet | Liens |
|---|---|
| 1. Stockage et sauvegarde | 2, 4, 5, 7, 9 |
| 2. Achats | 1, 3, 4, 9 |
| 3. Budget | 2, 7 |
| 4. Achats+ (workflow, livraisons, fournisseurs) | 1, 2, 9 |
| 5. Engineering | 1, 6, 7 |
| 6. Export Word | 5 |
| 7. Project Master | 1, 3, 5, 8 |
| 8. Planning et rapports | 2, 7, 9 |
| 9. Accueil et recherche | 1, 2, 4, 7 |
| 10. Mobile et thème | tous |
| 11. Tests et méthode | tous |
| 12. À faire | |

Repères dans `plateforme.html` (V1) : stockage étendu l. 5-57 · CSS l. 61-382 (mobile l. 307) · HTML Achats l. 395-670 ·
HTML Engineering l. 674-1030 · HTML Project Master l. 1035-1320 · script principal l. 1323-8339 (Achats → l. 3271,
Engineering l. 3272-5070 dont Réception l. 4724, Project Master l. 5071-8113, fichier plateforme l. 8114) · Accueil l. 8341-9098 · Achats+
l. 9100-9756 · Planning et rapport l. 9758-10205 · Statistiques, Reports, harmonisation l. 10207-10503.

## 1. Stockage et sauvegarde
- 2026-11-12, V1 : état de départ. Les grosses clés (`eng_db`, `pm_db`, `suivi_autosave`, et toute valeur > 200 000 caractères) passent de localStorage vers IndexedDB `plateforme_store` (l. 5-57), via une surcharge de `Storage.prototype`. L'initialisation des apps (DOMContentLoaded) attend le chargement de ces données. Raison : localStorage (~5 Mo) était saturé par les images.
- 2026-11-12, V1 : autres clés localStorage : `suivi_settings`, `hp_user`, `hp_suppliers`, `hp_last_backup`, `pm_theme`, `pm-root-path`, `pm_*_template`, `gt_closed`. Pièces jointes dans IndexedDB `hp_files` (l. 9214), dossiers projet dans IndexedDB `pm_fs` (l. 7905).
- 2026-11-12, V1 : « Fichier plateforme » = un `platform_data.zip` lié par l'API File System Access (l. 8114+, sauvegarde auto des 3 apps). Firefox/Safari n'ont pas cette API : repli par export manuel (l. 8788).
- 2026-11-12, V2 (en préparation) : passage à Firebase — Firestore pour les données (achats, budgets, projets, Engineering), Firebase Storage pour les images et pièces jointes. Forfait Blaze accepté par l'utilisateur. Raison : mêmes données sur tous les appareils et travail en équipe ; Storage exige Blaze pour un nouveau projet.
- 2026-11-12, V2 (en préparation) : garder le fonctionnement hors ligne (copie locale Firestore, resynchronisation ensuite). Raison : demandé par l'utilisateur.
- 2026-11-12, V2 (en préparation) : **ne jamais mettre un gros objet entier dans un document Firestore** : limite 1 Mo par document. Découper par enregistrement (un achat = un document) ; images en Storage. Raison : `eng_db` contient des images et dépasse déjà la limite de localStorage.
- 2026-11-12, V2 : synchronisation Firebase ajoutée en couche greffée à la fin du fichier (l. 10504-11125). Les apps écrivent toujours dans localStorage ; la couche enveloppe `Storage.prototype.setItem/removeItem` et envoie les changements 1,2 s après la dernière écriture. Raison : ne pas toucher au code des 3 apps (même méthode que les autres couches greffées).
- 2026-11-12, V2 : découpage en documents Firestore sous `app/<clé>/r/<id>` : un achat = un document (`r:<id>`), un projet / une solution / un client… = un document (`<tableau>:<id>`), une fiche fournisseur = un document (`k:<nom>`), le reste de chaque base dans `_main`. Clés synchronisées : `suivi_autosave`, `suivi_settings` (budgets découpés), `eng_db`, `pm_db`, `hp_suppliers`, `pm_folder_template_v4`, `pm_prod_template`, `pm_equip_template`. Non synchronisées (propres au poste) : `hp_user`, `pm_theme`, `pm-root-path`, `gt_closed`, `hp_last_backup`. Raison : limite de 1 Mo par document, et deux personnes peuvent modifier deux enregistrements différents sans s'écraser.
- 2026-11-12, V2 : au-delà de 900 000 caractères, un document est coupé en morceaux (`<id>~1`, `<id>~2`…), réassemblés à la réception ; les morceaux en trop sont effacés quand l'enregistrement rétrécit. Raison : respecter la limite de 1 Mo même pour un gros projet.
- 2026-11-12, V2 : images (`data:image…` dans `specHtml`, `branding.logo`, photos BOM, photos de réception) remplacées dans Firestore par un jeton `fbimg:<empreinte>` et envoyées dans Storage `app/img/<empreinte>` ; à la réception, elles redeviennent des data URL (cache IndexedDB `fb_sync`). Pièces jointes Achats+ (`hp_files`) envoyées dans Storage `app/files/<id>` et téléchargées sur les autres postes. Raison : les apps et l'export Word attendent des data URL ; les images ne tiennent pas dans un document.
- 2026-11-12, V2 : **ne jamais retirer le garde-fou d'effacement de masse** (l. 10731) : si une seule sauvegarde efface ≥ 3 enregistrements et tous ceux d'une base, ou ≥ 10 et plus de la moitié, une confirmation est demandée ; « Annuler » reprend les données de l'équipe. Raison : une base vidée par erreur sur un poste (import vide, bouton « Ignorer ») aurait effacé les données de toute l'équipe. Mesuré au test 8.
- 2026-11-12, V2 : en cas de modification du même enregistrement sur deux postes, la modification locale en attente est envoyée et gagne (dernier qui enregistre). Une modification reçue d'un autre poste remplace l'enregistrement local seulement s'il n'a pas été modifié localement depuis la dernière synchro. Raison : simple et prévisible ; pas de fusion champ par champ.
- 2026-11-12, V2 : état local de la synchro dans localStorage : `fb_base` (empreintes du dernier état commun), `fb_parts`, `fb_dirty` (bases à envoyer), `fb_up` (images/pièces jointes déjà envoyées), `fb_init` (première synchro faite pour ce projet). Raison : reprendre après fermeture de la page ou hors ligne.
- 2026-11-12, V2 : hors ligne, la copie locale reste utilisable ; Firestore garde la file d'attente (`enablePersistence`), nouvel essai toutes les 30 s et au retour du réseau.

## 2. Achats
- 2026-11-12, V1 : état de départ. Types CAPEX, OPEX, « Costumer » (orthographe d'origine, à ne pas corriger sans vérifier les données existantes). CAPEX et Costumer exigent un budget et des lignes (immos ou lignes client) (validation l. 2021+). Liste paginée par 15, import/export CSV.
- 2026-11-12, V2 : les achats sans `id` (anciennes données) reçoivent un identifiant `ID<date>_<n><aléatoire>` à la première synchro. Raison : impossible de synchroniser un enregistrement sans identifiant.
- 2026-11-12, V2 : après une fusion entre postes, deux achats peuvent avoir le même numéro `line` ; ils sont renumérotés à la prochaine suppression (comportement existant de `confirmDel`). Raison : renuméroter tout de suite réécrirait tous les achats.
- 2026-11-12, V2 : à la réception d'achats ou de paramètres d'un autre poste, la liste, les compteurs, les listes déroulantes (filtres conservés) et la page Budget/Paramètres ouverte sont redessinés automatiquement.

## 3. Budget
- 2026-11-12, V1 : état de départ. Page Budget Follow Up : cartes, tableau dépliable 2 niveaux (budget → immo → achats), export Excel. Onglet Budget aussi dans la fiche projet de Project Master (l. 8824).

## 4. Achats+ (workflow, livraisons, fournisseurs)
- 2026-11-12, V1 : état de départ. Module greffé sans modifier l'app Achats (l. 9100-9756) : workflow d'approbation, page Livraisons, page Fournisseurs avec historique de prix, pièces jointes, traçabilité créé/modifié par.

## 5. Engineering
- 2026-11-12, V1 : état de départ. Projets, bibliothèque de solutions (import JSON), réception, entreprises, paramètres, éditeur riche avec images redimensionnables, mode opératoire (bibliothèque d'opérations). Lien vers les projets et produits de Project Master (l. 3897).
- 2026-11-12, V2 : à la réception de changements Engineering ou Project Master, l'écran n'est pas redessiné tout seul (un formulaire peut être ouvert) : un bandeau « Données mises à jour par l'équipe — Actualiser l'affichage » apparaît. Les données en mémoire (`engDB`, `pmDB`) sont déjà à jour, donc un enregistrement n'écrase pas les changements reçus sur les autres fiches. Raison : ne pas fermer un formulaire en cours de saisie.

## 6. Export Word
- 2026-11-12, V1 : état de départ. Export .docx avec la librairie docx 8.5.0 (l. 4343), mise en page réglable dans « Mise en page Doc » (l. 4311). Librairies chargées à la demande avec CDN de secours (l. 1535).

## 7. Project Master
- 2026-11-12, V1 : état de départ. Dashboard, projets, plan d'actions (import JSON, l. 5524), clients, product lines, volumes, capacité, besoin, BOM multi-niveaux, outils & suivi (export Excel l. 7217), jalons glissables, dossiers projet automatiques (l. 7863).
- 2026-11-12, V2 : les exemples créés au premier lancement (Engineering : Akwel Automotive + types Sensor/Cylinder/Pressure ; Project Master : FORD/STELLANTIS/RENAULT + 4 product lines) ne sont pas fusionnés avec ceux de l'équipe sur un nouveau poste (`seedOnly`, l. 10658). Raison : sinon chaque nouveau poste ajoutait des doublons et posait la question de fusion à tort (constaté au test 2).

## 8. Planning et rapports
- 2026-11-12, V1 : état de départ. Gantt des jalons (l. 9831), rapport inter-modules imprimable (l. 10006), Statistiques Achats (l. 10302), Reports Project Master (l. 10377).

## 9. Accueil et recherche
- 2026-11-12, V1 : état de départ. Couche plateforme (l. 8341-9098) : accueil, recherche globale, alertes, sauvegarde/restauration ZIP. Enveloppe `switchApp` (l. 9030).
- 2026-11-12, V2 (en préparation) : accès réservé à l'équipe. Connexion Google obligatoire ; seuls les e-mails présents dans la collection Firestore `membres` (gérée à la main dans la console Firebase) peuvent lire et écrire ; tous les membres voient tout. Raison : sans règle de sécurité, n'importe qui pourrait lire les achats. **Ne jamais écrire les e-mails des membres dans le dépôt.**
- 2026-11-12, V2 : bouton ☁ dans la barre des applications (au-dessus de ◐) : état de la synchro (couleur), connexion / déconnexion Google, « Synchroniser », « Reprendre les données de l'équipe ». Ouvert comme fichier (file://), l'app reste en mode local et le dit. Compte absent de `membres` : message « compte non autorisé ».
- 2026-11-12, V2 : première synchro d'un poste : si l'équipe a déjà des données et que le poste a des enregistrements qui ne sont pas en ligne, une fenêtre demande « Fusionner » (ajouter, la version en ligne gagne en cas de doublon ; listes de texte réunies) ou « Remplacer par l'équipe ». Serveur vide : tout est envoyé.
- 2026-11-12, V2 : si un fichier plateforme (ZIP) est chargé alors que la synchro est active, une confirmation demande s'il faut envoyer son contenu à l'équipe ; « Annuler » reprend les données de l'équipe. Raison : un ZIP ancien rechargé au démarrage aurait écrasé les données plus récentes de l'équipe.

## 10. Mobile et thème
- 2026-11-12, V1 : état de départ. Thème sombre par défaut, mode clair (`pmSetTheme`, bouton ◐). Menu hamburger et styles ≤ 768 px (l. 307+).
- 2026-11-12, V2 : téléphone : les boutons du bas de la barre (☁, ◐, ＋) sortaient de l'écran ; ils sont placés juste après les icônes d'apps (`.app-rail-footer{margin-left:6px}` en ≤ 768 px), le panneau ☁ s'ouvre en haut à gauche (300 px). Raison : constaté en test iPhone 13 : la page fait 634 px de large au lieu de 390 (déjà le cas en V1), le bouton était inaccessible. Le ＋ reste en partie coupé sur un écran de 390 px.

## 11. Tests et méthode
- 2026-11-12, V1 : mise en place du journal, du README, de `CLAUDE.md` et de `versions/`. Raison : pouvoir reprendre le projet d'une session à l'autre sans redécouvrir ni défaire les décisions.
- 2026-11-12, V1 : aucun test automatique pour l'instant. V1 = fichier fourni par l'utilisateur, copié tel quel ; il n'a pas encore été lu en entier par Claude (seulement sa structure). **Avant de publier une V2**, lire tout le fichier publié.
- Modules greffés : plusieurs blocs « s'ajoutent sans modifier » l'existant en enveloppant des fonctions globales (`goTo`, `switchApp`…). Avant de renommer une fonction globale, chercher ses enveloppes.
- 2026-11-12, V2 (en préparation) : la connexion Firebase ne marche pas depuis un fichier ouvert en local (adresse file://) : l'app doit être servie en https. Proposé : Firebase Hosting (gratuit, domaine autorisé automatiquement). Raison : contrainte de Firebase Authentication.
- 2026-11-12, V2 : test automatique `node tests/test_sync.js` (Playwright, sans réseau ni compte) : un faux serveur Firebase (`tests/mock_firebase.js`) et plusieurs « postes » A, B, C, D. Couvre : envoi initial, réception sur poste vide (images et pièces jointes comprises), ajout, modifications croisées, Engineering + bandeau, découpage > 900 000 caractères, fusion sur un poste qui a ses propres données, garde-fou d'effacement, hors ligne, compte non autorisé, rechargement sans renvoi, convergence des 5 bases. Résultat : 48 réussis, 0 échoué.
- 2026-11-12, V2 : vérifié aussi avec le vrai SDK Firebase 12.19.0 et le vrai projet : chargement OK, état « non connecté », lecture Firestore sans connexion refusée (`permission-denied`) ; Storage refuse aussi l'accès anonyme. Mode fichier (file://) : état « mode local », aucune erreur. Clé API vérifiée valide.
- 2026-11-12, V2 : SDK Firebase **12.19.0** en version « compat » (balises script, sans bundler), depuis www.gstatic.com avec repli cdn.jsdelivr.net. Raison : version stable de septembre 2026 ; la 13.x est récente et changeait de version majeure.
- 2026-11-12, V2 : non testé ici (impossible sans compte Google) : la vraie connexion Google et la vraie écriture dans Firestore/Storage. À tester par l'utilisateur.

## 12. À faire
- Question : quels tests faire à chaque version (navigateur, téléphone, données d'exemple) ?
- Question : où publier l'application (lien de publication) ? → proposé : Firebase Hosting (en attente de confirmation).
- En cours (utilisateur) : créer le projet Firebase, Firestore, Authentication Google, Storage, app Web ; envoyer le bloc `firebaseConfig` (non secret). Ne jamais envoyer de clé de compte de service. → fait le 2026-11-12 (projet `work-75094`).
- Question : confirmer la lecture de la réponse « Oui » = équipe où chacun voit tout.
- Question : liste des membres — l'utilisateur les ajoute lui-même dans la collection `membres` de la console.
- Question : publier la V2 (Firebase Hosting via GitHub Actions, ou autre) ? La connexion Google ne marche qu'en https ou sur http://localhost. Avant de publier : lire tout le fichier publié (règle CLAUDE.md), copier dans `versions/v2.html`.
- En cours (utilisateur) : régler le CORS du bucket Storage (une commande dans Cloud Shell) pour que les images reçues redeviennent des data URL ; sans cela elles s'affichent par leur lien (l'export Word des images venues d'un autre poste peut alors les manquer).
- En cours (utilisateur) : premier essai réel de connexion Google et de synchro sur deux postes.
- À corriger plus tard : sur téléphone, la page fait 634 px de large au lieu de la largeur de l'écran (déjà en V1).
- Plus tard : les fichiers effacés (pièces jointes, images) restent dans Storage (pas de nettoyage).
