# Rapport de qualité des données

Produit par `node outils/donnees/construire.mjs` à partir de `data/original/` (récupéré le 2026-11-14T10:01:19.919Z).
Ne pas modifier à la main : relancer le script.

## Emprise

Tampon de 600 m autour de la polyligne des stations SCHUMAN → MERODE → MONTGOMERY → JOSEPHINE-CHARLOTTE → GRIBAUMONT → TOMBERG → ROODEBEEK, plus GEORGES HENRI.
Les objets qui touchent l'emprise sont gardés entiers (pas de découpe au bord).

## Comptes

| Objet | Nombre |
|---|---|
| `streetSegments` | 1489 |
| `intersections` | 1018 |
| `streets` | 322 |
| `surfaces` | 6100 |
| `buildings` | 14478 |
| `infrastructure` | 215 |

## Attributs des tronçons

| Attribut | Renseigné | Non renseigné |
|---|---|---|
| nom (UrbIS) | 1445 | 44 |
| hiérarchie (UrbIS) | 1452 | 37 |
| pente (UrbIS) | 1454 | 35 |
| sens (oneway) | 710 | 779 |
| nombre de voies (lanes) | 318 | 1171 |
| vitesse (maxspeed) | 1203 | 286 |
| emprise publique (mesurée sur les surfaces) | 1008 | 481 |
| gestionnaire (axe) | 0 | 1489 |

## Hauteur des bâtiments

Source : UrbIS – Constructions 3D (tuiles du 2026-11-07), 14276 solides associés par identifiant (`BU_ID`) à un bâtiment chargé.
Hauteur = altitude du point le plus haut des solides UrbIS 3D (LoD 2) associés au bâtiment par son identifiant (BU_ID), moins l'altitude de leur point le plus bas (base du solide). Hauteur au faîte, toiture comprise ; arrondie au décimètre.

| Bâtiments | Nombre |
|---|---|
| hauteur renseignée | 13757 |
| hauteur non renseignée (aucun solide associé) | 721 |

Hauteurs renseignées : de 1.2 m à 105.4 m, médiane 14.9 m. Une hauteur absente reste `null` : le bâtiment est dessiné à plat et l'inspecteur affiche « Non renseigné ».
1063 solides des tuiles lues n'ont pas d'identifiant de bâtiment (`BU_ID` vide) : ils ne sont rattachés à rien, aucune correspondance géométrique n'est tentée.

## Attributs des axes : ce qui manque

UrbIS ne donne ni largeur, ni nombre de voies, ni sens, ni vitesse sur les axes. Sens, voies et vitesse viennent seulement
d'OSM, par appariement géométrique (confiance « moyenne », jamais « vérifiée »).

Codes hors spécification rencontrés (affichés tels quels, sans libellé inventé) :
hiérarchie ["T"],
type de tunnel ["MS"].

Répartition par type d'axe :

| Code | Nombre |
|---|---|
| `S` | 1200 |
| `I` | 193 |
| `A` | 29 |
| `K` | 4 |
| `P` | 1 |
| `C` | 31 |
| `IC` | 20 |
| `G` | 4 |
| `AC` | 2 |
| `SC` | 5 |

Répartition par niveau (LVL) : {"0":1467,"1":1,"-1":21}.

## Emprise publique des tronçons (largeur disponible)

Coupes perpendiculaires à l'axe UrbIS en 5 points (20 %, 35 %, 50 %, 65 %, 80 % de la longueur, à plus de 12 m des extrémités), découpées par les surfaces UrbIS de niveau 0 de types S, SC, SW, M, C, K, A, AC. De chaque côté de l'axe, on suit les surfaces contiguës (vide toléré : 0.6 m) jusqu'à la première interruption ; une coupe sans bord à 40 m (place, carrefour) ou de moins de 3 m est écartée. On retient la coupe de largeur médiane ; les bandes de moins de 0.5 m rejoignent leur voisine la plus large ; arrondi au décimètre. Confiance « moyenne » si au moins deux coupes s'accordent à 1.5 m près, « faible » sinon ; jamais « vérifiée » (aucun relevé de terrain).

