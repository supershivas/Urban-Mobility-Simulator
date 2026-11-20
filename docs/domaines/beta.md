# Jeu bêta « Carte blanche » (v0.9.0)

Un second jeu, ouvert par le bouton « Bêta : carte blanche » de l'écran titre (`beta.html`). Carte vierge, vue 3D seule, minimalisme à la Traffic City / Mini Motorways (esprit des mécaniques seulement). Il ne lit **aucune donnée du corridor** : ses dimensions sont des hypothèses de jeu (`js/beta/donnees.js`), pas des mesures — les piliers 1 et 6 ne s'y appliquent pas.

## Décisions (Jérôme, v0.9.0)

| Sujet | Décision |
|---|---|
| Départ | Une route 2 voies, 2 sens, d'ouest en est (2,4 km, bouts dans la brume) ; des voitures à intervalle dans les deux sens |
| Tracé | 1 clic sur n'importe quel point d'une route = départ ; au survol, la route nouvelle part **perpendiculairement puis tourne en arc** jusqu'au pointeur ; 1 clic = construire. Arrivée près d'une route : raccord (carrefour) ; sinon impasse. Au bout d'une impasse, la route se prolonge |
| Trafic | Les voitures empruntent les routes nouvelles, **branche au hasard** à chaque carrefour (graine fixe) ; elles naissent et disparaissent aux bouts de carte et aux impasses |
| Voies, piste | S'appliquent au **tronçon entre deux carrefours** ; 1 ↔ 2 voies par sens ; piste verte de chaque côté, picto vélo blanc tous les 30 m |
| Démolir | Outil 4 (ou Suppr), au tronçon : un nœud resté seul disparaît, un nœud qui ne relie plus que deux tronçons pareils (mêmes voies, même piste) se referme ; un tronçon qui touche le bord de la carte reste (Jérôme, v0.9.1) |
| Outils | Groupés par usage, une couleur par groupe : **Routes** (1 route, 2 doubler, 3 démolir ; encre), **Vélo** (4 pistes de chaque côté, 5 piste à double sens ; vert), **Carrefours** (6 feux ; ambre). Seul l'outil choisi garde son nom sous 1500 px (Jérôme, v0.9.2) |
| Piste à double sens | Outil à part (comme pour les voies), au tronçon, du côté cliqué ; 2,5 m, tirets blancs au milieu, chacun tient sa droite (Jérôme, v0.9.2) |
| Feux | Outil + **durées réglables** : un clic pose les feux d'un carrefour (3 branches et plus) et ouvre son panneau (− / + par phase, « Retirer les feux »). Une phase par branche (vélos compris, têtes plus petites sur le même mât), puis une phase piétonne ; orange 3 s, rouge intégral 2 s (Jérôme, v0.9.2) |
| Trottoirs | **Partout, d'office**, 2 m de chaque côté, arrondis aux impasses (Jérôme, v0.9.2) |
| Piétons | **Partout** : ils sortent d'un bâtiment, marchent, tournent au hasard aux coins, traversent aux passages (zébrés, devant chaque carrefour), entrent quelque part ; les voitures leur cèdent ; aux feux, ils traversent pendant la phase piétonne (Jérôme, v0.9.2) |
| Carrefours lisibles | D'après la pratique des urbanistes (guides CROW, NACTO, carrefour protégé néerlandais) : rues à **60° au moins** (`TRACE.angleMin`) ; **recul par branche**, jusqu'où les trottoirs de deux branches voisines se séparent (`geometrie.js → reculer`) ; passages perpendiculaires à la rue ; zébra sur la **chaussée automobile seule** (la piste reste verte) ; seules les **traversées cyclables tout droit** sont peintes, bordées de tirets (Jérôme, v0.9.3, après les captures d'imbroglios en 0.9.2) |
| Voies | 1 à **4 par sens** : clic = une de plus (au-delà de 4 × 4 : retour à 2 voies), Maj + clic = une de moins ; refus au-delà de **27 m** de chaussée et de pistes (`ROUTE.largeurMax`), ou si la route élargie mord sur une voisine (Jérôme, v0.9.3) |
| Pistes | Par côté (`pistes = { g, d }`, vu de a vers b) : 'simple' ou 'double' ; **double sens des deux côtés** possible ; un vélo a alors deux files par sens (`velo`, `velo2`) (Jérôme, v0.9.3) |
| Picto vélo | **Debout dans le sens de marche**, comme les marquages réels (lu par le cycliste qui arrive), allongé ; un par file (Jérôme, v0.9.3) |
| Carrefour protégé | Dès qu'une branche a une piste (`n.protege`) : depuis le carrefour, traversée cyclable (2 m, 3 m à double sens si une piste à double sens y arrive), passage piéton, ligne d'arrêt vélo, sas (aux feux), ligne d'arrêt voitures. La chaussée se resserre (`compacter` : zone et amorces), les îlots de coin sont du trottoir, l'anneau cyclable contourne l'îlot par l'extérieur ; les vélos y circulent dans le sens trigonométrique (à rebours seulement sur une traversée à double sens), attendent 1,5 m avant une traversée qui n'est pas libre (aux feux : branche traversée au rouge) ; le premier arrivé à une jonction passe (Jérôme, v0.9.4) |
| Bus | Outil 7 **Voie bus**, au côté cliqué : la voie la plus à droite de ce sens (il faut deux voies) ; les voitures n'y vont jamais, les bus la prennent ; un bus toutes les 24 s à chaque bout de carte ; voie brun-rouge avec « BUS » au sol, séparée par une ligne continue large (Jérôme, v0.9.4) |
| Sas vélo | Automatique aux feux : la ligne des voitures recule de 4 m, sas vert avec un vélo par voie (Jérôme, v0.9.4) |
| Céder | Seulement à qui est sur sa voie ou va y entrer (à 2 m, en marchant vers elle) : `aCeder` (Jérôme, v0.9.4) |
| Passages proches | Deux passages à moins de 8 m l'un de l'autre n'en font qu'un (celui du bout a) ; les lignes de voie s'arrêtent à la ligne d'arrêt (Jérôme, v0.9.4) |
| Rond-point (v0.9.8) | **Autant de voies d'anneau que la plus large route d'accès** (au moins celles de sa taille ; +4 m de chaussée par voie) ; tirets entre voies, ligne pleine contre l'îlot, tirets au bord extérieur ; de l'extérieur vers le centre : **trottoir, piste en anneau (à 1 m de bordure), chaussée** ; la voie de gauche prend l'anneau intérieur (Jérôme, v0.9.8) |
| Rond-point | Outil 9, au carrefour, clics successifs : mini (11 m, îlot franchissable), urbain (16 m, planté), grand (24 m, deux voies) puis plus rien (`GIRATOIRES`). Il retire feux et mouvements. On cède à l'entrée à qui roule dans l'anneau et arrive vers son point d'entrée (`anneauCharge`) ; dans l'anneau, chacun suit qui est devant lui (géométrie) ; dents de requin aux entrées ; avec des pistes, l'anneau cyclable est un cercle (Jérôme, v0.9.5) |
| Mouvements | Par défaut une flèche par voie (une voie : partout ; plusieurs : gauche + tout droit, droite + tout droit, tout droit au milieu ; dans un T, gauche / droite). Outil 0 « Mouvements » : clic sur un carrefour, ses liaisons s'affichent ; **glisser** du bout d'une voie qui arrive (rond blanc) vers une voie qui part (rond bleu) ajoute ou retire, clic sur une liaison la retire ; le dernier mouvement d'une voie reste. Les voitures les suivent (`js/beta/mouvements.js`, `noeud.mouvements`) (Jérôme, v0.9.5) |
| Îlots centraux | Outil 8, au tronçon, clics successifs : refuges (zone peinte hachurée de 2 m, refuge surélevé à chaque passage, on traverse en deux fois et chaque moitié se regarde seule) → terre-plein planté de 3 m (interrompu au droit des passages) → rien (Jérôme, v0.9.5) |
| Virages | Deux tronçons en angle (nœud à deux branches) : chaque bout recule jusqu'où les bords se croisent et la route se courbe, marquages compris ; les coins de trottoir s'arrondissent partout (`coinArrondi`) (Jérôme, v0.9.5) |
| Compteurs | En haut, au milieu : la barre d'outils reste dégagée (Jérôme, v0.9.3) |
| Vélos | Quelques vélos roulent sur les pistes, plus lents ; ils naissent et sortent aux bouts du réseau cyclable |

## Modules

- `js/beta/reseau.js` — nœuds, tronçons, tracé en arc (`tracerArc`), projet (`projetRoute` → refus éventuel), `construireRoute`, `basculerVoies`, `basculerVelo`, `demolir`. Pur, rend `{ reseau }` ou `{ refus }`.
- `js/beta/geometrie.js` — reculs, voies décalées (conduite à droite), zones de carrefour (enveloppe convexe), raccords (Bézier). Lu par le dessin et par le trafic.
- `js/beta/roulage.js` — IDM, apparitions, admission aux carrefours (feux, passages), `traverseeMenacee`, `reconcilier` après une modification. Pur, à graine.
- `js/beta/feux.js` — phases, cycle, état des feux à l'instant t. `js/beta/pietons.js` — piétons sur le réseau piéton de `geometrie.js` (points, trottoirs, coins, traversées). Purs.
- `js/beta/scene.js` — three.js (ne modifie rien) ; `js/beta/main.js` — cycle de vie, outils, commandes, sauvegarde ; `js/beta/textes.js`, `js/beta/donnees.js`.
- Palette : `PALETTE_BETA` dans `js/palette.js`. CSS : `css/beta.css` (aucune couleur).
- Sauvegarde : clé `urban-mobility-simulator:beta` (`{ reseau, camera }`, `v: 1`) ; la langue vient des `prefs` du jeu principal (jamais écrites ici). Le trafic n'est pas sauvegardé : à l'ouverture, 100 s sont simulées d'avance.

## Règles du trafic

- Un véhicule entre dans un carrefour si sa trajectoire ne passe à moins de `TRAFIC.conflit` (2,3 m) d'aucune trajectoire déjà engagée, ne fusionne pas avec elle, et si la voie de sortie a de la place. Même voie d'entrée : une file, elle se suit.
- Qui attend plus de `attenteMax` (4 s) se réserve le carrefour. **Un vélo ne réserve pas** : il attend un trou (sinon, lents, ils bloquaient tout — mesuré en 0.9.0 : 24 sorties en 4 min au lieu de 30+).
- La demande est **par bout de route**, pas par voie : doubler les voies ajoute de la place, pas des voitures (sinon un triangle de carrefours en 2 × 2 se bloquait).
- Soupape : un véhicule arrêté plus de `bloqueMax` (45 s) renonce et disparaît ; le compteur l'affiche (« n renoncent »).
- Un raccord qui tourne de plus de `virageDroit` (0,35 rad) se prend à `vitesseVirage` ; tout droit, à pleine vitesse.

## Règles des piétons et des feux

- Un passage (`largeurTraversee`, 3 m) est devant chaque branche d'un carrefour ; la ligne d'arrêt est 1 m avant. Un véhicule s'arrête avant un passage occupé ; il n'entre pas dans un carrefour dont le passage de sortie (ou d'entrée) est occupé ; dans le carrefour, il attend au bout de son raccord.
- Un piéton ne s'engage pas si un véhicule est sur le passage, arrive à moins de `regardVoiture` s (et `regardMin` m) sans être arrêté, ou est engagé vers cette branche. Une voiture arrêtée à la ligne ne gêne pas.
- Aux feux : on n'entre qu'au vert de sa branche ; un piéton ne part que pendant la phase piétonne, s'il reste au moins la moitié du temps de traversée.
- Densité : `PIETONS.densite` par mètre de trottoir (hypothèse de jeu) ; après une modification, chacun est reposé sur le trottoir le plus proche.

## Commandes

Clic : selon l'outil (1 route, 2 voies, 3 ou Suppr démolir, 4 pistes, 5 piste à double sens, 6 feux, 7 voie bus, 8 îlot central, 9 rond-point, 0 mouvements ; Échap ferme le panneau des feux ou la vue des mouvements). Glisser : déplacer ; clic droit glissé (ou Maj + glisser) : tourner ; molette, + / − : zoom ; flèches / WASD : déplacer ; Q / E : tourner. Clic droit ou Échap : renoncer à la route en projet (Échap sinon : menu). Ctrl Z / Ctrl Y : annuler / rétablir. Espace : pause ; X : vitesse ×1 / ×2 / ×4. Origine : recentrer.

## Vérification

`node outils/test-run.mjs test/beta.test.mjs` ; `node outils/critere-beta.mjs --sortie <dossier>` (à la souris dans le vrai jeu : départ, refus, aperçu, construction, raccord, doubler, piste, trafic, console).

## Pièges

- Virage (nœud à deux branches) : l'axe courbe est prolongé de 0,6 m dans l'axe de chaque tronçon ; sans cela, le dernier segment de la Bézier, un peu de biais, coupait le ruban de travers et laissait voir le trottoir en filet clair à la jonction (0.9.6).

- CSS : les règles des outils doivent passer après `.bouton` (même spécificité) — elles sont préfixées par `.beta-outils` ; une ancienne règle laissée plus bas noircissait l'outil Feux choisi (0.9.2).
- `ruban` retire les points répétés : un aperçu de route de longueur nulle (pointeur sur le départ) plantait le dessin.

- **Nom de fichier** : `js/beta/trafic.js` (0.9.0) était refusé par un bloqueur de publicités (« main.js » non chargé chez Jérôme) : c'est le piège déjà noté en 0.7.1 (`docs/domaines/outillage.md`). Renommé `roulage.js` ; un test de `test/beta.test.mjs` refuse désormais ces noms dans `js/` et `css/`. Le filet de secours de `beta.html` suit les imports et nomme le fichier refusé.

- Calque d'ombres (`ShadowMaterial`, transparent) : sans `depthWrite: false`, il masquait les pictos et le surlignage dessinés après lui.
- `InstancedMesh` des pictos : `frustumCulled = false`, sinon la sphère englobante est celle d'un picto à l'origine et tout disparaît loin de (0, 0).
- `PCFSoftShadowMap` est retiré de la version de three.js du dépôt (avertissement) : ombres en PCF par défaut.
