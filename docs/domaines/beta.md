# Jeu bêta « Carte blanche » (v0.9.0)

Un second jeu, ouvert par le bouton « Bêta : carte blanche » de l'écran titre (`beta.html`). Carte vierge, vue 3D seule, minimalisme à la Traffic City / Mini Motorways (esprit des mécaniques seulement). Il ne lit **aucune donnée du corridor** : ses dimensions sont des hypothèses de jeu (`js/beta/donnees.js`), pas des mesures — les piliers 1 et 6 ne s'y appliquent pas.

## Décisions (Jérôme, v0.9.0)

| Sujet | Décision |
|---|---|
| Départ | Une route 2 voies, 2 sens, d'ouest en est (2,4 km, bouts dans la brume) ; des voitures à intervalle dans les deux sens |
| Tracé | 1 clic sur n'importe quel point d'une route = départ ; au survol, la route nouvelle part **perpendiculairement puis tourne en arc** jusqu'au pointeur ; 1 clic = construire. Arrivée près d'une route : raccord (carrefour) ; sinon impasse. Au bout d'une impasse, la route se prolonge |
| Trafic | Les voitures empruntent les routes nouvelles, **branche au hasard** à chaque carrefour (graine fixe) ; elles naissent et disparaissent aux bouts de carte et aux impasses |
| Doubler, piste | S'appliquent au **tronçon entre deux carrefours** ; 1 ↔ 2 voies par sens ; piste verte de chaque côté, picto vélo blanc tous les 30 m |
| Vélos | Quelques vélos roulent sur les pistes, plus lents ; ils naissent et sortent aux bouts du réseau cyclable |

## Modules

- `js/beta/reseau.js` — nœuds, tronçons, tracé en arc (`tracerArc`), projet (`projetRoute` → refus éventuel), `construireRoute`, `basculerVoies`, `basculerVelo`. Pur, rend `{ reseau }` ou `{ refus }`.
- `js/beta/geometrie.js` — reculs, voies décalées (conduite à droite), zones de carrefour (enveloppe convexe), raccords (Bézier). Lu par le dessin et par le trafic.
- `js/beta/trafic.js` — IDM, apparitions, admission aux carrefours, `reconcilier` après une modification. Pur, à graine.
- `js/beta/scene.js` — three.js (ne modifie rien) ; `js/beta/main.js` — cycle de vie, outils, commandes, sauvegarde ; `js/beta/textes.js`, `js/beta/donnees.js`.
- Palette : `PALETTE_BETA` dans `js/palette.js`. CSS : `css/beta.css` (aucune couleur).
- Sauvegarde : clé `urban-mobility-simulator:beta` (`{ reseau, camera }`, `v: 1`) ; la langue vient des `prefs` du jeu principal (jamais écrites ici). Le trafic n'est pas sauvegardé : à l'ouverture, 100 s sont simulées d'avance.

## Règles du trafic

- Un véhicule entre dans un carrefour si sa trajectoire ne passe à moins de `TRAFIC.conflit` (2,3 m) d'aucune trajectoire déjà engagée, ne fusionne pas avec elle, et si la voie de sortie a de la place. Même voie d'entrée : une file, elle se suit.
- Qui attend plus de `attenteMax` (4 s) se réserve le carrefour. **Un vélo ne réserve pas** : il attend un trou (sinon, lents, ils bloquaient tout — mesuré en 0.9.0 : 24 sorties en 4 min au lieu de 30+).
- La demande est **par bout de route**, pas par voie : doubler les voies ajoute de la place, pas des voitures (sinon un triangle de carrefours en 2 × 2 se bloquait).
- Soupape : un véhicule arrêté plus de `bloqueMax` (45 s) renonce et disparaît ; le compteur l'affiche (« n renoncent »).
- Un raccord qui tourne de plus de `virageDroit` (0,35 rad) se prend à `vitesseVirage` ; tout droit, à pleine vitesse.

## Commandes

Clic : selon l'outil (1 route, 2 doubler, 3 piste). Glisser : déplacer ; clic droit glissé (ou Maj + glisser) : tourner ; molette, + / − : zoom ; flèches / WASD : déplacer ; Q / E : tourner. Clic droit ou Échap : renoncer à la route en projet (Échap sinon : menu). Ctrl Z / Ctrl Y : annuler / rétablir. Espace : pause ; X : vitesse ×1 / ×2 / ×4. Origine : recentrer.

## Vérification

`node outils/test-run.mjs test/beta.test.mjs` ; `node outils/critere-beta.mjs --sortie <dossier>` (à la souris dans le vrai jeu : départ, refus, aperçu, construction, raccord, doubler, piste, trafic, console).

## Pièges

- Calque d'ombres (`ShadowMaterial`, transparent) : sans `depthWrite: false`, il masquait les pictos et le surlignage dessinés après lui.
- `InstancedMesh` des pictos : `frustumCulled = false`, sinon la sphère englobante est celle d'un picto à l'origine et tout disparaît loin de (0, 0).
- `PCFSoftShadowMap` est retiré de la version de three.js du dépôt (avertissement) : ombres en PCF par défaut.
