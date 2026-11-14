# Urban Mobility Simulator

> Jeu de conception urbaine sur le corridor réel **Schuman — Roodebeek** (Bruxelles) : redistribuer l'espace de la rue entre piétons, vélos, transports publics et voitures, dans une largeur qui ne s'agrandit pas.

**Statut :** prototype 0.1.0 — carte 2D du corridor, sélection et inspecteur (à valider)\
**Langues :** français, anglais\
**Cible :** navigateur de bureau (porte ouverte vers Steam)

**Jouer :** https://supershivas.github.io/Urban-Mobility-Simulator/ · **Aperçu téléphone :** https://supershivas.github.io/Urban-Mobility-Simulator/apercu.html

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
| 0.2 | Vue 3D (three.js), bâtiments à leur hauteur réelle, caméra orbitale, sélection synchronisée — livrée |
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

```bash
python3 -m http.server 8000
```

`vendor/` et `data/` sont commités : le jeu se lance sans `npm install`. npm ne sert qu'à mettre à jour `vendor/` et à lancer les tests.

Reconstruire les données (le téléchargement est la seule étape qui touche le réseau) :

```bash
node outils/donnees/telecharger.mjs
```

```bash
npm run donnees
```

## Technique

- Modules ES sans bundler, structure [game-system](https://github.com/supershivas/game-system).
- npm sert uniquement à récupérer les dépendances (copiées dans `vendor/`) et à lancer Vitest.
- MapLibre GL JS 6.16.0 (2D), three.js 0.187.0 (3D), proj4js 2.22.0, copiés dans `vendor/` avec leur licence ; Turf (`@turf/buffer`) seulement dans le pipeline de données.
- Travail métrique en EPSG:31370 (Lambert 72), affichage en GeoJSON WGS84.

## Données et licences

Le détail (URL, date, format, licence, attribution, champs, qualité) est dans [`data/metadata/sources.json`](data/metadata/sources.json), le contrôle des données dans [`data/metadata/quality-report.md`](data/metadata/quality-report.md).

- **UrbIS** (Paradigm, Région de Bruxelles-Capitale) : axes, nœuds, surfaces de voirie, bâtiments, ponts, tunnels, rails, stations — licence **CC0**. « UrbIS © Paradigm ».
- **OpenStreetMap** : complément (sens, voies, vitesse), par appariement géométrique.
- Prévues : Brussels Mobility, STIB-MIVB (GTFS).

Données OpenStreetMap © les contributeurs OpenStreetMap, sous licence [ODbL](https://www.openstreetmap.org/copyright).
