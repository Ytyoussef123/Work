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

## 2. Achats
- 2026-11-12, V1 : état de départ. Types CAPEX, OPEX, « Costumer » (orthographe d'origine, à ne pas corriger sans vérifier les données existantes). CAPEX et Costumer exigent un budget et des lignes (immos ou lignes client) (validation l. 2021+). Liste paginée par 15, import/export CSV.

## 3. Budget
- 2026-11-12, V1 : état de départ. Page Budget Follow Up : cartes, tableau dépliable 2 niveaux (budget → immo → achats), export Excel. Onglet Budget aussi dans la fiche projet de Project Master (l. 8824).

## 4. Achats+ (workflow, livraisons, fournisseurs)
- 2026-11-12, V1 : état de départ. Module greffé sans modifier l'app Achats (l. 9100-9756) : workflow d'approbation, page Livraisons, page Fournisseurs avec historique de prix, pièces jointes, traçabilité créé/modifié par.

## 5. Engineering
- 2026-11-12, V1 : état de départ. Projets, bibliothèque de solutions (import JSON), réception, entreprises, paramètres, éditeur riche avec images redimensionnables, mode opératoire (bibliothèque d'opérations). Lien vers les projets et produits de Project Master (l. 3897).

## 6. Export Word
- 2026-11-12, V1 : état de départ. Export .docx avec la librairie docx 8.5.0 (l. 4343), mise en page réglable dans « Mise en page Doc » (l. 4311). Librairies chargées à la demande avec CDN de secours (l. 1535).

## 7. Project Master
- 2026-11-12, V1 : état de départ. Dashboard, projets, plan d'actions (import JSON, l. 5524), clients, product lines, volumes, capacité, besoin, BOM multi-niveaux, outils & suivi (export Excel l. 7217), jalons glissables, dossiers projet automatiques (l. 7863).

## 8. Planning et rapports
- 2026-11-12, V1 : état de départ. Gantt des jalons (l. 9831), rapport inter-modules imprimable (l. 10006), Statistiques Achats (l. 10302), Reports Project Master (l. 10377).

## 9. Accueil et recherche
- 2026-11-12, V1 : état de départ. Couche plateforme (l. 8341-9098) : accueil, recherche globale, alertes, sauvegarde/restauration ZIP. Enveloppe `switchApp` (l. 9030).
- 2026-11-12, V2 (en préparation) : accès réservé à l'équipe. Connexion Google obligatoire ; seuls les e-mails présents dans la collection Firestore `membres` (gérée à la main dans la console Firebase) peuvent lire et écrire ; tous les membres voient tout. Raison : sans règle de sécurité, n'importe qui pourrait lire les achats. **Ne jamais écrire les e-mails des membres dans le dépôt.**

## 10. Mobile et thème
- 2026-11-12, V1 : état de départ. Thème sombre par défaut, mode clair (`pmSetTheme`, bouton ◐). Menu hamburger et styles ≤ 768 px (l. 307+).

## 11. Tests et méthode
- 2026-11-12, V1 : mise en place du journal, du README, de `CLAUDE.md` et de `versions/`. Raison : pouvoir reprendre le projet d'une session à l'autre sans redécouvrir ni défaire les décisions.
- 2026-11-12, V1 : aucun test automatique pour l'instant. V1 = fichier fourni par l'utilisateur, copié tel quel ; il n'a pas encore été lu en entier par Claude (seulement sa structure). **Avant de publier une V2**, lire tout le fichier publié.
- Modules greffés : plusieurs blocs « s'ajoutent sans modifier » l'existant en enveloppant des fonctions globales (`goTo`, `switchApp`…). Avant de renommer une fonction globale, chercher ses enveloppes.
- 2026-11-12, V2 (en préparation) : la connexion Firebase ne marche pas depuis un fichier ouvert en local (adresse file://) : l'app doit être servie en https. Proposé : Firebase Hosting (gratuit, domaine autorisé automatiquement). Raison : contrainte de Firebase Authentication.

## 12. À faire
- Question : quels tests faire à chaque version (navigateur, téléphone, données d'exemple) ?
- Question : où publier l'application (lien de publication) ? → proposé : Firebase Hosting (en attente de confirmation).
- En cours (utilisateur) : créer le projet Firebase, Firestore, Authentication Google, Storage, app Web ; envoyer le bloc `firebaseConfig` (non secret). Ne jamais envoyer de clé de compte de service.
- Question : confirmer la lecture de la réponse « Oui » = équipe où chacun voit tout.
- Question : liste des membres — l'utilisateur les ajoute lui-même dans la collection `membres` de la console.
