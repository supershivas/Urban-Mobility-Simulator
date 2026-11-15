# Carrefours (v0.4)

<!-- Domaine sorti de CLAUDE.md : décisions datées, méthode, mesures et pièges. Un ajout se range ici. -->

## Décisions (Jérôme, v0.4.0)

- **Raccords proposés, à revoir** : les mouvements réels (tourne-à-gauche interdits, voies d'affectation) ne sont dans aucune source. Le jeu propose des raccords calculés, marqués « proposé » (tirets sur la carte et en 3D, bouton en pointillés dans l'éditeur) avec leur méthode et une confiance faible, jusqu'à ce que le joueur les valide ou les change.
- **Périmètre** : raccords voie à voie, traversées par branche (passage piéton, traversée cyclable), régulation du carrefour (feux, priorité de droite, stop / cédez-le-passage, giratoire). Régulation et traversées partent de `null` (« Non renseigné ») : aucune source.
- **Interface** : le même bandeau sous la carte que l'éditeur de section (jamais les deux ouverts), une carte par branche avec sa lettre (reprise sur la carte et en 3D).

## Modèle (`js/carrefour.js`, pur)

- **Branche** : un tronçon relié au nœud, sa ligne orientée depuis le nœud, son cap à min(15 m, L/2). Une boucle (départ = arrivée) n'est pas une branche. Un nœud de moins de deux branches n'est pas modifiable (degré 0 ou 1 : 188 nœuds).
- **Voie** : une bande `voiture`, `bus`, `cyclable` de la section ; une `chaussee` non découpée est une voie « générale » (voies non renseignées) au sens de la source OSM (`unique-direct` / `unique-inverse`, sinon les deux sens) ; un tronçon sans emprise a une voie générale `troncon:inconnu`. Identifiant `troncon:bande` : stable tant que la bande existe.
- **Repère « en s'éloignant du nœud »** : `cote` positif à gauche quand on quitte le nœud. Pour qui arrive, la gauche est la droite de ce repère.
- **Proposition** (`proposer`) : chaque voie entrante vers chaque autre branche (pas de demi-tour), sortie du mode le plus proche (`COMPATIBLES` dans `js/data/carrefours.js` : une voiture ne prend ni bus ni piste ; bus et vélo peuvent rejoindre la circulation générale). Entre voies d'un même mode, les branches sont réparties de gauche à droite (la plus à gauche prend les tourne-à-gauche) ; tout droit (|virage| < 40°) est servi par toutes ; à l'arrivée, gauche → voie la plus à gauche, droite → la plus à droite, tout droit → même rang.
- **Scénario** : `scenario.carrefours[nœud] = { ajoutes, retires, traversees, regulation }`, seulement si non vide. Raccords en vigueur = propositions − retirés + ajoutés, entre voies qui existent : **recalculés à partir des sections du moment**, donc une voie ajoutée dans un tronçon reçoit ses raccords proposés, une voie retirée emporte les siens (les choix du joueur perdus sont comptés).
- **Refus** (`refus.<clé>`) : `demi-tour`, `pas-entrante`, `pas-sortante`, `mode`, `voie`, `sans-trottoir`, `sans-piste`, `section-inconnue` (traversée sur une branche sans emprise : sa largeur est inconnue), `rien-a-valider`, `regulation`.
- **Alertes** (`verifierCarrefour`) : voies entrantes sans issue, voies sortantes jamais atteintes (ex. une piste nouvelle sans piste en face : seule une piste ou… rien n'y mène), raccords invalides (toujours 0 : `raccordsDe` filtre).

## Géométrie (`js/geo/raccords.js`, pur, partagée 2D / 3D)

- **Recul** : demi-emprise la plus large des branches + 1 m, au moins 4 m, au plus 45 % de la longueur d'une branche (`DESSIN_CARREFOUR`, conventions de dessin, pas des normes).
- **Ancre** d'une voie : au recul sur la ligne de sa branche, décalée de son `cote`. Raccord : Bézier quadratique de l'ancre entrante à l'ancre sortante, point de contrôle au croisement des deux directions de marche (sinon le milieu).
- **Zone** : les bords d'emprise de chaque branche au recul, dans l'ordre des branches ; dessinée par-dessus le bout des bandes (les bandes s'arrêtent toujours au bout de leur axe).
- **Traversées** : la traversée cyclable au recul, le passage piéton juste derrière, sur toute l'emprise de la branche ; 3 m et 2 m de profondeur ; en 3D, bandes de 0,5 m (zèbre).
- La carte reçoit `js/carte/carrefours.js` (WGS84), la 3D la même géométrie dans le repère local : mêmes extrémités à 1 cm (`critere-v04.mjs`).

## Mesures

- `test/carrefour.test.mjs` : sur le réseau réel (chaussées découpées en deux voies), tous les nœuds d'au moins deux branches (> 800) : 0 raccord invalide, chaque raccord part et arrive à l'ancre de sa voie.
- `node outils/critere-v04.mjs` (8 carrefours, graine 1 ; et 12, graine 3) : tout passe.

## Pièges

- `querySourceFeatures` rend des morceaux de lignes découpés par tuile : le mode debug lit la source donnée à MapLibre (`raccords2d().raccords`) et vérifie à part que chaque raccord est bien tuilé (`dessines`).
- Une opération de section doit garder `scenario.carrefours` (`{ ...etat.scenario, sections }`) : écrire `{ sections }` effaçait les choix des carrefours (vu par `critere-v03`, relecture).
- Le tireté d'une ligne MapLibre ne dépend pas d'une propriété dans toutes les versions : deux couches (`carrefours-raccord`, `carrefours-raccord-propose`).
- La case « Sections et carrefours » passe sur deux lignes : sans `flex: none`, la case à cocher rétrécissait à 14 px.
