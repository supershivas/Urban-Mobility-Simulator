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

## Validé (pitch, dans l'ordre)

| Version | Contenu |
|---|---|
| 0.3 | Éditeur de section transversale, contraintes de largeur, undo/redo |
| 0.4 | Éditeur d'intersections et raccordements |
| 0.5 | Simulation simplifiée et indicateurs |
| 0.6 | Scénarios, comparaison, sauvegarde, finition |

## À l'étude

### Largeur disponible par tronçon

**Statut** : à l'étude (bloque la v0.3)
**Constat** : UrbIS n'a aucune largeur sur les axes ; les surfaces (`StreetSurfaces` : chaussée S/SC, trottoir SW, terre-plein M, site propre C…) existent.
**Proposition** : mesurer des coupes perpendiculaires à l'axe sur les surfaces, avec méthode et confiance.
**Mesure** : comparaison avec quelques largeurs relevées sur le terrain.

### Sources complémentaires

**Statut** : à l'étude
Brussels Mobility (hôte `data.mobility.brussels` bloqué en session), STIB GTFS (v0.5), nombre de niveaux des bâtiments (aucune source).
