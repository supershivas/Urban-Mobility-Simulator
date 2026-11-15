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

## Validé (pitch, dans l'ordre)

| Version | Contenu |
|---|---|
| 0.4 | Éditeur d'intersections et raccordements |
| 0.5 | Simulation simplifiée et indicateurs |
| 0.6 | Scénarios, comparaison, sauvegarde, finition |

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
Brussels Mobility (hôte `data.mobility.brussels` bloqué en session), STIB GTFS (v0.5), nombre de niveaux des bâtiments (aucune source).
