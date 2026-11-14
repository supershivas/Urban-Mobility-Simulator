Nouveau jeu : **Urban-Mobility-Simulator** (repo `supershivas/urban-mobility-simulator`).

Le pitch : # Urban Mobility Simulator

> Prototype web desktop de conception urbanistique centré sur la
> transformation de la voirie et l'organisation des mobilités, à partir
> du corridor réel reliant le quartier européen de Bruxelles (Schuman) à
> la station de métro Roodebeek.

**Statut :** cadrage général et spécification du prototype\
**Version de référence :** 0.1\
**Langue du projet :** français pour la documentation initiale\
**Technologies envisagées :** JavaScript ES modules, Vite, MapLibre GL
JS, Three.js, GeoJSON\
**Périmètre initial :** corridor complet Schuman--Roodebeek, carte 2D
d'abord, éditeur 2D/3D synchronisé ensuite.

------------------------------------------------------------------------

## Sommaire

1.  [Vision et concept](#1-vision-et-concept)
2.  [Principes de conception](#2-principes-de-conception)
3.  [Périmètre géographique](#3-périmètre-géographique)
4.  [Progression fonctionnelle](#4-progression-fonctionnelle)
5.  [Architecture générale](#5-architecture-générale)
6.  [Stack technique](#6-stack-technique)
7.  [Sources de données](#7-sources-de-données)
8.  [Formats et systèmes de
    coordonnées](#8-formats-et-systèmes-de-coordonnées)
9.  [Préparation et contrôle des
    données](#9-préparation-et-contrôle-des-données)
10. [Modèle de données](#10-modèle-de-données)
11. [Structure du projet](#11-structure-du-projet)
12. [Interface et expérience
    utilisateur](#12-interface-et-expérience-utilisateur)
13. [Backlog et plan des sprints](#13-backlog-et-plan-des-sprints)
14. [Prototype 0.1 --- spécification
    détaillée](#14-prototype-01--spécification-détaillée)
15. [Principes de l'éditeur de
    voirie](#15-principes-de-léditeur-de-voirie)
16. [Principes de simulation](#16-principes-de-simulation)
17. [Risques et décisions ouvertes](#17-risques-et-décisions-ouvertes)
18. [Tests et définition de terminé](#18-tests-et-définition-de-terminé)
19. [Ordre de réalisation
    recommandé](#19-ordre-de-réalisation-recommandé)
20. [Références et documentation](#20-références-et-documentation)

------------------------------------------------------------------------

## 1. Vision et concept

Urban Mobility Simulator est un jeu/application de conception urbaine
inspiré des city builders, mais dont le champ d'action est
volontairement limité à l'espace public et à la voirie.

Le joueur ne construit pas de bâtiments et ne modifie pas l'affectation
des parcelles. Il intervient sur la composition des rues et des
carrefours afin d'organiser les déplacements et de répartir l'espace
entre les différents modes de transport.

### Objectifs

-   Améliorer la circulation des voitures sans faire de la voiture
    l'unique indicateur de réussite.
-   Développer des infrastructures efficaces pour les transports
    publics.
-   Créer des itinéraires cyclables continus et protégés.
-   Améliorer le confort, la continuité et la sécurité des déplacements
    piétons.
-   Réduire les conflits entre les modes de transport grâce à une
    séparation physique et fonctionnelle adaptée.
-   Comprendre les arbitrages entre capacité, sécurité, accessibilité et
    qualité de l'espace public.

### Modes de déplacement concernés

-   Voitures et véhicules utilitaires.
-   Bus et, lorsque pertinent, trams.
-   Vélos et autres mobilités légères.
-   Piétons.

### Principe de jeu

Le joueur doit composer avec un espace public de largeur limitée. Il
peut réorganiser les surfaces et les voies disponibles, mais ne peut pas
agrandir arbitrairement la rue ni déplacer les bâtiments.

Chaque choix doit donc avoir une conséquence : élargir un trottoir peut
réduire la largeur de chaussée ; créer une piste cyclable protégée peut
modifier le stationnement ou le nombre de voies automobiles ; réserver
une voie aux bus peut augmenter la capacité de transport de personnes
sans augmenter le nombre de véhicules.

Le jeu doit rendre ces compromis visibles et compréhensibles.

------------------------------------------------------------------------

## 2. Principes de conception

### 2.1 Réalisme géographique

Le projet repose sur une géographie réelle de Bruxelles. Les rues,
intersections, bâtiments et principales infrastructures doivent être
placés à leur emplacement réel.

Le rendu recherché est réaliste, sans chercher à reproduire
immédiatement chaque détail architectural. La fidélité géométrique et
l'échelle doivent primer sur les effets visuels.

### 2.2 L'espace public comme ressource limitée

La largeur disponible est une contrainte fondamentale. Une intervention
ne peut pas simplement ajouter une voie sans prendre l'espace ailleurs.

Les dimensions doivent provenir de données fiables ou être explicitement
indiquées comme estimées. Une valeur inconnue ne doit jamais être
présentée comme une mesure réelle.

### 2.3 Sécurité comme contrainte de conception

La sécurité ne doit pas être réduite à un score décoratif. La séparation
physique des flux, la lisibilité des traversées, la continuité des
itinéraires et la gestion des intersections doivent être intégrées au
modèle.

La simulation pourra produire des indicateurs d'exposition aux conflits,
mais ne devra pas prétendre prédire ou certifier le nombre réel
d'accidents.

### 2.4 Mesurer les personnes, pas uniquement les véhicules

L'indicateur central de performance doit être le nombre de personnes
transportées par heure, et non le seul nombre de véhicules.

Une voie de bus peut transporter davantage de personnes qu'une voie
automobile, même si elle accueille moins de véhicules. Les comparaisons
doivent tenir compte de la capacité et de l'occupation des différents
modes.

### 2.5 Données sources séparées des scénarios

Les données géographiques importées doivent rester immuables. Les
aménagements créés par le joueur appartiendront à un scénario distinct.

Cette règle permet de comparer un état initial et plusieurs variantes,
de réinitialiser les modifications et de mettre à jour les données
sources sans écraser le travail de conception.

------------------------------------------------------------------------

## 3. Périmètre géographique

### 3.1 Corridor

-   **Départ :** quartier européen de Bruxelles, avec Schuman comme
    point d'ancrage.
-   **Arrivée :** station de métro Roodebeek.
-   **Zone intermédiaire :** réseau viaire reliant ces deux pôles, avec
    les rues parallèles et connexions transversales utiles pour
    représenter des itinéraires alternatifs.

Le projet doit couvrir le corridor complet, et non un simple itinéraire
linéaire. Les rues adjacentes sont nécessaires pour que les changements
de circulation puissent être étudiés à l'échelle du réseau.

### 3.2 Secteurs de travail indicatifs

  -----------------------------------------------------------------------
  Secteur                             Rôle
  ----------------------------------- -----------------------------------
  Schuman                             Pôle de départ, grands axes et
                                      carrefours structurants

  Mérode -- Montgomery                Connexions entre axes principaux et
                                      réseau secondaire

  Georges Henri -- Gribaumont         Réseau urbain intermédiaire et
                                      variantes d'itinéraires

  Roodebeek                           Pôle d'arrivée et connexions avec
                                      la station
  -----------------------------------------------------------------------

Ce découpage est une proposition de travail, pas un découpage
administratif ni une liste exhaustive des rues.

### 3.3 Méthode de délimitation

1.  Identifier les géométries fiables des points d'ancrage Schuman et
    Roodebeek.
2.  Extraire les axes de rues et les intersections de la zone.
3.  Identifier les itinéraires possibles et les connexions secondaires.
4.  Définir les rues adjacentes nécessaires à l'étude des itinéraires
    alternatifs.
5.  Construire une emprise polygonale englobant le réseau sélectionné et
    une marge suffisante.
6.  Vérifier visuellement que les rues périphériques ne sont pas coupées
    de façon incohérente au bord de l'emprise.
7.  Enregistrer et versionner le polygone final.

L'emprise est une zone de chargement des données, pas nécessairement une
limite de jeu infranchissable.

**À valider avant le traitement définitif :** les points d'ancrage, la
liste des rues incluses, les limites du corridor et la couverture des
données sources.

------------------------------------------------------------------------

## 4. Progression fonctionnelle

Le développement doit être progressif. Il faut d'abord valider la base
géographique, puis construire les outils d'édition et enfin la
simulation.

  -----------------------------------------------------------------------
  Étape                               Résultat
  ----------------------------------- -----------------------------------
  Prototype 0.1                       Carte 2D réelle, navigable, rues,
                                      intersections, bâtiments, sélection
                                      et inspecteur

  Prototype 0.2                       Rendu 3D du corridor avec bâtiments
                                      et caméra libre

  Prototype 0.3                       Éditeur de sections de voirie et
                                      synchronisation 2D/3D

  Prototype 0.4                       Éditeur d'intersections et de
                                      raccordements

  Prototype 0.5                       Simulation simplifiée des flux et
                                      indicateurs

  Prototype 0.6                       Gestion de scénarios, comparaison,
                                      sauvegarde et finition
  -----------------------------------------------------------------------

**Règle de progression :** ne pas commencer l'éditeur tant que la
géométrie du réseau, les connexions et les limites physiques disponibles
ne sont pas suffisamment comprises.

------------------------------------------------------------------------

## 5. Architecture générale

### 5.1 Architecture logique

Le projet doit être organisé autour d'un modèle géographique central,
indépendant des moteurs de rendu.

``` text
                    APPLICATION
                         |
                   PROJECT MANAGER
                         |
                      DATA STORE
                         |
                 GEOGRAPHIC MODEL
                         |
                +--------+--------+
                |                 |
              MAP 2D            SCENE 3D
             MapLibre            Three.js
                |                 |
                +--------+--------+
                         |
                     SHARED UI
                         |
              Selection / Inspector
                         |
                EDITOR (future)
                         |
             SCENARIO / SIMULATION
```

MapLibre et Three.js ne doivent pas posséder chacun leur propre version
métier des rues. Les deux vues lisent le même modèle et utilisent les
mêmes identifiants d'objets.

### 5.2 Trois états de données

``` text
originalData
    Données importées, immuables

normalizedData
    Données nettoyées, normalisées et contrôlées

currentScenario
    État éditable créé par le joueur
```

Un futur `simulationState` contiendra les résultats calculés à partir du
scénario actif.

### 5.3 Responsabilités des modules

-   **core :** cycle de vie de l'application, configuration, stockage en
    mémoire, gestion de projet et événements.
-   **data :** chargement, validation, normalisation, conversions et
    topologie.
-   **map :** rendu 2D et couches cartographiques.
-   **scene :** rendu 3D, caméra et génération des objets.
-   **editor :** sélection et outils de modification de la voirie.
-   **simulation :** réseau, demande, calculs de capacité et métriques.
-   **ui :** panneaux, inspecteur, barres d'outils et commandes.
-   **tests :** validation des données, de la géométrie et des
    comportements.

------------------------------------------------------------------------

## 6. Stack technique

### Choix recommandés

  -----------------------------------------------------------------------
  Technologie             Rôle                    Quand
  ----------------------- ----------------------- -----------------------
  JavaScript ES modules   Langage et modularité   Dès le départ

  Vite                    Serveur de              Dès le départ
                          développement et        
                          bundling                

  MapLibre GL JS          Carte 2D et interaction Prototype 0.1
                          géographique            

  GeoJSON                 Échange et chargement   Prototype 0.1
                          de données              
                          géographiques           

  Three.js                Scène 3D                Prototype 0.2

  Turf.js                 Opérations géométriques Selon besoin
                          GeoJSON côté JavaScript 

  proj4js                 Conversions de          Selon besoin
                          coordonnées dans le     
                          navigateur              

  GDAL/OGR et QGIS        Préparation des données Dès le traitement
                          SIG hors navigateur     initial

  Vitest                  Tests unitaires         Dès le départ

  Web Workers             Traitements coûteux     Optimisation ultérieure
                          hors du thread UI       
  -----------------------------------------------------------------------

### Documentation officielle

-   Vite : https://vite.dev/guide/
-   MapLibre GL JS : https://maplibre.org/maplibre-gl-js/docs/
-   Three.js : https://threejs.org/docs/
-   Turf.js : https://turfjs.org/docs/
-   proj4js : https://proj4js.org/
-   GDAL : https://gdal.org/
-   Vitest : https://vitest.dev/guide/

### Choix pragmatique

Ne pas introduire Three.js dans le premier prototype. Il faut d'abord
valider la géographie et les interactions 2D. L'ajout d'un moteur 3D
avant la validation des données augmenterait la complexité sans réduire
le risque principal du projet.

------------------------------------------------------------------------

## 7. Sources de données

Les données doivent être téléchargées et préparées localement. Le
prototype ne doit pas dépendre d'un service distant pour afficher le
corridor.

Les sources ci-dessous sont des pistes prioritaires à examiner. La
disponibilité exacte des couches, leurs champs, leur licence et leur
couverture doivent être vérifiés au moment de l'extraction. Aucune
donnée n'est considérée comme récupérée ou validée par ce document.

### 7.1 UrbIS / Paradigm --- source géographique principale

Priorité : très élevée.

Données à rechercher : - axes de rues ; - nœuds et intersections ; -
surfaces de voirie ; - limites de voirie, si disponibles ; - empreintes
de bâtiments ; - ponts et tunnels, si disponibles.

Liens : - Présentation UrbIS :
https://be.brussels/fr/propos-de-la-region/les-donnees-urbis - Datastore
Brussels : https://datastore.brussels/

UrbIS doit être examiné en premier pour établir une base géométrique
régionale cohérente. Vérifier le catalogue précis, les champs, le
système de coordonnées, la date de mise à jour, les formats et les
conditions de réutilisation.

### 7.2 Brussels Mobility

Priorité : élevée.

Données à rechercher : - routes régionales ; - infrastructures cyclables
; - données de comptage ; - vitesses et volumes de circulation ; - feux
et équipements de mobilité, si disponibles.

Liens : - Portail : https://data.mobility.brussels/ - Regional roads :
https://data.mobility.brussels/nl/info/Regional_roads/ - API comptages :
https://data.mobility.brussels/traffic/api/counts/

Attention : la couche des routes régionales ne représente pas
nécessairement l'ensemble du réseau routier bruxellois. Ne pas
l'utiliser seule pour reconstruire le corridor.

### 7.3 OpenStreetMap

Priorité : complémentaire.

Attributs potentiellement utiles : - `highway` - `oneway` - `lanes` -
`maxspeed` - `cycleway` - `sidewalk` - `busway` - `access` - `surface` -
`crossing`

Liens : - Carte : https://www.openstreetmap.org/ - Copyright et licence
: https://www.openstreetmap.org/copyright

OpenStreetMap est distribué sous licence ODbL. Respecter les obligations
d'attribution et de partage à l'identique applicables aux bases
dérivées. Conserver la date et la méthode d'extraction.

Utiliser OSM comme complément et outil de contrôle, pas comme substitut
automatique à la géométrie régionale.

### 7.4 STIB-MIVB et GTFS

Priorité : utile pour les futurs sprints, non bloquant pour le premier
affichage.

Fichiers GTFS à examiner : - `stops.txt` - `routes.txt` - `trips.txt` -
`stop_times.txt` - `shapes.txt` - `calendar.txt` - `calendar_dates.txt`

Lien de catalogue : - Belgian Mobility Open Data :
https://data.belgianmobility.io/en/data.html

Vérifier la source de distribution, les conditions d'accès, la licence
et les conditions de redistribution propres aux données STIB.

### 7.5 Relief

Priorité : faible pour le prototype 0.1.

Un modèle numérique de terrain peut améliorer le rendu 3D ultérieur.
Vérifier précisément la résolution, la couverture et les droits
d'utilisation. Certaines données de terrain référencées dans les
catalogues belges peuvent comporter des restrictions, notamment
commerciales.

Catalogue : - https://www.geo.be/

Ne pas intégrer un jeu de données de relief dans une application
distribuée ou commercialisée sans validation de sa licence.

### 7.6 Registre des sources

Créer `data/metadata/sources.json`. Pour chaque jeu de données,
consigner : - organisme ; - nom du jeu ; - URL de la fiche ; - URL de
téléchargement ou service ; - date de récupération ; - version ou date
de publication ; - format ; - système de coordonnées ; - licence ; -
attribution requise ; - restrictions ; - couches et champs utilisés ; -
remarques sur la qualité.

------------------------------------------------------------------------

## 8. Formats et systèmes de coordonnées

### 8.1 Projection de travail

Utiliser **EPSG:31370 --- Belgian Lambert 72** pour les opérations
métriques en Belgique.

Ce système permet de travailler en mètres pour : - longueur des tronçons
; - largeur des chaussées ; - distances ; - buffers ; - surfaces ; -
décalages latéraux ; - construction de sections de voirie.

Référence : https://epsg.io/31370

### 8.2 GeoJSON

Le GeoJSON conforme à la RFC 7946 utilise des coordonnées WGS84
longitude/latitude. Ne pas écrire directement des coordonnées Lambert 72
dans un GeoJSON standard.

Référence : https://datatracker.ietf.org/doc/html/rfc7946

### 8.3 Chaîne de traitement

``` text
Données sources
(Shapefile, GeoPackage, WFS, GTFS, etc.)
                 |
                 v
          Données originales
                 |
                 v
       Nettoyage / normalisation
                 |
                 v
             EPSG:31370
                 |
          Calculs métriques
                 |
                 v
        Modèle géographique
                 |
           +-----+-----+
           |           |
           v           v
    GeoJSON WGS84   Coordonnées
    pour MapLibre   locales en mètres
                    pour Three.js
```

Pour Three.js, définir une origine locale proche du corridor et
convertir les coordonnées métriques en coordonnées relatives à cette
origine. Éviter d'utiliser directement longitude et latitude comme
coordonnées 3D.

### 8.4 Outils de conversion

-   GDAL/OGR pour les traitements et conversions SIG.
-   QGIS pour inspecter visuellement les couches et effectuer les
    contrôles.
-   proj4js pour les transformations nécessaires côté JavaScript.

Les transformations géodésiques ne doivent pas être réimplémentées
manuellement.

------------------------------------------------------------------------

## 9. Préparation et contrôle des données

### 9.1 Principe

Conserver les fichiers sources sans modification dans `data/original/`.
Les transformations doivent être reproductibles et produire des fichiers
dans `data/processed/`.

### 9.2 Pipeline

1.  Inventorier les sources et licences.
2.  Télécharger les couches pertinentes.
3.  Découper les données selon l'emprise validée.
4.  Reprojeter en EPSG:31370 pour les traitements métriques.
5.  Normaliser les noms de champs et les types de géométrie.
6.  Attribuer des identifiants internes stables.
7.  Contrôler les géométries.
8.  Construire et contrôler la topologie.
9.  Convertir les couches finales en GeoJSON WGS84.
10. Produire un rapport de qualité et les métadonnées.

### 9.3 Nettoyage géométrique

Contrôler : - géométries vides ; - géométries invalides ; - doublons ; -
segments de longueur nulle ; - lignes interrompues ; - polygones
invalides ; - objets hors emprise ; - coordonnées aberrantes.

Ne pas fusionner automatiquement des tronçons uniquement parce qu'ils
portent le même nom. Les sens, niveaux, gestionnaires, connexions ou
géométries peuvent différer.

### 9.4 Contrôle topologique

Créer un graphe de réseau à partir des axes et des nœuds.

Contrôles : 1. chaque extrémité de tronçon doit être associée à un nœud
; 2. chaque nœud doit référencer ses tronçons connectés ; 3. les
croisements géométriques doivent être examinés pour distinguer les
vraies intersections des croisements dénivelés ; 4. ponts et tunnels ne
doivent pas être connectés artificiellement au réseau de surface ; 5.
les nœuds isolés et tronçons sans connexion doivent être rapportés.

Un croisement en plan n'est pas nécessairement une intersection
routière.

### 9.5 Sorties attendues

``` text
data/
  original/
    urbis/
    brussels-mobility/
    osm/
    stib/
  processed/
    corridor.geojson
    streets.geojson
    intersections.geojson
    street-surfaces.geojson
    buildings.geojson
    mobility-infrastructure.geojson
    network.json
    metadata.json
  metadata/
    sources.json
    corridor.geojson
    quality-report.md
```

Si les GeoJSON deviennent trop volumineux, partitionner par secteur ou
envisager des tuiles vectorielles. Ne pas optimiser prématurément avant
d'avoir mesuré le volume réel.

------------------------------------------------------------------------

## 10. Modèle de données

### 10.1 Entités

  -----------------------------------------------------------------------
  Entité                  Géométrie               Rôle
  ----------------------- ----------------------- -----------------------
  `street`                Référence               Rue, nom et
                                                  informations générales

  `streetSegment`         LineString              Portion entre deux
                                                  intersections

  `intersection`          Point ou Polygon        Nœud du réseau et
                                                  carrefour

  `carriageway`           Polygon                 Surface de chaussée

  `roadBoundary`          LineString              Limite physique de
                                                  voirie

  `building`              Polygon / MultiPolygon  Emprise d'un bâtiment

  `infrastructure`        Point / LineString /    Piste, arrêt, passage,
                          Polygon                 feu, etc.

  `lane`                  LineString / Polygon    Future voie éditable
  -----------------------------------------------------------------------

Une rue, un tronçon, une chaussée et une voie ne sont pas le même objet.
Cette distinction est essentielle pour l'éditeur.

### 10.2 Exemple de structure

``` json
{
  "project": {
    "id": "brussels-schuman-roodebeek",
    "name": "Urban Mobility Simulator",
    "version": "0.1.0",
    "workingCrs": "EPSG:31370",
    "displayCrs": "EPSG:4326",
    "dataSources": []
  },
  "streets": [
    {
      "id": "street_internal_id",
      "sourceIds": {
        "urbis": null,
        "osm": null
      },
      "name": null,
      "segmentIds": []
    }
  ],
  "streetSegments": [
    {
      "id": "segment_internal_id",
      "streetId": "street_internal_id",
      "fromNode": "node_a",
      "toNode": "node_b",
      "geometry": null,
      "lengthMeters": null,
      "sourceAttributes": {
        "oneway": null,
        "lanes": null,
        "speedLimit": null,
        "roadOwner": null,
        "roadManager": null
      },
      "dataQuality": {
        "geometry": "source",
        "attributes": "unknown",
        "confidence": "unverified"
      },
      "editable": false
    }
  ],
  "intersections": [
    {
      "id": "node_a",
      "geometry": null,
      "connectedSegmentIds": [],
      "intersectionType": null,
      "level": null
    }
  ],
  "carriageways": [],
  "roadBoundaries": [],
  "buildings": [],
  "infrastructures": []
}
```

Les identifiants et valeurs de cet exemple sont illustratifs, pas des
données réelles.

### 10.3 Attributs essentiels

**Street** - identifiant interne ; - identifiants sources ; - nom ; -
liste des tronçons.

**StreetSegment** - identifiant interne stable ; - rue parente ; - nœud
de départ et d'arrivée ; - géométrie ; - longueur métrique ; - attributs
disponibles (sens, voies, vitesse, gestionnaire) ; - provenance et
qualité ; - état éditable.

**Intersection** - identifiant ; - géométrie ; - tronçons connectés ; -
type de carrefour si connu ; - niveau ou altitude logique si disponible
; - régulation si renseignée.

**Carriageway** - identifiant ; - tronçon parent ; - géométrie
surfacique ; - largeur si connue ; - type de surface ; - source et
niveau de confiance.

**RoadBoundary** - identifiant ; - géométrie ; - type de limite
(bordure, trottoir, séparation, limite de chaussée, etc.) ; - source et
confiance.

**Building** - identifiant ; - géométrie ; - hauteur et nombre de
niveaux si connus ; - source.

**Infrastructure** - identifiant ; - type ; - géométrie ; - source ; -
attributs disponibles.

### 10.4 Gestion des inconnues

Les valeurs absentes restent `null` ou portent un statut explicite. Ne
pas déduire automatiquement : - largeur de chaussée ; - largeur d'une
voie ; - nombre de voies ; - vitesse réglementaire ; - hauteur d'un
bâtiment ; - priorité à une intersection.

Les estimations éventuelles devront être identifiées comme telles, avec
méthode et niveau de confiance.

------------------------------------------------------------------------

## 11. Structure du projet

``` text
urban-mobility-simulator/
├── index.html
├── package.json
├── vite.config.js
├── README.md
├── public/
│   └── assets/
│       ├── icons/
│       ├── materials/
│       └── models/
├── data/
│   ├── original/
│   ├── processed/
│   ├── metadata/
│   └── scenarios/
├── src/
│   ├── main.js
│   ├── core/
│   │   ├── application.js
│   │   ├── project-manager.js
│   │   ├── event-bus.js
│   │   ├── coordinates.js
│   │   └── data-store.js
│   ├── data/
│   │   ├── importer.js
│   │   ├── normalizer.js
│   │   ├── schema.js
│   │   ├── validator.js
│   │   └── topology.js
│   ├── map/
│   │   ├── map2d.js
│   │   └── layers2d.js
│   ├── scene/
│   │   ├── scene3d.js
│   │   ├── buildings3d.js
│   │   └── camera3d.js
│   ├── editor/
│   │   ├── selection.js
│   │   ├── inspector.js
│   │   ├── road-editor.js
│   │   ├── lane-editor.js
│   │   └── intersection-editor.js
│   ├── simulation/
│   │   ├── network.js
│   │   ├── demand.js
│   │   ├── routing.js
│   │   ├── traffic.js
│   │   └── metrics.js
│   └── ui/
│       ├── toolbar.js
│       ├── inspector-panel.js
│       ├── view-switcher.js
│       ├── timeline.js
│       └── analytics.js
├── styles/
│   ├── main.css
│   ├── interface.css
│   └── map.css
└── tests/
    ├── coordinates.test.js
    ├── schema.test.js
    ├── geometry.test.js
    └── topology.test.js
```

Les modules des futurs sprints peuvent être prévus dans l'organisation,
mais ne doivent pas être développés prématurément.

------------------------------------------------------------------------

## 12. Interface et expérience utilisateur

### 12.1 Cible

Application desktop, pensée en priorité pour un écran d'environ 1440 ×
900 px. L'interface doit laisser la plus grande surface possible à la
carte.

### 12.2 Organisation générale

``` text
┌──────────────────────────────────────────────────────────────┐
│ URBAN MOBILITY SIMULATOR      SCHUMAN — ROODEBEEK       0.1  │
├──────┬─────────────────────────────────────────┬─────────────┤
│      │                                         │ INSPECTEUR  │
│ OUTILS│                                        │             │
│      │                                         │ Nom         │
│ 2D   │                                         │ ID          │
│ 3D   │              CARTE                      │ Longueur    │
│      │                                         │ Nœuds       │
│ Couches│                                       │ Attributs   │
│      │                                         │ Sources     │
├──────┴─────────────────────────────────────────┴─────────────┤
│ Sources | Projection | Emprise | État des données             │
└──────────────────────────────────────────────────────────────┘
```

### 12.3 Vue 2D

-   navigation par zoom et déplacement ;
-   rues et intersections ;
-   bâtiments ;
-   couches activables ;
-   sélection et surbrillance d'un tronçon ;
-   retour à l'emprise du corridor.

### 12.4 Vue 3D ultérieure

-   caméra libre ;
-   bâtiments extrudés ;
-   représentation des surfaces de rue ;
-   sélection des mêmes objets que dans la vue 2D ;
-   synchronisation de la sélection et de l'emprise.

### 12.5 Inspecteur

Afficher : - nom de la rue ; - identifiant du tronçon ; - longueur ; -
nœuds de départ et d'arrivée ; - sens, nombre de voies et vitesse si
renseignés ; - sources des attributs ; - qualité ou statut des données.

Les champs absents doivent être affichés comme « Non renseigné » ou «
Inconnu », jamais remplacés par une valeur supposée.

------------------------------------------------------------------------

## 13. Backlog et plan des sprints

Le calendrier dépendra de la disponibilité et de la qualité des données.
Les durées sont indicatives ; les critères de sortie sont prioritaires.

### Sprint 1 --- Base géographique

**Objectif :** carte 2D réelle et navigable, rues, intersections,
bâtiments, sélection des tronçons et inspecteur.

  ID       Tâche                                       Priorité   Dépendance
  -------- ------------------------------------------- ---------- ----------------
  GEO-01   Inventorier les sources et leurs licences   P0         ---
  GEO-02   Définir le périmètre Schuman--Roodebeek     P0         GEO-01
  GEO-03   Récupérer les couches UrbIS pertinentes     P0         GEO-02
  GEO-04   Récupérer les données Brussels Mobility     P1         GEO-02
  GEO-05   Extraire les données OSM complémentaires    P1         GEO-02
  GEO-06   Récupérer les empreintes de bâtiments       P0         GEO-02
  GEO-07   Inventorier les attributs disponibles       P0         GEO-03 à 06
  GEO-08   Normaliser géométries et identifiants       P0         GEO-07
  GEO-09   Contrôler la topologie                      P0         GEO-08
  GEO-10   Générer les GeoJSON finaux                  P0         GEO-09
  APP-01   Initialiser Vite et les modules ES          P0         ---
  APP-02   Créer le modèle de données central          P0         GEO-08
  APP-03   Implémenter et tester les conversions       P0         APP-01
  MAP-01   Afficher la carte MapLibre                  P0         APP-01
  MAP-02   Afficher rues et intersections              P0         GEO-10, MAP-01
  MAP-03   Afficher les bâtiments                      P0         GEO-10, MAP-01
  UI-01    Créer l'interface générale                  P1         APP-01
  UI-02    Implémenter la sélection interactive        P0         MAP-02, APP-02
  UI-03    Créer l'inspecteur                          P0         UI-02
  QA-01    Tester données, géométrie et navigation     P0         GEO-10, UI-03

#### Critères d'acceptation du Sprint 1

-   Chaque source retenue possède une URL, une date, un format et une
    licence documentés.
-   Le corridor et ses points d'ancrage sont définis.
-   Les données géographiques sont présentes localement et leur
    provenance est documentée.
-   Les champs disponibles, absents et inconnus sont inventoriés.
-   Chaque objet possède un identifiant interne stable.
-   Les anomalies topologiques sont rapportées.
-   Les GeoJSON sont valides et affichables.
-   Les conversions de coordonnées sont testées.
-   Les rues, intersections et bâtiments sont visibles sur toute
    l'emprise.
-   Un clic sélectionne le bon tronçon et le met en évidence.
-   L'inspecteur affiche ses attributs disponibles et leur provenance.
-   L'application fonctionne localement après redémarrage.

### Sprint 2 --- Rendu 3D

**Objectif :** représenter le corridor dans une scène Three.js cohérente
avec la carte 2D.

Tâches : - initialiser la scène Three.js ; - définir l'origine locale en
mètres ; - générer les bâtiments depuis les empreintes ; - extruder les
bâtiments lorsque les hauteurs sont disponibles ; - représenter les rues
et surfaces ; - ajouter caméra libre, rotation, zoom et déplacement ; -
synchroniser la sélection entre 2D et 3D.

Critère de sortie : la scène 3D représente le même territoire et les
mêmes objets que la carte 2D. La sélection d'un tronçon est cohérente
dans les deux vues.

### Sprint 3 --- Éditeur de voirie

**Objectif :** modifier la composition des rues dans une emprise
physique contrainte.

Tâches : - représenter les chaussées et limites physiques ; - définir
une section transversale paramétrique ; - ajouter, supprimer, déplacer
et réordonner des voies ; - définir le type, la largeur et le sens de
chaque voie ; - gérer les séparations physiques ; - contraindre la somme
des largeurs à l'emprise disponible ; - mettre à jour la représentation
2D et 3D ; - ajouter annulation et rétablissement.

Critère de sortie : une modification en 2D se retrouve en 3D sans
chevauchement ni dépassement non autorisé.

### Sprint 4 --- Intersections

**Objectif :** permettre la modification des carrefours et le
raccordement des voies.

Tâches : - représenter les zones de carrefour ; - connecter les voies
entrantes et sortantes ; - gérer les traversées piétonnes et cyclables
; - intégrer feux et priorités si les données sont disponibles ; - gérer
ponts, tunnels et niveaux distincts ; - vérifier la continuité des
itinéraires.

Critère de sortie : les voies créées dans les tronçons restent
correctement connectées aux intersections.

### Sprint 5 --- Simulation simplifiée

**Objectif :** évaluer les conséquences des aménagements sans démarrer
par une simulation microscopique complexe.

Premiers indicateurs : - demande par mode ; - capacité théorique des
voies ; - vitesses ; - temps de parcours ; - files d'attente simplifiées
; - délais aux intersections ; - personnes transportées par heure ; -
indicateurs d'exposition aux conflits.

La sécurité doit être présentée comme une contrainte et un indicateur
d'exposition, pas comme une prédiction certifiée des accidents.

Une intégration de SUMO pourra être étudiée ultérieurement si une
simulation microscopique multimodale devient nécessaire :
https://sumo.dlr.de/docs/

### Sprint 6 --- Scénarios et finition

Tâches : - sauvegarde et chargement de scénarios ; - comparaison état
initial / état modifié ; - historique et annulation ; - affichage des
indicateurs ; - export des résultats ; - optimisation des performances
; - documentation et finition.

------------------------------------------------------------------------

## 14. Prototype 0.1 --- spécification détaillée

### 14.1 Objectif

Créer une application web desktop locale permettant d'explorer le
corridor réel et d'inspecter les tronçons de rue.

Le prototype est une carte SIG interactive. Ce n'est pas encore un
éditeur urbanistique ni un simulateur.

### 14.2 Inclus

-   carte 2D navigable ;
-   emprise complète Schuman--Roodebeek ;
-   rues et intersections ;
-   empreintes de bâtiments ;
-   sélection d'un tronçon ;
-   surbrillance du tronçon sélectionné ;
-   inspecteur des attributs disponibles ;
-   indication des valeurs inconnues ;
-   retour à l'emprise du projet ;
-   chargement de données locales ;
-   structure préparée pour l'ajout de Three.js.

### 14.3 Exclus

-   modification des voies ;
-   création ou suppression de pistes cyclables et trottoirs ;
-   édition des carrefours ;
-   simulation ;
-   véhicules animés ;
-   relief ;
-   bâtiments 3D ;
-   comptes, serveur distant ou synchronisation cloud.

### 14.4 Interface minimale

L'application doit permettre : - zoom et déplacement ; -
activation/désactivation des couches ; - sélection et désélection d'un
tronçon ; - affichage du nom, identifiant, longueur et connexions ; -
consultation des attributs sources ; - identification de la provenance
et de la qualité des données.

### 14.5 Scripts de développement

Exemple de scripts à prévoir dans `package.json` :

``` json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

Commandes :

``` bash
npm install
npm run dev
```

Les fichiers géographiques peuvent être servis comme fichiers statiques
locaux. Si le volume devient trop important, envisager un
partitionnement ou des tuiles vectorielles.

------------------------------------------------------------------------

## 15. Principes de l'éditeur de voirie

Ces principes guideront les futurs sprints ; ils ne font pas partie du
prototype 0.1.

### 15.1 Section transversale

Chaque tronçon éditable doit pouvoir être décrit par une section
transversale composée de bandes ordonnées.

Types possibles : - trottoir ; - piste cyclable ; - séparation / bordure
; - voie automobile ; - voie bus ; - stationnement ; - terre-plein ; -
espace planté.

Chaque bande devra avoir au minimum : - identifiant ; - type ; - largeur
en mètres ; - position dans la section ; - sens de circulation si
applicable ; - séparation physique ; - propriétés d'affichage.

### 15.2 Contraintes

-   La somme des largeurs ne doit pas dépasser l'espace disponible.
-   Les largeurs inconnues de la voirie ne doivent pas être inventées.
-   Les voies doivent rester cohérentes avec la géométrie du tronçon.
-   Les modifications doivent être visibles dans les deux vues.
-   Les carrefours devront être raccordés explicitement.
-   Les données sources ne doivent jamais être modifiées.

### 15.3 Historique

Prévoir une architecture permettant : - undo ; - redo ; - comparaison
avec l'état initial ; - duplication d'un scénario ; - sauvegarde et
rechargement.

------------------------------------------------------------------------

## 16. Principes de simulation

La simulation est postérieure à la validation de l'éditeur.

### Première approche

Commencer par une simulation simplifiée fondée sur : - graphe du réseau
; - demande par mode ; - capacité théorique des voies ; - vitesses de
référence ; - temps de parcours ; - pénalités de carrefour ; -
estimation de files d'attente.

### Indicateurs à privilégier

-   personnes transportées par heure ;
-   temps de parcours par mode ;
-   continuité des itinéraires ;
-   capacité et saturation ;
-   temps d'attente aux carrefours ;
-   exposition aux conflits entre modes ;
-   accessibilité des traversées.

Les résultats doivent être présentés comme des estimations liées aux
hypothèses et à la qualité des données.

### À ne pas développer au départ

-   intelligence artificielle complexe des conducteurs ;
-   modèle d'accidents prédictif ;
-   pollution détaillée ;
-   météo ;
-   économie et coûts de construction ;
-   simulation microscopique complète ;
-   multijoueur.

------------------------------------------------------------------------

## 17. Risques et décisions ouvertes

  -----------------------------------------------------------------------
  Risque / inconnue       Conséquence             Mesure
  ----------------------- ----------------------- -----------------------
  Données ne contenant    Pas de largeur ni de    Rechercher surfaces et
  que des axes            surface aménageable     limites de voirie

  Absence de largeur de   Éditeur impossible à    Mesurer ou identifier
  chaussée                contraindre             les données fiables
                          correctement            

  Attributs OSM           Sens ou nombre de voies Conserver les valeurs
  incomplets              inconnus                inconnues

  Identifiants différents Doublons et             Identifiants internes
  entre sources           associations erronées   et table de
                                                  correspondance

  Ponts et tunnels        Connexions topologiques Gérer les niveaux et
                          fausses                 ouvrages

  Géométries invalides    Erreurs de rendu et de  Validation SIG en amont
                          calcul                  

  Licence restrictive     Redistribution ou       Vérifier chaque licence
                          commercialisation       
                          impossible              

  GeoJSON trop volumineux Ralentissement          Partitionnement ou
                          navigateur              vector tiles

  Mise à jour des sources Scénarios incompatibles Versionner les imports
                          avec la nouvelle        
                          géométrie               

  Données de comptage     Simulation trompeuse    Documenter incertitudes
  imprécises                                      et limites
  -----------------------------------------------------------------------

### Vérifications critiques avant l'éditeur

1.  Les surfaces de voirie sont-elles disponibles, ou seulement les axes
    ?
2.  Les limites entre chaussée, trottoir, espace public et parcelle
    privée sont-elles connues ?
3.  Les intersections sont-elles topologiquement fiables ?
4.  Les bâtiments possèdent-ils des hauteurs documentées ?
5.  Les licences permettent-elles la redistribution et, le cas échéant,
    un usage commercial ?

------------------------------------------------------------------------

## 18. Tests et définition de terminé

### Tests de données

-   GeoJSON parsables.
-   Géométries valides.
-   Identifiants uniques.
-   Références `fromNode` et `toNode` existantes.
-   Coordonnées GeoJSON dans l'ordre longitude/latitude.
-   Conversions métriques contrôlées sur des points de référence.
-   Anomalies topologiques rapportées.
-   Sources et licences documentées.

### Tests d'application

-   L'application démarre localement.
-   La carte couvre toute l'emprise.
-   Zoom et déplacement fonctionnent.
-   Rues, intersections et bâtiments sont correctement positionnés.
-   Un tronçon peut être sélectionné et désélectionné.
-   L'inspecteur affiche le bon objet.
-   Les valeurs inconnues restent inconnues.
-   Les couches peuvent être activées/désactivées.
-   Aucun appel à une API distante n'est indispensable au démarrage du
    prototype.

### Definition of Done --- prototype 0.1

-   [ ] Le périmètre Schuman--Roodebeek est documenté.
-   [ ] Les sources, dates et licences sont inventoriées.
-   [ ] Les données sources originales sont conservées.
-   [ ] Les couches rues, intersections et bâtiments sont préparées.
-   [ ] Les contrôles géométriques et topologiques sont exécutés.
-   [ ] Le modèle de données est documenté.
-   [ ] Les identifiants internes sont stables.
-   [ ] Les GeoJSON finaux sont valides.
-   [ ] La carte couvre tout le corridor.
-   [ ] La navigation fonctionne.
-   [ ] Les tronçons sont sélectionnables.
-   [ ] L'inspecteur affiche les attributs disponibles.
-   [ ] Les sources et données manquantes sont signalées.
-   [ ] Les conversions sont testées.
-   [ ] Le projet démarre localement avec une procédure documentée.

------------------------------------------------------------------------

## 19. Ordre de réalisation recommandé

1.  **Auditer UrbIS.** Vérifier la disponibilité réelle des axes, nœuds,
    surfaces et bâtiments, leurs champs, projections, dates et licences.
2.  **Définir le corridor.** Valider les points d'ancrage, les rues
    adjacentes et le polygone d'emprise.
3.  **Extraire les données complémentaires.** Brussels Mobility et OSM ;
    GTFS si utile.
4.  **Préparer les données.** Nettoyage, normalisation, identifiants
    stables et contrôles topologiques.
5.  **Initialiser le projet JavaScript.** Vite, ES modules, structure et
    tests.
6.  **Construire le modèle central.** Garder les données indépendantes
    de MapLibre.
7.  **Afficher la carte.** Rues, intersections et bâtiments.
8.  **Ajouter sélection et inspecteur.** Vérifier la correspondance
    entre géométrie et objet métier.
9.  **Valider le prototype 0.1.** Couverture, connexions, attributs et
    performances.
10. **Passer à Three.js.** Seulement après validation de la base
    géographique.
11. **Développer l'éditeur.** Sections de voirie, contraintes et
    intersections.
12. **Ajouter la simulation.** Après stabilisation du réseau éditable.

------------------------------------------------------------------------

## 20. Références et documentation

### Données géographiques

-   UrbIS / Région de Bruxelles-Capitale :
    https://be.brussels/fr/propos-de-la-region/les-donnees-urbis
-   Datastore Brussels : https://datastore.brussels/
-   Brussels Mobility : https://data.mobility.brussels/
-   Brussels Mobility --- Regional roads :
    https://data.mobility.brussels/nl/info/Regional_roads/
-   Brussels Mobility --- Traffic counts API :
    https://data.mobility.brussels/traffic/api/counts/
-   OpenStreetMap : https://www.openstreetmap.org/
-   OpenStreetMap --- copyright et licence :
    https://www.openstreetmap.org/copyright
-   Belgian Mobility Open Data :
    https://data.belgianmobility.io/en/data.html
-   Geo.be : https://www.geo.be/

### Géomatique et formats

-   EPSG:31370 --- Belgian Lambert 72 : https://epsg.io/31370
-   GeoJSON RFC 7946 : https://datatracker.ietf.org/doc/html/rfc7946
-   GDAL : https://gdal.org/
-   PROJ : https://proj.org/
-   QGIS : https://qgis.org/
-   proj4js : https://proj4js.org/

### Développement

-   Vite : https://vite.dev/guide/
-   MapLibre GL JS : https://maplibre.org/maplibre-gl-js/docs/
-   Three.js : https://threejs.org/docs/
-   Turf.js : https://turfjs.org/docs/
-   Vitest : https://vitest.dev/guide/
-   SUMO : https://sumo.dlr.de/docs/

------------------------------------------------------------------------

## Note finale

Le risque principal du projet n'est pas le rendu graphique : c'est la
qualité et la précision du modèle géographique, en particulier la
distinction entre axes de rues, surfaces de chaussée, limites physiques
et intersections.

Le premier objectif doit donc être une carte 2D fiable, traçable et
sélectionnable. Elle constituera le socle commun de la future vue 3D, de
l'éditeur de voirie et de la simulation.

**Livrable initial attendu :** une application web desktop locale
affichant le corridor réel Schuman--Roodebeek, avec rues, intersections
et bâtiments, permettant de sélectionner chaque tronçon et de consulter
ses attributs et leur provenance.

**Décisions déjà prises** — ne me les repose pas. Au point 2, pose seulement les questions qui restent (saute un tour qui n'en a plus), et reprends ces décisions telles quelles dans le résumé :
- **Genre** : City / colonie builder, Gestion / automatisation / usine, Simulation de vie / ferme
- **Vue** : 3D, caméra libre ou orbitale
- **Public** : Joueur averti
- **Forme d'une session** : Partie longue continue (aventure, gestion)
- **Palette** : Sur mesure
- **Son** : Aucun son pour la v0
- **Cible** : Bureau
- **Commandes** : Clavier, Souris
- **Langues** : Français + anglais
- **Horizon** : Porte ouverte vers Steam
- **Équipe d'agents** : Aucune

Avant d'écrire du code :

1. **Récupère game-system** et lis ce qu'il faut :
   ```
   git clone --depth 1 https://github.com/supershivas/game-system /tmp/game-system
   ```
   Lis `/tmp/game-system/CONVENTIONS.md` et `/tmp/game-system/CONVENTIONS-DETAIL.md` (elles s'appliquent à ce jeu ; suis
   leur section 25 « Nouveau jeu »), `GENRES.md`, `INSPIRATION.md`, le noyau de
   `MES-INSPIRATIONS.md` (mes inspirations à moi), `LECONS.md` et
   `DESIGN-SYSTEM.md` (il est encore à définir : n'invente pas de règle
   commune, choisis seulement ce qui est propre à ce jeu).

2. **Pose-moi les décisions** avec l'outil `AskUserQuestion`, en questions à
   choix multiples (2 à 4 options, jamais de question ouverte quand un choix
   suffit). Déduis les options de mon pitch et du catalogue `GENRES.md` :
   ne me propose pas une option absurde pour ce jeu, et mets en premier celle
   que tu recommandes, suffixée « (Recommandé) », avec sa raison en une phrase
   dans la description. Si je réponds « Other », prends ma réponse telle
   quelle. Cinq tours au plus, de 4 questions au plus :

   **Tour 1 — le jeu**
   - **Genre** (sélection multiple) : les 4 genres du catalogue les plus
     proches du pitch, toutes familles confondues (action, exploration et
     récit, réflexion, stratégie et gestion, rôle et cartes, famille et
     éducatif, formes particulières). Si j'en choisis plusieurs, demande au
     tour suivant lequel porte la **boucle principale**.
   - **Vue** : de côté, de dessus, isométrique, 3D caméra libre, première
     personne, plateau ou table, écran fixe, interface seule (les 4 plus
     plausibles).
   - **Public** : enfant non lecteur, enfant lecteur, famille à plusieurs,
     joueur occasionnel, joueur averti, tous publics contemplatif (les 4 plus
     plausibles).
   - **Forme d'une session** : partie courte qui recommence (avec ou sans
     progression permanente), partie longue continue, niveaux, quotidien,
     sans fin.
   - Si le pitch ne cite aucune référence, propose en plus 3 croisements
     tirés de `INSPIRATION.md` (une période ou un lieu, une œuvre pour
     l'image, un jeu pour la mécanique), dont au moins un croise le noyau de
     `MES-INSPIRATIONS.md`, en sélection multiple.

   **Tour 2 — l'image et le son**
   - **Rendu** : pixel 2D en canvas maison, pixel 2D avec Phaser, 3D
     pixelisée ou low-poly avec three.js, vectoriel / formes générées,
     illustré (images dessinées à la main), DOM / cartes / texte. Indique le
     profil technique correspondant (`profils/` de game-system) et ce qu'il
     coûte. Une bibliothèque (Phaser, three.js) est une dépendance : copiée
     dans `vendor/`, jamais de CDN.
   - **Palette** : 3 couleurs (Kingvi, Pierre), PICO-8 (16), Sweetie 16
     (Factokid), Endesga 32, sur mesure à partir d'une ambiance que je
     décris. Montre les couleurs proposées dans la description de chaque
     option (valeurs hexadécimales).
   - **Résolution logique et taille du héros** : 3 propositions cohérentes
     avec la vue et la cible (par exemple 320 × 180 et un héros de 16 px ;
     256 × 144 et 9 px ; 360 × 640 portrait et une tuile de 24).
   - **Son** : bruitages synthétisés seulement, musique en fichiers et
     bruitages synthétisés, musique générative, aucun son pour la v0.

   **Tour 3 — jouer**
   - **Cible** : téléphone en portrait, téléphone en paysage, bureau, les
     deux (cible principale + aperçu de l'autre).
   - **Commandes** (sélection multiple) : clavier, toucher / gestes au doigt,
     souris, manette. Précise pour chaque option ce que ferait le joueur.
   - **Langues** : français seulement, français + anglais (tout passe par
     `i18n.js` dès le premier jour).
   - **Horizon** : navigateur seulement, porte ouverte vers Steam
     (section 22 : rien de distant, manette, plein écran, toutes tailles de
     fenêtre).

   **Tour 4 — l'atelier du développeur**
   - **Labo** : dès la v0 (planche d'échelle, palette, sprites, sons,
     variantes), plus tard, jamais.
   - **Atelier** (sélection multiple) : dessins (éditeur de pixels),
     réglages chiffrés, placement sur la carte / niveaux, textes et
     dialogues. Rien coché = pas d'atelier pour l'instant.
   - **Outils de vérification** (sélection multiple) : tests des règles et
     de la sauvegarde (toujours recommandé), captures et audit d'écran,
     lisibilité (contraste, silhouettes), simulateur d'équilibrage, harnais
     de playtest.
   - **Équipe d'agents** : aucune, légère (game-designer, testeur
     fonctionnel, gardien du ton + skills), complète (designers, testeurs,
     joueurs fictifs, synthèse, commandes `/playtest`).

   **Tour 5 — le lot minimal** (adapte au jeu)
   - **Boucle principale** (si plusieurs genres) : laquelle construire d'abord.
   - **Lot minimal** (sélection multiple) : 3 à 4 briques plausibles, déduites
     du pitch, qui suffisent à prouver que le jeu est amusant.
   - **Critère de validation** : 2 à 3 critères mesurables possibles
     (« 200 objets à 60 images/s sur téléphone », « une partie dure 5 à
     8 minutes », « un joueur appliqué gagne 8 fois sur 10, un maladroit
     1 sur 10 »).
   - **Ce que le jeu refuse** (sélection multiple) : 4 refus plausibles
     pour ce jeu (pas de tutoriel bavard, pas de loot, aucun échec, aucune
     urgence, pas d'objectif affiché, pas de texte indispensable…).

   Résume mes choix en quelques lignes avant de commencer.

3. **Installe** avec le script de game-system, selon mes réponses :
   ```
   sh /tmp/game-system/templates/installer.sh --nom "Urban-Mobility-Simulator" --repo supershivas/urban-mobility-simulator \
      [--sans-labo] [--sans-atelier] [--agents aucun|leger|complet] [--sans-playtest]
   ```
   Puis :
   - retire de `js/lib/` les modules que le jeu n'utilisera pas (par
     exemple `i18n.js` en français seul, `gamepad.js` sans manette,
     `pixel-editor.js` sans atelier de dessins) et de `outils/` ce que je n'ai
     pas retenu ; ce qui reste suivra game-system à chaque session ;
   - si le rendu n'est pas « pixel 2D en canvas maison », adapte le jeu de
     départ en suivant le profil (`/tmp/game-system/profils/`) ; pour Phaser
     ou three.js, demande-moi l'accord pour la dépendance et copie la
     version du profil dans `vendor/` ;
   - remplace la palette (`js/palette.js`), la résolution (`main.js`), les
     sprites de départ, redessine `favicon.svg` (et les favicons du labo et
     de l'atelier), puis `node outils/icones.mjs` ;
   - remplis `CLAUDE.md` (Description complète : genre, vue, rendu, cible,
     public, session, Steam, palette, échelle, commandes) et `DESIGN.md`
     (intention, piliers, boucle, lot minimal et son critère, ce que le jeu
     refuse) avec mes réponses ; mets le lot minimal dans `ROADMAP.md` ;
   - si l'équipe est complète : crée 4 à 6 personas `joueur-*` à partir de
     `.claude/agents/joueur-persona.md`, adaptés au public choisi, puis
     supprime le modèle ;
   - `sh scripts/sync-game-system.sh` pour vérifier la synchronisation.

Ensuite, construis le **lot minimal**, et seulement lui : remplace le petit
jeu des étoiles du départ par la boucle principale, en gardant son squelette
(écran titre, réglages, sauvegarde versionnée, pause, mise à jour, mode
debug, labo, atelier). Les règles sont pures et testées (`test/`), le
contenu est dans `data/`. Vérifie (section 19 : tests, captures des deux
cibles sans erreur, audit d'écran, lisibilité), mets `version.json` en
`0.1.0`, `node outils/stamp-version.mjs`, et pousse sur `main`.

Rappelle-moi de régler GitHub Pages sur « GitHub Actions » (Settings → Pages
→ Source) au premier push, donne-moi les deux URL (le jeu et l'aperçu), et
propose-moi la ligne à ajouter au tableau des jeux du README de game-system.