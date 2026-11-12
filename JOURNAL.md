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
- 2026-11-12, V2 : les numéros de ligne de la couche de synchro ci-dessus ont changé après la lecture complète : le bloc va maintenant de la l. 10504 à la l. 11149, le garde-fou d'effacement de masse est l. 10732, `seedOnly` l. 10658 (anciennes lignes conservées plus haut, remplacées par celles-ci).
- 2026-11-12, V2 : la restauration d'un fichier plateforme (ZIP) est entièrement couverte par la question « envoyer à l'équipe ? » : `wrapZipLoad` (l. 10996) enveloppe la version la plus externe de `loadPlatformZip`. Raison : trouvé à la lecture complète — la couche Achats+ (l. 9603-9626) écrit les extras, les fournisseurs et `suivi_autosave` après la fin de `__platformLoading` ; ces données partaient à l'équipe sans confirmation. Test 12 : échoue sans la correction (2 échecs), passe avec.
- 2026-11-12, V2 : réception d'un changement d'un autre poste (`reconcile`, l. 10812) : si l'utilisateur modifie la même base pendant le téléchargement d'une image, la réception recommence avec la version locale à jour (3 essais) au lieu de l'écraser ; l'état commun (`fb_base`) n'est mis à jour qu'après application. Raison : trouvé à la relecture ; une saisie faite pendant l'attente pouvait être perdue.
- 2026-11-12, V2 : à savoir — une image reçue sans réglage CORS du bucket reste affichée par son lien https ; l'export Word ignore alors cette image (engDataUrlToUint8 attend une data URL, l. 4470, erreur captée l. 4609). Une pièce jointe non téléchargée affiche « Fichier introuvable dans ce navigateur » (l. 9365).

