# Construire sur la carte (v0.7)

<!-- Domaine de l'édition directe : décisions datées, méthode, mesures et pièges. Un ajout se range ici. -->

## Décisions (Jérôme, v0.6.0)

- **Outil + clic sur une voie** : une barre d'outils en bas de la vue (voie auto, bus, piste, trottoir, stationnement, planté, sens, retirer) ; un clic sur une voie, en 2D ou en 3D, la transforme en gardant sa largeur ; un glisser applique l'outil à chaque tronçon traversé. Le bandeau de section (M) reste pour le détail et le clavier.
- **Flèches au sol cliquables** : au bout de chaque voie qui entre dans le carrefour choisi, une flèche par direction (gauche, tout droit, droite) ; un clic allume ou éteint la direction, les raccords suivent.
- **Phases proposées + durées** : régulation « Feux » ; modèle (axes opposés ensemble, tourne-à-gauche protégé : 4 branches ; une branche à la fois : toutes) ; un curseur de vert par phase, une frise du cycle ; les flèches prennent la couleur du feu.

## Méthode

- **Outils** (`js/outils.js`, pur) : la voie visée par son décalage à l'axe (`voieSous` dans `main.js` : tronçon de surface le plus proche dont la section couvre le point, signe par produit vectoriel). Une chaussée non découpée est d'abord découpée en voies d'au plus 3,5 m (`DECOUPE`, convention de dessin, signalée « proposition ») ; sens : celui d'OSM s'il est unique, sinon selon le côté de l'axe (une voie à cheval reste à double sens). Le trottoir ou « retirer » sur une chaussée inconnue la prend entière. Refus : `section-inconnue`, `hors-section`, `deja`, `sans-sens`, `derniere`.
- **Directions** (`directionsDe`, `basculerDirection`, `js/carrefour.js`) : une par autre branche, classée par le virage (seuil `ANGLES.toutDroitDegres`). Éteindre retire tous les raccords de la voie vers la branche ; allumer en pose un, choisi comme les propositions (`choisirSortie`).
- **Feux** (`phasesDe`, `definirModeleFeux`, `definirVert`, `etatFeux`, `auVert`) : un mouvement = `troncon>troncon` (d'une branche à l'autre) ; une phase met au vert un ensemble de mouvements pendant `vert` s, puis `perteParPhaseS` (4 s) tout au rouge. Durée bornée 5–90 s (`VERTS`). Le scénario garde `{ regulation: 'feux', feux: { modele, verts } }` ; une autre régulation efface `feux`.
- **Trafic** : chaque raccord porte son mouvement ; un bloc s'arrête au rouge pour le mouvement qu'il a choisi (`c.feu` = les phases du nœud). La simulation statique (v0.5) garde sa part de vert générique.

## Interface

- 2D : la carte ne se déplace plus à la souris quand un outil est actif (`dragPan` coupé ; clavier) ; Maj + glisser n'est pas un geste d'outil. 3D : le bouton gauche peint, le clic droit et Maj + glisser tournent toujours. Échap rend la main.
- Flèches : dessinées dans le calque 2D du trafic (filet blanc) et en polygones dans la 3D (`definirFleches`, maillage refait seulement si elles changent) ; clic : à moins de 14 px de la pointe ou du milieu (`R.selection.toleranceFlechePx`), vérifié avant la sélection. Allumée : encre ; éteinte : bord ; au feu : vert d'eau (`cyclable`) ou rouge (`selection`) avec une barre d'arrêt en 2D.

## Mesures

- `test/outils.test.mjs` (5) ; `test/carrefour.test.mjs` (+3 : directions, feux) ; `test/trafic.test.mjs` (feux par phase).
- `node outils/critere-v07.mjs` : voir son en-tête.

## Pièges

- Un clic au-dessus d'un tunnel visait le tunnel (axe plus proche) : seuls les tronçons de niveau 0 sont visés.
- Le modèle « axes » n'existe qu'à quatre branches : un carrefour à trois branches passe aux feux « une branche à la fois ».
