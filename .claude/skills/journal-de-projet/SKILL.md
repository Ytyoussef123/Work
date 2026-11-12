---
name: journal-de-projet
description: Méthode de travail pour un projet suivi sur plusieurs sessions avec Claude Code — un JOURNAL.md par sujet (décision + raison, datées), un README.md court, une copie de chaque version publiée, et la répartition des tâches entre modèles (Sonnet pour lire et écrire le journal ou lire le code, Opus pour modifier le code). À utiliser au démarrage d'un nouveau projet (« mets en place le journal », « organise le projet comme Corniche Rush »), avant et après chaque modification dans un projet qui a déjà un JOURNAL.md, et à chaque publication d'une version.
---

# Journal de projet et répartition des modèles

Le but : qu'une session suivante, ou une autre IA, reprenne le projet sans rien redécouvrir et sans défaire une
décision dont elle ignore la raison. La mémoire d'une conversation est résumée et perd des détails ; le journal non.

## 1. Mise en place (nouveau projet, une seule fois)

Créer à la racine, s'ils n'existent pas (s'ils existent, les garder et les compléter) :

1. **`CLAUDE.md`** — les règles de travail, chargées à chaque session :

   ```markdown
   # Règles de travail pour Claude (<nom du projet>)

   ## Modèles et effort
   - Lire ou écrire `JOURNAL.md` et `README.md` : confier le travail à un sous-agent **Sonnet**, effort **medium**.
   - Lire du code pour le comprendre ou trouver où sont les choses : sous-agent **Sonnet**, effort **medium**, qui rend un résumé avec les numéros de lignes.
   - Modifier le code : **Opus**, effort **max** (la session principale, ou un sous-agent Opus en effort max).
   - Avant de modifier des lignes, relire soi-même ces lignes exactes : ne jamais modifier du code à partir d'un résumé seul.
   - Publier oblige à avoir lu tout le fichier publié : dans ce cas, la session principale le lit elle-même (ou relit tout ce qui a changé depuis la dernière version lue en entier).

   ## Rappels
   - Avant toute modification : lire dans `JOURNAL.md` la section du sujet et celles de « Liens ». Après : une ligne datée dans la section (version + décision + raison).
   - Chaque version publiée est copiée dans `versions/vN.<ext>`.
   - Tests : voir `JOURNAL.md`, section Tests.
   ```

   Demander à l'utilisateur s'il veut d'autres modèles que ceux-là, et écrire ses choix tels quels.

2. **`JOURNAL.md`** — découpé **par sujet**, pas par date. Choisir 6 à 12 sujets d'après le projet ; garder
   toujours « Tests et méthode » et « À faire » en dernier :

   ```markdown
   # JOURNAL DU PROJET : <nom>

   Règle : après chaque modification, ajouter une ligne datée dans la section du sujet (version + décision + raison).
   Pour travailler sur un sujet, lire sa section et celles listées dans « Liens ». Ne pas relire tout le fichier.

   | Sujet | Liens |
   |---|---|
   | 1. <sujet> | 2, 4 |
   | 2. <sujet> | 1 |
   | … | … |
   | N-1. Tests et méthode | tous |
   | N. À faire | |

   ## 1. <sujet>
   - AAAA-MM-JJ, V1 : <décision>. Raison : <pourquoi>.
   ```

   « Liens » = les sections qu'une modification de ce sujet risque de toucher (ex. : le joystick touche la physique
   et l'écran). Les mettre à jour quand un nouveau lien apparaît.

3. **`README.md`** — une fiche d'entrée d'une quinzaine de lignes : ce qu'est le projet, la version actuelle et une
   phrase par version récente, où sont les fichiers, les outils, `versions/`, comment lancer, le lien de publication.
   Rien d'autre : le détail va dans le journal.

4. **`versions/`** — une copie de chaque version publiée (`v1.html`, `v2.html`…), pour revenir en arrière.

## 2. Qui fait quoi

| Travail | Qui | Comment |
|---|---|---|
| Lire les sections du journal avant de travailler | Sous-agent Sonnet, effort medium | Outil Agent, `model: "sonnet"`, `effort: "medium"`. Lui demander les lignes exactes (texte court + numéro de ligne) des décisions et des interdits qui concernent le sujet |
| Comprendre du code, trouver où sont les choses | Sous-agent Sonnet, effort medium | Lui demander des **faits avec numéros de ligne**, pas de conseils |
| Modifier le code | Session principale (Opus, effort max) | Relire soi-même les lignes exactes avant chaque modification |
| Écrire le journal et le README | Sous-agent Sonnet, effort medium | La session principale rédige le **contenu** ; Sonnet le place au bon endroit, dans le style des lignes existantes |
| Vérifier avant d'enregistrer | Session principale | Voir § 5 |

Les sous-agents de lecture peuvent tourner en parallèle (journal, code de deux sujets différents) pendant que la
session principale mesure ou teste. Seul le **modèle qui modifie** relit le code lui-même : un résumé peut se tromper.

Si l'utilisateur change de modèle en cours de session (`/model`), le dire : la règle de `CLAUDE.md` n'est alors plus
suivie à la lettre ; proposer de mettre la règle à jour plutôt que de l'ignorer.

## 3. Avant une modification

1. Repérer le sujet dans le tableau du journal, et ses « Liens ».
2. Faire lire ces sections par Sonnet (pas tout le fichier). Demander en plus : toute règle « à ne jamais faire »,
   les engagements pris envers l'utilisateur, les tests qui couvrent ce sujet, la section « À faire ».
3. Respecter ce qui est écrit. Si une décision passée gêne, la changer **en le disant** dans la nouvelle ligne,
   jamais en silence.

## 4. Après une modification (et à chaque publication)

1. Tests de la section « Tests et méthode » ; noter les résultats.
2. Copier la version publiée dans `versions/vN.<ext>`.
3. Rédiger pour Sonnet un message complet (il ne connaît rien de la conversation) qui contient :
   - le contexte : ce que l'utilisateur a demandé ou constaté, avec ses mots si possible ;
   - **ligne par ligne, section par section**, le contenu à écrire : la décision, la **raison**, les chiffres mesurés,
     ce qu'elle remplace ;
   - les nouveaux tests et leurs résultats (section Tests) ;
   - les questions à poser à l'utilisateur (section À faire) ;
   - le changement du README (version actuelle, une phrase pour la version, `vN` = actuelle, nouveaux outils) ;
   - les interdits : ne toucher qu'à ces deux fichiers, pas de git, ne rien effacer, jamais d'adresse e-mail ni de
     secret ;
   - ce qu'il doit rendre : les sections modifiées avec numéros de ligne.
4. Vérifier (§ 5), puis enregistrer et envoyer (commit, push) avec un message qui dit la version et le pourquoi.

### Format d'une ligne

```
- 2026-11-12, V32 : poussée des virages plafonnée à 0,8 m/s au stick (clavier inchangé). Raison : à 200 km/h elle
  prenait presque la moitié de la direction, la voiture ne tournait plus vers l'intérieur du virage. Remplace, pour le
  stick, la ligne V25 « il faut ~30 % de stick… ». Mesure (t57) : 6,0 m/s stick à fond vers l'intérieur au lieu de 3,8.
```

- **Toujours la raison** : c'est elle qui empêche de défaire la décision plus tard.
- Des chiffres mesurés quand il y en a (avant → après).
- Les leçons qui coûtent cher en **gras** (« **ne jamais …** : <ce qui s'est passé> »).
- Ce qui a été essayé et rejeté, avec pourquoi : une ligne aussi.
- Ne rien effacer ; une ligne qui en remplace une autre le dit.

## 5. Vérifications avant d'enregistrer

- Le diff du journal et du README ne contient ni adresse e-mail, ni clé, ni jeton, ni information privée de
  l'utilisateur (`git diff -- JOURNAL.md README.md | grep -iE '@[a-z0-9-]+\.|token|key'`).
- Seuls `JOURNAL.md` et `README.md` ont changé du fait de Sonnet (`git status`).
- La section « À faire » contient les questions encore ouvertes pour l'utilisateur.

## 6. Rappels qui ont servi

- Un sous-agent démarre sans contexte : tout ce qu'il doit savoir est dans le message, chemins absolus compris.
- Demander des **faits** aux sous-agents de lecture, et les recouper par une mesure ou une relecture avant d'agir.
- Quand l'utilisateur envoie une capture ou des chiffres de son appareil, les noter dans le journal : ce sont les
  seules mesures réelles.
- Le journal sert aussi de liste de questions : quand une réponse arrive (modèle du téléphone, préférence…), la
  marquer « fait » dans la section À faire au lieu de l'effacer.
