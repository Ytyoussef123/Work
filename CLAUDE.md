# Règles de travail pour Claude (Plateforme Achats · Engineering · Project Master)

## Modèles et effort
- Lire ou écrire `JOURNAL.md` et `README.md` : confier le travail à un sous-agent **Sonnet**, effort **medium**.
- Lire du code pour le comprendre ou trouver où sont les choses : sous-agent **Sonnet**, effort **medium**, qui rend un résumé avec les numéros de lignes.
- Modifier le code : **Opus**, effort **max** (la session principale, ou un sous-agent Opus en effort max).
- Avant de modifier des lignes, relire soi-même ces lignes exactes : ne jamais modifier du code à partir d'un résumé seul.
- Publier oblige à avoir lu tout le fichier publié : dans ce cas, la session principale le lit elle-même (ou relit tout ce qui a changé depuis la dernière version lue en entier).

## Rappels
- Avant toute modification : lire dans `JOURNAL.md` la section du sujet et celles de « Liens ». Après : une ligne datée dans la section (version + décision + raison).
- Chaque version publiée est copiée dans `versions/vN.html`.
- Tests : voir `JOURNAL.md`, section Tests.
- La méthode complète est dans `.claude/skills/journal-de-projet/SKILL.md`.
- Le fichier fait ~10 500 lignes (~650 Ko) : ne pas le lire en entier pour une petite modification, sauf pour publier.
