# Plateforme — Achats · Engineering · Project Master

Application web en un seul fichier HTML, hors ligne, en français. Trois apps dans une même page :
**Suivi des Achats** (achats, budgets, livraisons, fournisseurs), **Engineering** (solutions, cahiers des charges,
export Word) et **Project Master** (projets, actions, BOM, outils, planning).

- **Version actuelle : V2** (dans le dépôt, pas encore en ligne) — synchronisation Firebase : connexion Google, données partagées par l'équipe, images et pièces jointes dans Storage, hors ligne conservé.
- V1 — état de départ, fichier fourni tel quel (`versions/v1.html`).
- Fichier : `plateforme.html` (~11 100 lignes). Copies des versions : `versions/vN.html`. Tests : `node tests/test_sync.js`.
- Lancer : en ligne (https) ou via http://localhost pour la synchro ; ouvert comme fichier, l'app marche en mode local seulement.
- Données : copie locale dans le navigateur (localStorage + IndexedDB) ; avec connexion Google, synchronisées dans Firebase (projet `work-75094` : Firestore + Storage). Fichier `platform_data.zip` lié toujours possible.
- Librairies (CDN, chargées à la demande) : JSZip, docx, SheetJS (xlsx), ExcelJS, Firebase 12.19.0 (compat).
- Historique et décisions : `JOURNAL.md`. Règles de travail pour Claude : `CLAUDE.md`.
- Publication : pas encore de lien. Prévu (V2) : base partagée Firebase (Firestore + Storage) et Firebase Hosting.
