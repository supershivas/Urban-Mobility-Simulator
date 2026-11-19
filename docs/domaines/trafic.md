# Trafic en temps réel (v0.6)

<!-- Domaine du trafic : décisions datées, modèle, mesures et pièges. Un ajout se range ici. -->

## Décisions (Jérôme, v0.5.0)

- **Direction** : un city builder en temps réel ; on retouche les voies et l'on voit le trafic changer. Ordre : 0.6 le trafic bouge, 0.7 édition directe, 0.8 objectifs, 0.9 vue semi-réaliste.
- **Blocs abstraits** (parallélépipèdes) par mode : voiture, bus, vélo. Pas encore de piétons.
- **Demande** : entrées aux bords du corridor, débit de jeu par hiérarchie UrbIS (`js/data/circulation.js → DEBITS_JEU`, « hypothèse de jeu », réglable) ; la demande posée par le joueur (F) sur une rue d'entrée la remplace. Aucun comptage n'est à un bord : les comptages vélo servent de comparaison dans l'inspecteur.
- **Routes** : au hasard à chaque carrefour, parmi les raccords de la voie compatibles avec le mode (graine fixe). Pas d'origine → destination.
- **Vue** : la partie s'ouvre en 3D ; `?debug=1&vue=2d` la garde sur la carte (outils de vérification).

## Modèle (`js/circulation.js`, pur)

- **Chemins** : une voie de circulation (bande voiture, bus, cyclable ; chaussée non découpée = voie générale au sens d'OSM, double sens si inconnu) donne un chemin par sens. Il va du point d'attache de la voie au carrefour de départ à celui du carrefour d'arrivée (`geometrieCarrefour`), décalé à droite pour une voie à double sens. Chaque raccord en vigueur est un chemin du bout d'une voie au début d'une autre. Clés : `troncon:bande|a` (sens de l'axe) ou `|r`, et `noeud/de>vers` pour un raccord (le nœud : deux tronçons entre les deux mêmes nœuds donnent le même `de>vers` aux deux bouts).
- **Entrées** : les voies qui partent d'un nœud de moins de deux branches (bord du corridor, cul-de-sac). **Sorties** : celles qui y arrivent (`sortie: true`). Un bloc qui arrive à un carrefour sans raccord pour lui sort, compté « sans issue ».
- **Mouvement** : IDM (Treiber, Hennecke et Helbing, 2000 ; valeurs types de `VEHICULES`), vitesse bornée par la limite OSM, sinon 30 km/h (« Ville 30 », 2021) ; 25 km/h dans un raccord (valeur de jeu), avec freinage anticipé. Le bloc de tête regarde le dernier bloc du chemin suivant ; on n'entre dans un chemin que s'il y a la place (deux raccords mènent souvent à la même voie).
- **Feux** (régulation `feux` du scénario) : cycle de `REFERENCES.feux` (90 s, 4 s perdues par phase) ; une phase par paire de branches opposées dans un carrefour à quatre branches, une par branche sinon ; pas de coordination. Un bloc qui ne peut plus s'arrêter (freinage > 4,5 m/s²) passe.
- **Pas de gêne dans la zone de carrefour** (priorités, conflits : plus tard).
- **Mesures** : débit par tronçon et par mode sur les 10 dernières minutes simulées, blocs présents, à l'arrêt, vitesse moyenne.
- **Changement de scénario** : `construireReseau` refait tout (≈ 0,1 s dans Node, 0,1 à 0,3 s dans le navigateur), 150 ms après la dernière modification d'une rafale ; un bloc garde sa place si son chemin existe encore.
- L'état du trafic n'est **pas sauvegardé** : il repart à 8 h à chaque partie ouverte ; seul le scénario l'est.

## Boucle et rendu (`js/main.js`)

- `js/lib/loop.js` (pas de 0,05 s, `hidden: 'pause'`), revenu de game-system en v0.6 avec `rng.js`. Pause : bouton ou Espace, menu ou boîte ouverte, écran titre, onglet caché. Vitesse : ×1, ×2, ×4, ×8 (X).
- 2D : un `<canvas>` par-dessus la carte ; Lambert 72 → écran par une transformation affine calée au centre de la vue à chaque image (écart < 1 px dans l'écran) ; rectangles à l'échelle, au moins 2 × 1,5 px.
- 3D : un `InstancedMesh` par mode (couche « flux ») ; côtés assombris (`ombreMur*`), la 3D n'a pas de lumière.
- Teintes : voiture `noeud` cernée de `voirie` en 2D [À VALIDER], bus `bus`, vélo `cyclable`, cernés d'`encre`.

## Mesures

- `test/trafic.test.mjs` : 9 tests (réseau, continuité, sens, déterminisme, vitesses, chevauchements, feux, reconstruction, corridor réel).
- Corridor réel (Node) : 7 078 chemins, 102 entrées ; 5 minutes simulées en ≈ 1,3 s, ≈ 580 blocs.
- `node outils/critere-v06.mjs` : voir son en-tête.

## Pièges

- Une clé de raccord sans le nœud écrasait l'autre bout d'une boucle de deux tronçons (vu par `critere-v06`, pas par les tests qui suivaient les objets).
- `state().mode === '3d'` est vrai avant que la scène soit construite : attendre `state().scenePreteMs`.
- Des voitures `encre` disparaissaient sur les axes principaux (encre, 3 m), des voitures `voirie` sur la chaussée : d'où `noeud`.
- Reconstruire le réseau à chaque opération rendait `critere-v04` très lent : regroupement des reconstructions (`R.trafic.delaiReconstructionMs`).
- Une rue au sens inconnu dans OSM est jouée à double sens : le sens « faux » mène souvent à un carrefour sans sortie (Cortenbergh) ; ces « sans issue » sont visibles et le joueur peut les corriger (sens de la bande).
