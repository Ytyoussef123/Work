# Plateforme — Achats · Engineering · Project Master

Application web en un seul fichier HTML, hors ligne, en français. Trois apps dans une même page :
**Suivi des Achats** (achats, budgets, livraisons, fournisseurs), **Engineering** (solutions, cahiers des charges,
export Word) et **Project Master** (projets, actions, BOM, outils, planning).

- **Version actuelle : V7** — plus de perte silencieuse (projets enregistrés automatiquement, fusion au lieu d'écraser entre postes, ZIP « Fusionner »), grille jalons × outils sur téléphone, menu ☰ à la place des puces (`versions/v7.html`).
- V6 — rappels des échéances (jalons d'outils, actions datées) par notification sur le téléphone, même app fermée (`versions/v6.html`).
- V5 — correction des lignes de budget au même numéro (montants négatifs) et documents des budgets (PDF) en ligne (`versions/v5.html`).
- V4 — pièces jointes en ligne dès l'ajout, état à côté de chaque fichier, un fichier refusé ne bloque plus le reste, fichier absent ouvert depuis sa copie en ligne (`versions/v4.html`).
- V3 — vue téléphone comme une app : barre d'onglets en bas, pages en puces, listes en cartes, fenêtres qui montent du bas ; affichage ordinateur inchangé (`versions/v3.html`).
- V2 — synchronisation Firebase : connexion Google, données partagées, images et pièces jointes dans Storage, hors ligne conservé (`versions/v2.html`).
- V1 — état de départ, fichier fourni tel quel (`versions/v1.html`).
- Fichier : `plateforme.html` (~12 120 lignes). Copies des versions : `versions/vN.html`. Tests : `cd tests && npm install && node test_sync.js && node test_mobile.js && node test_budget.js && node test_rappels.js`
- Dossier `functions/` : fonction quotidienne des rappels (à déployer une fois, voir JOURNAL).
- Lancer : en ligne (https) ou via http://localhost pour la synchro ; ouvert comme fichier, l'app marche en mode local seulement.
- Données : copie locale dans le navigateur (localStorage + IndexedDB) ; avec connexion Google, synchronisées dans Firebase (projet `work-75094` : Firestore + Storage). Fichier `platform_data.zip` lié toujours possible.
- Librairies (CDN, chargées à la demande) : JSZip, docx, SheetJS (xlsx), ExcelJS, Firebase 12.19.0 (compat).
- Historique et décisions : `JOURNAL.md`. Règles de travail pour Claude : `CLAUDE.md`.
- Publication : https://ytyoussef123.github.io/Work/ (GitHub Pages, à activer dans les réglages du dépôt).