## 2. Achats
- 2026-11-12, V1 : état de départ. Types CAPEX, OPEX, « Costumer » (orthographe d'origine, à ne pas corriger sans vérifier les données existantes). CAPEX et Costumer exigent un budget et des lignes (immos ou lignes client) (validation l. 2021+). Liste paginée par 15, import/export CSV.
- 2026-11-12, V2 : les achats sans `id` (anciennes données) reçoivent un identifiant `ID<date>_<n><aléatoire>` à la première synchro. Raison : impossible de synchroniser un enregistrement sans identifiant.
- 2026-11-12, V2 : après une fusion entre postes, deux achats peuvent avoir le même numéro `line` ; ils sont renumérotés à la prochaine suppression (comportement existant de `confirmDel`). Raison : renuméroter tout de suite réécrirait tous les achats.
- 2026-11-12, V2 : à la réception d'achats ou de paramètres d'un autre poste, la liste, les compteurs, les listes déroulantes (filtres conservés) et la page Budget/Paramètres ouverte sont redessinés automatiquement.
- 2026-11-12, V3 : correction téléphone : le formulaire « Nouvel achat » restait sur 3 colonnes étroites, car les champs « pleine largeur » (`.fg.s3`) créaient des colonnes implicites dans la grille à 1 colonne ; règle `.fg.s2,.fg.s3{grid-column:1/-1}`. Raison : Date, Projet et Référence étaient écrasés sur une même ligne.
- 2026-11-12, V3 : sur téléphone, page « Nouvel achat » : boutons Sauvegarder / Nouveau / Supprimer collés au-dessus de la barre d'onglets ; cartes de chiffres masquées sur cette page ; boutons de la barre de titre (doublons) masqués. Raison : le bouton Sauvegarder était en bas d'un long formulaire.

## 3. Budget
- 2026-11-12, V1 : état de départ. Page Budget Follow Up : cartes, tableau dépliable 2 niveaux (budget → immo → achats), export Excel. Onglet Budget aussi dans la fiche projet de Project Master (l. 8824).

## 4. Achats+ (workflow, livraisons, fournisseurs)
- 2026-11-12, V1 : état de départ. Module greffé sans modifier l'app Achats (l. 9100-9756) : workflow d'approbation, page Livraisons, page Fournisseurs avec historique de prix, pièces jointes, traçabilité créé/modifié par.

## 5. Engineering
- 2026-11-12, V1 : état de départ. Projets, bibliothèque de solutions (import JSON), réception, entreprises, paramètres, éditeur riche avec images redimensionnables, mode opératoire (bibliothèque d'opérations). Lien vers les projets et produits de Project Master (l. 3897).
- 2026-11-12, V2 : à la réception de changements Engineering ou Project Master, l'écran n'est pas redessiné tout seul (un formulaire peut être ouvert) : un bandeau « Données mises à jour par l'équipe — Actualiser l'affichage » apparaît. Les données en mémoire (`engDB`, `pmDB`) sont déjà à jour, donc un enregistrement n'écrase pas les changements reçus sur les autres fiches. Raison : ne pas fermer un formulaire en cours de saisie.
- 2026-11-12, V3 : sur téléphone, l'éditeur de solution passe sur une colonne (grille `minmax(0,1fr) minmax(0,1fr)`, l. 848) ; le sous-titre `#engCrumb` est masqué. Raison : deux colonnes illisibles sur 390 px.

## 6. Export Word
- 2026-11-12, V1 : état de départ. Export .docx avec la librairie docx 8.5.0 (l. 4343), mise en page réglable dans « Mise en page Doc » (l. 4311). Librairies chargées à la demande avec CDN de secours (l. 1535).

## 7. Project Master
- 2026-11-12, V1 : état de départ. Dashboard, projets, plan d'actions (import JSON, l. 5524), clients, product lines, volumes, capacité, besoin, BOM multi-niveaux, outils & suivi (export Excel l. 7217), jalons glissables, dossiers projet automatiques (l. 7863).
- 2026-11-12, V2 : les exemples créés au premier lancement (Engineering : Akwel Automotive + types Sensor/Cylinder/Pressure ; Project Master : FORD/STELLANTIS/RENAULT + 4 product lines) ne sont pas fusionnés avec ceux de l'équipe sur un nouveau poste (`seedOnly`, l. 10658). Raison : sinon chaque nouveau poste ajoutait des doublons et posait la question de fusion à tort (constaté au test 2).
- 2026-11-12, V3 : sur téléphone, fiche projet : la rangée d'actions passe à la ligne (le bouton Supprimer sortait de l'écran, page à 444 px) ; tableau Volumes à largeur libre (il était coupé, sans défilement) ; composants (BOM) : photo et boutons sur une ligne, champs en 2 colonnes ; documents en 2 colonnes ; budget du projet : les 5 chiffres sur 3 colonnes ; Plan d'actions : les 4 chiffres en 2 × 2.

## 8. Planning et rapports
- 2026-11-12, V1 : état de départ. Gantt des jalons (l. 9831), rapport inter-modules imprimable (l. 10006), Statistiques Achats (l. 10302), Reports Project Master (l. 10377).

## 9. Accueil et recherche
- 2026-11-12, V1 : état de départ. Couche plateforme (l. 8341-9098) : accueil, recherche globale, alertes, sauvegarde/restauration ZIP. Enveloppe `switchApp` (l. 9030).
- 2026-11-12, V2 (en préparation) : accès réservé à l'équipe. Connexion Google obligatoire ; seuls les e-mails présents dans la collection Firestore `membres` (gérée à la main dans la console Firebase) peuvent lire et écrire ; tous les membres voient tout. Raison : sans règle de sécurité, n'importe qui pourrait lire les achats. **Ne jamais écrire les e-mails des membres dans le dépôt.**
- 2026-11-12, V2 : bouton ☁ dans la barre des applications (au-dessus de ◐) : état de la synchro (couleur), connexion / déconnexion Google, « Synchroniser », « Reprendre les données de l'équipe ». Ouvert comme fichier (file://), l'app reste en mode local et le dit. Compte absent de `membres` : message « compte non autorisé ».
- 2026-11-12, V2 : première synchro d'un poste : si l'équipe a déjà des données et que le poste a des enregistrements qui ne sont pas en ligne, une fenêtre demande « Fusionner » (ajouter, la version en ligne gagne en cas de doublon ; listes de texte réunies) ou « Remplacer par l'équipe ». Serveur vide : tout est envoyé.
- 2026-11-12, V2 : si un fichier plateforme (ZIP) est chargé alors que la synchro est active, une confirmation demande s'il faut envoyer son contenu à l'équipe ; « Annuler » reprend les données de l'équipe. Raison : un ZIP ancien rechargé au démarrage aurait écrasé les données plus récentes de l'équipe.
- 2026-11-12, V2 : à la réception de changements de l'équipe, l'accueil est redessiné s'il est affiché (`window.hpRender`).
- 2026-11-12, V3 : sur téléphone, barre du haut de l'accueil compacte : onglets Vue d'ensemble / Rapport, loupe seule, cloche ; le bouton du nom est masqué (le nom vient de la connexion Google). Raison : cette barre poussait la page à 590 px de large.

## 10. Mobile et thème
- 2026-11-12, V1 : état de départ. Thème sombre par défaut, mode clair (`pmSetTheme`, bouton ◐). Menu hamburger et styles ≤ 768 px (l. 307+).
- 2026-11-12, V2 : téléphone : les boutons du bas de la barre (☁, ◐, ＋) sortaient de l'écran ; ils sont placés juste après les icônes d'apps (`.app-rail-footer{margin-left:6px}` en ≤ 768 px), le panneau ☁ s'ouvre en haut à gauche (300 px). Raison : constaté en test iPhone 13 : la page fait 634 px de large au lieu de 390 (déjà le cas en V1), le bouton était inaccessible. Le ＋ reste en partie coupé sur un écran de 390 px.
- 2026-11-12, V3 : vue téléphone refaite comme une app, en couche greffée (l. 11150-11450). La barre des applications du haut est masquée sur téléphone et remplacée par une barre d'onglets en bas : Accueil, Achats, Engineering, Projets, avec des icônes en traits (SVG) ; pastilles = alertes graves de l'accueil et livraisons en retard. Raison : demande de l'utilisateur (« plus natif ») ; il y avait deux barres empilées en haut et la page faisait 634 px au lieu de 390. Remplace, sur téléphone, la ligne V2 « ☁, ◐, ＋ placés juste après les icônes d'apps » : ◐ reste disponible dans Project Master › Settings, ＋ n'est plus affiché sur téléphone.
- 2026-11-12, V3 : barre de titre collante (☰ tiroir à gauche, titre, ☁ à droite) et, dessous, une rangée de « puces » qui défile : les pages de l'app, copiées de la navigation de sa barre latérale (état actif suivi par MutationObserver). Le bouton ☁ reprend la couleur et le panneau du bouton de synchro de la V2. Le tiroir ☰ garde les outils (fichier plateforme, import/export, utilisateur) ; pas de ☰ sur l'accueil.
- 2026-11-12, V3 : listes principales en cartes sur téléphone (achats ; projets, solutions et réceptions Engineering ; projets Project Master) : chaque cellule reçoit le titre de sa colonne (`data-label`, ajouté par un observateur) ; colonnes masquées : achats N° CAPEX, N° Immo, Ligne ; projets Project Master : Modifié. Toucher une carte ouvre la fiche (clic d'origine conservé).
- 2026-11-12, V3 : fenêtres (`.overlay .modal`) en feuilles qui montent du bas ; messages (toast, bandeau « mis à jour par l'équipe ») au-dessus de la barre d'onglets ; panneau ☁ sous son bouton.
- 2026-11-12, V3 : revenir sur un onglet rouvre la dernière page vue dans cette app ; toucher l'onglet actif remonte en haut ; un changement de page remonte en haut (téléphone seulement).
- 2026-11-12, V3 : balise viewport avec `viewport-fit=cover` et balise `theme-color` (l. 58, sur la même ligne pour ne pas décaler les numéros de ligne du journal) ; marges de sécurité des iPhone (`env(safe-area-inset-*)`) ; la couleur de la barre du navigateur suit le thème clair ou sombre.
- 2026-11-12, V3 : **ne jamais casser l'affichage ordinateur en modifiant la vue téléphone** : tout le CSS de la couche est dans `@media (max-width:768px)`. Vérifié : 12 écrans ordinateur (1440 × 900) identiques au pixel près à la V2.
- 2026-11-12, V3 : à savoir : le planning (Gantt) garde sa colonne de noms de 380 px (l. 9834) ; sur téléphone on fait défiler. Les tableaux Livraisons et Fournisseurs défilent sur le côté (pas en cartes).

## 11. Tests et méthode
- 2026-11-12, V1 : mise en place du journal, du README, de `CLAUDE.md` et de `versions/`. Raison : pouvoir reprendre le projet d'une session à l'autre sans redécouvrir ni défaire les décisions.
- 2026-11-12, V1 : aucun test automatique pour l'instant. V1 = fichier fourni par l'utilisateur, copié tel quel ; il n'a pas encore été lu en entier par Claude (seulement sa structure). **Avant de publier une V2**, lire tout le fichier publié.
- Modules greffés : plusieurs blocs « s'ajoutent sans modifier » l'existant en enveloppant des fonctions globales (`goTo`, `switchApp`…). Avant de renommer une fonction globale, chercher ses enveloppes.
- 2026-11-12, V2 (en préparation) : la connexion Firebase ne marche pas depuis un fichier ouvert en local (adresse file://) : l'app doit être servie en https. Proposé : Firebase Hosting (gratuit, domaine autorisé automatiquement). Raison : contrainte de Firebase Authentication.
- 2026-11-12, V2 : test automatique `node tests/test_sync.js` (Playwright, sans réseau ni compte) : un faux serveur Firebase (`tests/mock_firebase.js`) et plusieurs « postes » A, B, C, D. Couvre : envoi initial, réception sur poste vide (images et pièces jointes comprises), ajout, modifications croisées, Engineering + bandeau, découpage > 900 000 caractères, fusion sur un poste qui a ses propres données, garde-fou d'effacement, hors ligne, compte non autorisé, rechargement sans renvoi, convergence des 5 bases. Résultat : 48 réussis, 0 échoué.
- 2026-11-12, V2 : vérifié aussi avec le vrai SDK Firebase 12.19.0 et le vrai projet : chargement OK, état « non connecté », lecture Firestore sans connexion refusée (`permission-denied`) ; Storage refuse aussi l'accès anonyme. Mode fichier (file://) : état « mode local », aucune erreur. Clé API vérifiée valide.
- 2026-11-12, V2 : SDK Firebase **12.19.0** en version « compat » (balises script, sans bundler), depuis www.gstatic.com avec repli cdn.jsdelivr.net. Raison : version stable de septembre 2026 ; la 13.x est récente et changeait de version majeure.
- 2026-11-12, V2 : non testé ici (impossible sans compte Google) : la vraie connexion Google et la vraie écriture dans Firestore/Storage. À tester par l'utilisateur.
- 2026-11-12, V2 : lecture complète de plateforme.html (11 151 lignes) faite avant publication (règle CLAUDE.md). Rien d'autre de bloquant : pas de secret ; services externes attendus seulement (Google Fonts, cdnjs / unpkg / jsdelivr pour les librairies, gstatic + googleapis pour Firebase). La clé `apiKey` Firebase dans le fichier est publique par conception ; la protection vient des règles Firestore/Storage.
- 2026-11-12, V2 : `node tests/test_sync.js` : 53 réussis, 0 échoué (ajout du test 12 : ZIP refusé → rien envoyé, données de l'équipe reprises ; ZIP accepté → B reçoit achats, extras et fournisseurs). Le test 12 a besoin de JSZip : lancer `npm install` dans `tests/` (tests/package.json, jszip 3.10.1). Vérifiés aussi : vrai SDK 12.19.0 (état « non connecté », lecture refusée sans connexion), mode fichier, bouton ☁ sur iPhone 13. Remplace le résultat « 48 réussis » plus haut.
- 2026-11-12, V2 : publication prévue par GitHub Pages (dépôt public, gratuit) : adresse https://ytyoussef123.github.io/Work/ ; `index.html` redirige vers `plateforme.html` ; `.nojekyll` pour servir les fichiers tels quels. Raison : Firebase Hosting demande un outil en ligne de commande ou une clé de compte de service ; GitHub Pages s'active en 3 clics. Conséquence : le code et le journal sont publics ; les données restent privées dans Firebase (règles « membres »).
- 2026-11-12, V2 : copie de la version publiée : `versions/v2.html`.
- 2026-11-12, V3 : nouveau test `node tests/test_mobile.js` (options : `--device "iPhone SE"` ou `"Pixel 7"`, `--shots dossier` pour des captures), avec des données fictives (`tests/seed_data.js`) : 48 écrans vérifiés à la largeur du téléphone (rien ne dépasse) et 15 vérifications d'interaction (onglets, puces, retour à la dernière page, cartes, barre d'actions, ☁, tiroir, pastilles). Résultat : 63/63 sur iPhone SE (320 px), iPhone 13 (390 px) et Pixel 7 (412 px). Avant la V3 : 26 écrans corrects sur 38 (iPhone 13).
- 2026-11-12, V3 : `node tests/test_sync.js` : 53/53. Correction d'une course dans le test : la connexion pouvait partir avant le chargement du faux SDK ; vue en lançant les tests en parallèle.
- 2026-11-12, V3 : affichage ordinateur comparé à la V2 sur 12 écrans (1440 × 900) : identique au pixel près.
- 2026-11-12, V3 : avant publication, tout ce qui a changé depuis la V2 a été relu (l. 58 et l. 11150-11450), comme le prévoit CLAUDE.md. Copie : `versions/v3.html`.

## 12. À faire
- Question : quels tests faire à chaque version (navigateur, téléphone, données d'exemple) ? → en place en V3 : test_sync, test_mobile sur 3 tailles de téléphone, comparaison de l'affichage ordinateur avec la version précédente.
- Question : où publier l'application (lien de publication) ? → proposé : Firebase Hosting (en attente de confirmation).
- En cours (utilisateur) : créer le projet Firebase, Firestore, Authentication Google, Storage, app Web ; envoyer le bloc `firebaseConfig` (non secret). Ne jamais envoyer de clé de compte de service. → fait le 2026-11-12 (projet `work-75094`).
- Question : confirmer la lecture de la réponse « Oui » = équipe où chacun voit tout.
- Question : liste des membres — l'utilisateur les ajoute lui-même dans la collection `membres` de la console.
- Question : publier la V2 (Firebase Hosting via GitHub Actions, ou autre) ? La connexion Google ne marche qu'en https ou sur http://localhost. Avant de publier : lire tout le fichier publié (règle CLAUDE.md), copier dans `versions/v2.html`. → choisi : GitHub Pages (2026-11-12), activation par l'utilisateur.
- En cours (utilisateur) : régler le CORS du bucket Storage (une commande dans Cloud Shell) pour que les images reçues redeviennent des data URL ; sans cela elles s'affichent par leur lien (l'export Word des images venues d'un autre poste peut alors les manquer).
- En cours (utilisateur) : premier essai réel de connexion Google et de synchro sur deux postes.
- À corriger plus tard : sur téléphone, la page fait 634 px de large au lieu de la largeur de l'écran (déjà en V1). → corrigé en V3 (2026-11-12).
- Plus tard : les fichiers effacés (pièces jointes, images) restent dans Storage (pas de nettoyage).
- En cours (utilisateur) : activer GitHub Pages (Settings › Pages › Deploy from a branch › branche `ccr-fcfbd0a0-m1mkvy`, dossier `/ (root)`) ; puis dans Firebase › Authentication › Settings › Authorized domains, ajouter `ytyoussef123.github.io`.
- En cours (utilisateur) : régler le CORS du bucket avec l'origine `https://ytyoussef123.github.io` (en plus de localhost).
- Plus tard : en cas de pièce jointe absente localement, proposer de l'ouvrir par son lien Storage au lieu de « Fichier introuvable ».
- En cours (utilisateur) : essayer la V3 sur son téléphone (sur iPhone avec encoche : vérifier les marges en haut et en bas).
- Prochaine étape proposée : installation comme une app (icône sur l'écran d'accueil, plein écran : manifeste + icônes).
- Plus tard : planning (Gantt) sur téléphone (colonne des noms de 380 px).
- Plus tard : Livraisons et Fournisseurs en cartes sur téléphone.