| Tronçons | Nombre |
|---|---|
| mesurés, confiance moyenne | 716 |
| mesurés, confiance faible | 292 |
| tronçon de rue (S, SC) sans coupe valable : non éditables, « Non renseigné » | 175 |
| non concernés (carrefours, tunnels, ponts, autres types d'axe) | 306 |

Largeurs mesurées : de 3.7 m à 70 m, médiane 15.3 m. Le découpage de la chaussée en voies n'est pas dans les surfaces : il reste « non renseigné ».

## Complément OpenStreetMap

Extrait le 2026-11-14T10:03:01.264Z : 12597 chemins `highway`, dont 3406 de chaussée.
Tronçons appariés : 1228 (confiance moyenne), 46 ambigus (candidats contradictoires : aucun attribut retenu), 215 sans correspondance (dont tunnels et ponts, non appariés).

## Comptages de référence (v0.5)

Compteurs vélo automatiques de Bruxelles Mobilité. Débit de référence : moyenne, sur les jours ouvrables de la période, des vélos comptés de 8 h à 9 h (heure de Bruxelles) ; un jour sans aucun comptage est écarté (panne présumée). Chaque compteur est rattaché au tronçon de surface le plus proche à moins de 25 m ; les compteurs d'un même tronçon s'additionnent ; les deux sens sont comptés ensemble.
Période : 2026/09/21 – 2026/10/16 (extrait le 2026-11-18T20:27:37.597Z). Les comptages automobiles de Bruxelles Mobilité n'ont pas d'historique ouvert (l'API ne rend que le direct) : aucun débit automobile n'est repris.

| Compteur | Lieu | Tronçon | Distance (m) | Jours retenus / écartés | Vélos de 8 h à 9 h (moyenne, min–max) | Vitesse moyenne (km/h) |
|---|---|---|---|---|---|---|
| CB1142 | Rue de la Loi 130 - 1000 Bruxelles | seg-u73115 | 12.8 | 20 / 0 | 679 (401–1124) | 17 |
| CB1143 | Rue de la Loi 145 - 1000 Bruxelles | seg-u73115 | 6.7 | 20 / 0 | 752 (16–1093) | 20.4 |
| CEK18 | Avenue de Tervueren 28 - 1040 Etterbeek | seg-u92125 | 1.5 | 20 / 0 | 682 (411–878) | 17.2 |
| CEK31 | Avenue des Nerviens 135 - 1040 Etterbeek | seg-u90252 | 8.3 | 20 / 0 | 641 (461–774) | 19.6 |

Vitesse de référence des vélos : 18.6 km/h (moyenne des vitesses mesurées à l'heure de référence, pondérée par les vélos ; capteurs non étalonnés, confiance faible).

## Contrôles

- Longueur recalculée en Lambert 72 contre l'attribut `LENGTH` : 0 écart(s) de plus de 1 m.
- Croisements géométriques entre axes de niveaux différents (ponts, tunnels, normaux) : 88.
- Anomalies :

| Type | Nombre | Exemples |
|---|---|---|
| noeud-absent-source | 240 | seg-u95655 (fromNode) ; seg-u95655 (toNode) ; seg-u95612 (fromNode) ; seg-u95612 (toNode) |
| extremite-eloignee-du-noeud | 54 | seg-u93068 / node-u8009 (8.54 m) ; seg-u93068 / node-u15845 (8.54 m) ; seg-u93070 / node-u8010 (26.44 m) ; seg-u93070 / node-u8007 (26.44 m) |
| noeud-isole | 75 | node-u851 ; node-u15942 ; node-u3890 ; node-u5615 |
| geometrie-dupliquee | 1 | seg-u93071 / seg-u76210 |
| croisement-sans-noeud | 7 | seg-u71252 / seg-u82827 (niveau -1) ; seg-u71487 / seg-u74400 (niveau -1) ; seg-u74400 / seg-u87299 (niveau -1) ; seg-u73638 / seg-u77621 (niveau -1) |

Les nœuds hors emprise sont ceux d'axes à cheval sur le bord ; un nœud « isolé » est un nœud chargé dont aucun axe chargé ne part
(normal au bord de l'emprise). Rien n'est corrigé automatiquement.

## Tailles servies au navigateur

| Fichier | Octets |
|---|---|
| `streets` | 429760 |
| `intersections` | 151762 |
| `surfaces` | 4247286 |
| `buildings` | 4995838 |
| `infrastructure` | 237934 |
| `comptages` | 2231 |
| `network` | 2018694 |
