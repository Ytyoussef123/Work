# Plateforme — Achats · Engineering · Project Master

Application web en un seul fichier HTML, hors ligne, en français. Trois apps dans une même page :
**Suivi des Achats** (achats, budgets, livraisons, fournisseurs), **Engineering** (solutions, cahiers des charges,
export Word) et **Project Master** (projets, actions, BOM, outils, planning).

- **Version actuelle : V17** — Project Master › Plan d'actions : page refaite ; sur téléphone une carte par action (texte entier, urgence, statut, échéance, ✓ et ✕ dans l'écran) au lieu d'un tableau qui défilait sur le côté, sur ordinateur les 4 filtres et la colonne ✕ visibles, pastilles ▾ et bord coloré selon l'urgence (`versions/v17.html`).
- V16 — Project Master › projet › Volumes : bouton « 🗂 Nouvelle version » qui archive les volumes actuels (version consultable en lecture seule, avec l'écart) et commence la version suivante ; l'analyse de capacité de l'onglet Production peut se calculer avec les volumes d'une version archivée (`versions/v16.html`).
- V15 — Project Master › projet › Outils & Suivi : le dossier choisi dans « Documents de l'équipement » du jalon est gardé ; commentaires du jalon triés par date avec ✎ pour corriger le texte sans changer la date ; notes et actions d'un outil redessinées (pastilles, en-tête sur une ligne, carte claire sur téléphone) (`versions/v15.html`).
- V14 — onglet Budget d'un projet Project Master : en haut, les budgets Costumer et CAPEX du Suivi d'achats du projet, avec la même carte que Achats › Budget, rattachés automatiquement par le nom du projet (CX735) ; rapport et dépenses du projet suivent la même règle (`versions/v14.html`).
- V13 — documentation Engineering d'un produit : plusieurs fichiers (plusieurs PDF) par ligne de document, menu « Ouvrir quel fichier ? », un bouton par fichier dans Engineering ; synchro, ZIP et import inclus (`versions/v13.html`).
- V12 — téléphone : grande zone de commentaire dans la fenêtre du jalon, qui grandit avec la dictée, et BOM d'un produit en cartes avec libellés ; ordinateur inchangé (`versions/v12.html`).
- V11 — ouvrir une pièce jointe la télécharge sous son nom exact (le logiciel PDF du poste l'ouvre, comme SAP), « ⬆ Charger » de la documentation d'un produit met le fichier dans l'app, et un projet Engineering propose les plans du produit en un clic (`versions/v11.html`).
- V10 — app installable sur l'écran d'accueil (manifeste + icônes, bouton « 📲 Installer l'app » dans le panneau ☁) et chargement d'un ZIP en choisissant ce qu'on prend, au lieu de tout écraser (`versions/v10.html`).
- V9 — téléphone : liste des projets compacte, recherche réduite à l'icône 🔎, et dans le panneau ☁ les boutons Actualiser, Réglages et Plein écran ; ordinateur inchangé (`versions/v9.html`).
- V8 — téléphone : plus de place (boutons sur une ligne, marges réduites, noms d'outils entiers dans la grille) et aperçu Engineering en pages A4 réduites comme un PDF ; ordinateur inchangé (`versions/v8.html`).
- V7 — plus de perte silencieuse (projets enregistrés automatiquement, fusion au lieu d'écraser entre postes, ZIP « Fusionner »), grille jalons × outils sur téléphone, menu ☰ à la place des puces (`versions/v7.html`).
- V6 — rappels des échéances (jalons d'outils, actions datées) par notification sur le téléphone, même app fermée (`versions/v6.html`).
- V5 — correction des lignes de budget au même numéro (montants négatifs) et documents des budgets (PDF) en ligne (`versions/v5.html`).
- V4 — pièces jointes en ligne dès l'ajout, état à côté de chaque fichier, un fichier refusé ne bloque plus le reste, fichier absent ouvert depuis sa copie en ligne (`versions/v4.html`).
- V3 — vue téléphone comme une app : barre d'onglets en bas, pages en puces, listes en cartes, fenêtres qui montent du bas ; affichage ordinateur inchangé (`versions/v3.html`).
- V2 — synchronisation Firebase : connexion Google, données partagées, images et pièces jointes dans Storage, hors ligne conservé (`versions/v2.html`).
- V1 — état de départ, fichier fourni tel quel (`versions/v1.html`).
- Fichier : `plateforme.html` (~13 230 lignes). Copies des versions : `versions/vN.html`. Tests : `cd tests && npm install && node test_sync.js && node test_mobile.js && node test_budget.js && node test_rappels.js && node test_install.js`
- Dossier `functions/` : fonction quotidienne des rappels (à déployer une fois, voir JOURNAL). `manifest.webmanifest` et dossier `icons/` : installation de l'app sur l'écran d'accueil.
- Lancer : en ligne (https) ou via http://localhost pour la synchro ; ouvert comme fichier, l'app marche en mode local seulement.
- Données : copie locale dans le navigateur (localStorage + IndexedDB) ; avec connexion Google, synchronisées dans Firebase (projet `work-75094` : Firestore + Storage). Fichier `platform_data.zip` lié toujours possible.
- Librairies (CDN, chargées à la demande) : JSZip, docx, SheetJS (xlsx), ExcelJS, Firebase 12.19.0 (compat).
- Historique et décisions : `JOURNAL.md`. Règles de travail pour Claude : `CLAUDE.md`.
- Publication : https://ytyoussef123.github.io/Work/ (GitHub Pages, à activer dans les réglages du dépôt).
