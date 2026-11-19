# Roadmap — Urban Mobility Simulator

Les grosses évolutions envisagées ou en cours. Une entrée reste ici jusqu'à
sa livraison complète, puis en sort (le `CHANGELOG.md` garde la trace). Une
idée écartée part dans `docs/archives/` avec sa raison.

Statuts : **à l'étude** · **validé** (Jérôme a tranché) · **en cours** ·
**à mesurer** (livré, attend un playtest).

## En cours

### Lot minimal — v0.1

**Statut** : à mesurer (livré en 0.1.0, attend la validation de Jérôme)

- [x] Carte 2D du corridor Schuman–Roodebeek : rues, intersections, bâtiments
- [x] Couches activables, retour à l'emprise
- [x] Sélection d'un tronçon, surbrillance, inspecteur
- [x] Valeurs inconnues « Non renseigné », estimations OSM avec méthode et confiance
- [x] Critère mesuré : `npm test` + `node outils/critere-v01.mjs` (40/40, carte prête en ~1,6 s)

### Vue 3D — v0.2

**Statut** : à mesurer (livré en 0.2.0, attend la validation de Jérôme)

- [x] Scène three.js dans le repère local (mètres Lambert 72), mêmes objets et identifiants que la carte
- [x] Bâtiments à la hauteur d'UrbIS 3D ; 721 sans solide restent à plat, « Non renseigné »
- [x] Caméra orbitale, bascule 2D / 3D (V), sélection et inspecteur partagés, bâtiments sélectionnables
- [x] Critère mesuré : `node outils/critere-v02.mjs` (scène prête en ~0,9 s dans le conteneur, 12/12 tronçons, 12/12 bâtiments)

### Éditeur de section transversale — v0.3

**Statut** : à mesurer (livré en 0.3.0, attend la validation de Jérôme)

- [x] Emprise publique par tronçon mesurée sur les surfaces UrbIS (coupes perpendiculaires, méthode et confiance) : 1008 tronçons sur 1183
- [x] Section de départ = bandes mesurées ; la chaussée reste « voies non renseignées » jusqu'à ce que le joueur la découpe
- [x] Bandeau d'édition sous la carte : glisser les limites, ajouter / retirer / déplacer / diviser, type, largeur, sens ; refus motivés
- [x] Annuler / rétablir, retour à la mesure, scénario sauvegardé
- [x] Mêmes bandes en 2D et en 3D ; critère mesuré : `node outils/critere-v03.mjs`
- [ ] Couleurs des bandes (cyclable, bus, stationnement, planté) : [À VALIDER]

### Éditeur de carrefour — v0.4

**Statut** : à mesurer (livré en 0.4.0, attend la validation de Jérôme)

- [x] Branches et voies de chaque nœud depuis les sections ; chaussée non découpée = voies non renseignées (sens OSM)
- [x] Raccords proposés (méthode, confiance faible), détachés / rattachés / validés par le joueur ; refus motivés ; alertes (sans issue, jamais atteinte)
- [x] Passages piétons, traversées cyclables, régulation : « Non renseigné » au départ
- [x] Zone, raccords et traversées dessinés de la même géométrie en 2D et en 3D ; critère mesuré : `node outils/critere-v04.mjs`
- [ ] Méthode de proposition à confronter au terrain (mouvements interdits, voies d'affectation)

### Simulation simplifiée et indicateurs — v0.5

**Statut** : à mesurer (livré en 0.5.0, attend la validation de Jérôme)

- [x] Comptages vélo de Bruxelles Mobilité (4 compteurs, 3 tronçons, 8 h – 9 h, jours ouvrables) ; demande posée par le joueur ailleurs
- [x] Capacité depuis la section (références citées), saturation, personnes / h, temps (BPR), délai aux feux (Webster), conflits des carrefours
- [x] Bandeau des flux (F), inspecteur, couche Flux, barre d'état ; critère mesuré : `node outils/critere-v05.mjs`
- [ ] Taux d'occupation des voitures et des bus : aucune source citée (hypothèse du joueur, « Non renseigné » au départ)
- [ ] Flux en 3D ; légende de la couche Flux

### Construire sur la carte — v0.7

**Statut** : à mesurer (livré en 0.7.0, attend la validation de Jérôme)

- [x] Barre d'outils (voie auto, bus, piste, trottoir, stationnement, planté, sens, retirer) : clic ou glisser sur une voie, en 2D et en 3D ; chaussée inconnue découpée en voies (proposition)
- [x] Flèches au sol du carrefour choisi : un clic allume ou éteint une direction ; couleur du feu
- [x] Feux : modèle proposé, durée de vert par phase, frise ; le trafic s'arrête au rouge pour son mouvement ; critère `node outils/critere-v07.mjs`
- [ ] Profils de rue (écartés pour l'instant au profit de l'outil voie par voie) ; outil au clavier sur la carte
- [ ] Simulation statique (v0.5) : part de vert tirée des phases réglées

### Le trafic bouge — v0.6

**Statut** : à mesurer (livré en 0.6.0, attend la validation de Jérôme)

- [x] Boucle à pas fixe, blocs voiture / bus / vélo sur les voies et raccords du scénario, en 2D et en 3D ; partie ouverte en 3D
- [x] Entrées aux bords (débit de jeu par hiérarchie, « hypothèse de jeu »), route au hasard aux carrefours, IDM, feux du scénario
- [x] Modifications visibles en direct ; pause (Espace), vitesse (X) ; inspecteur « trafic simulé » ; critère `node outils/critere-v06.mjs`
- [ ] Teinte des voitures (`noeud`) [À VALIDER] ; densité de jeu à régler (débits par hiérarchie)
- [ ] Piétons ; priorités et conflits dans la zone de carrefour ; sens des rues inconnu (double sens par défaut, « sans issue »)

## Validé (Jérôme, v0.5.0 : vers un city builder en temps réel)

| Version | Contenu |
|---|---|
| 0.6 | Le trafic bouge : boucle à pas fixe, blocs par mode sur les voies et raccords, files, feux ; partie ouverte en 3D ; demande = comptages + entrées aux bords (débit de jeu par hiérarchie UrbIS, « hypothèse de jeu ») ; route au hasard aux carrefours |
| 0.7 | Construire sur la carte : édition directe (outils de voie), flèches de direction, phases de feux |
| 0.8 | Objectifs sur le corridor, sans budget |
| 0.9 | Vue 3D semi-réaliste |
| plus tard | Scénarios nommés dans la partie, export CSV + JSON ; la comparaison avant / après reste à redéfinir (la question n'était pas claire) |


## À l'étude

### Largeur mesurée contre le terrain

**Statut** : à l'étude
**Constat** : l'emprise vient des surfaces UrbIS (confiance « moyenne » au mieux) ; 175 tronçons de rue n'ont pas de coupe valable (places, carrefours, surfaces interrompues).
**Mesure** : comparer quelques largeurs relevées sur le terrain ; décider du sort des tronçons sans mesure.

### Repères de largeur minimale par usage

**Statut** : à l'étude
Seul un minimum de dessin (0,3 m) est imposé. Des repères (trottoir, piste, voie bus) demandent une source citée (vademecums de Bruxelles Mobilité) avant d'être affichés.

### Sources complémentaires

**Statut** : à l'étude
Bruxelles Mobilité : feux, passages piétons, voies et vitesses des routes régionales, lignes et arrêts STIB (couches WFS listées, contenu à vérifier) — pourraient remplacer des « Non renseigné » des carrefours et de la circulation ; comptages automobiles sans historique ouvert ; STIB GTFS ; nombre de niveaux des bâtiments (aucune source).
