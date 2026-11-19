# Prise en main et missions (v0.8)

<!-- Domaine des missions et de l'écran de jeu : décisions datées, calage, pièges. Un ajout se range ici. -->

## Décisions (Jérôme, v0.7.1)

- Constat de Jérôme : « je ne comprends rien au jeu, tout est compliqué, rien ne semble être possible » (ne sait pas quoi faire, trop d'informations, actions qui échouent, effet invisible).
- **Mission guidée + écran épuré** : la partie s'ouvre sur une première mission guidée pas à pas ; l'écran de jeu ne montre que la vue, la barre d'outils, le temps et la carte de mission ; le **mode expert** (O, bouton de l'en-tête, préférence sauvegardée) rend couches, inspecteur et données.
- **Missions sur des lieux réels**, jugées **sur le trafic simulé, tenu** ; **occupation : valeur de jeu réglable** (pas encore utilisée par les missions actuelles) ; récompense : « Mission réussie » puis la suivante (la question des étoiles n'a pas été comprise : pas d'étoiles).

## Missions (`js/data/missions.js`, `js/missions.js`)

| Mission | Lieu | Objectif | Calage (simulation, graine 1) |
|---|---|---|---|
| `piste-loi` (guidée) | rue de la Loi, `seg-u73149` | 3 vélos entrés sur une piste du tronçon | 3e vélo vers 260 s simulées après la piste (~30 s réelles à ×8, accélération automatique) |
| `cortenbergh` | carrefour `node-u2619` (avenue de Cortenbergh, sens inconnu dans OSM) | aucun bloc perdu « sans issue », 5 min tenues | ~70 pertes en 10 min sans rien faire ; chaussée de `seg-u72310` à sens unique sortant : 0 |
| `feux-treves` | Trèves × Jacques de Lalaing, `node-u1899` | file moyenne (90 s) ≤ 4 blocs, 5 min tenues | départ 8 / 70 s : ≈ 11 ; 38 / 38 : 6 ; 50 / 26 : 2,8 |

- `test/missions.test.mjs` prouve, en simulant le vrai corridor, que chaque mission est ratée sans rien faire et réussie par une solution simple. Changer un débit de jeu, le modèle de trafic ou une mission : relancer ce test.
- Une mission peut poser une **situation de départ** (`depart` : le feu mal réglé), une fois, dans l'historique (Ctrl+Z la défait).
- La **progression** est une entrée de sauvegarde à part (`:progression` : réussies, en cours, étape, départs posés) : une nouvelle partie ne la perd pas.
- Mesures ajoutées au trafic : passages par type de voie (`velo@cyclable`), pertes et arrêts par carrefour (`mesuresNoeud`).

## Interface

- Carte de mission en haut à droite de la vue (les deux modes) : numéro, titre, situation, étape guidée ou indice, jauge, boutons (Compris, Voir le lieu, Recommencer, Mission suivante), liste des missions.
- Étapes guidées de la mission 1 : regarder (chaussée encadrée en tirets), choisir l'outil (bouton désigné), poser (survol), attendre (×8 automatique).
- **Survol** : avec un outil actif, la voie qui changera est surlignée et une étiquette dit le résultat exact du clic (l'outil est essayé sur une copie de la section) ou le refus (« Rue non mesurée : pas modifiable »).

## Pièges

- Un bouton animé (rebond) ne se clique pas de façon stable (Playwright attend qu'il s'arrête ; un joueur le rate) : l'outil désigné est cerné, sans mouvement.
- Le survol surlignait toute la chaussée alors que le clic n'en change qu'une voie : l'aperçu montre maintenant le résultat du clic.
