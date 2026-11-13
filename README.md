# Urban Mobility Simulator

> Jeu de conception urbaine sur le corridor réel **Schuman — Roodebeek** (Bruxelles) : redistribuer l'espace de la rue entre piétons, vélos, transports publics et voitures, dans une largeur qui ne s'agrandit pas.

**Statut :** cadrage — prototype 0.1 en préparation\
**Langues :** français, anglais\
**Cible :** navigateur de bureau (porte ouverte vers Steam)

## Le principe

Le joueur n'intervient que sur l'espace public. Élargir un trottoir réduit la chaussée ; une piste cyclable protégée prend la place d'une voie ou du stationnement ; une voie bus transporte plus de personnes avec moins de véhicules. Le jeu rend ces compromis visibles.

- Indicateur central : **personnes transportées par heure**.
- Sécurité traitée comme une contrainte de conception (exposition aux conflits, pas de prédiction d'accidents).
- Géographie réelle, données sources jamais modifiées, valeurs inconnues affichées comme inconnues.

Inspirations de mécanique : *Traffic City*, *Junxions*.

## Feuille de route

| Version | Contenu |
|---|---|
| 0.1 | Carte 2D réelle et navigable, rues, intersections, bâtiments, sélection d'un tronçon, inspecteur |
| 0.2 | Vue 3D (three.js), caméra libre, sélection synchronisée |
| 0.3 | Éditeur de section de rue sous contrainte de largeur |
| 0.4 | Éditeur de carrefours |
| 0.5 | Simulation simplifiée et indicateurs |
| 0.6 | Scénarios, comparaison, sauvegarde |

## Lancer en local

```bash
npm install
```

```bash
npm run vendor
```

```bash
npm test
```

Puis servir le dossier avec n'importe quel serveur statique (le jeu n'a pas de bundler) et ouvrir `index.html`. Aucun service distant n'est nécessaire au démarrage.

## Technique

- Modules ES sans bundler, structure [game-system](https://github.com/supershivas/game-system).
- npm sert uniquement à récupérer les dépendances (copiées dans `vendor/`) et à lancer Vitest.
- MapLibre GL JS (2D), three.js (3D, à partir de 0.2), proj4js, Turf.js.
- Travail métrique en EPSG:31370 (Lambert 72), affichage en GeoJSON WGS84.

## Données et licences

Sources prévues : UrbIS / Datastore Brussels, Brussels Mobility, OpenStreetMap, STIB-MIVB (GTFS). Le détail (URL, date, licence, attribution) sera consigné dans `data/metadata/sources.json`.

Données OpenStreetMap © les contributeurs OpenStreetMap, sous licence [ODbL](https://www.openstreetmap.org/copyright).
