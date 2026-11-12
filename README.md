# Plateforme — Achats · Engineering · Project Master

Application web en un seul fichier HTML, hors ligne, en français. Trois apps dans une même page :
**Suivi des Achats** (achats, budgets, livraisons, fournisseurs), **Engineering** (solutions, cahiers des charges,
export Word) et **Project Master** (projets, actions, BOM, outils, planning).

- **Version actuelle : V1** — état de départ, fichier fourni tel quel.
- Fichier : `plateforme.html` (~10 500 lignes). Copies des versions : `versions/vN.html`.
- Lancer : ouvrir `plateforme.html` dans Chrome ou Edge (sauvegarde automatique dans un fichier). Firefox et Safari : export manuel.
- Données : dans le navigateur (localStorage + IndexedDB), ou dans le fichier `platform_data.zip` lié.
- Librairies (CDN, chargées à la demande) : JSZip, docx, SheetJS (xlsx), ExcelJS.
- Historique et décisions : `JOURNAL.md`. Règles de travail pour Claude : `CLAUDE.md`.
- Publication : pas encore de lien. Prévu (V2) : base partagée Firebase (Firestore + Storage) et Firebase Hosting.
