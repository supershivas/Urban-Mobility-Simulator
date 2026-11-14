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
| largeur de chaussée | 0 | 1489 |
| gestionnaire (axe) | 0 | 1489 |

UrbIS ne donne ni largeur, ni nombre de voies, ni sens, ni vitesse sur les axes. Sens, voies et vitesse viennent seulement
d'OSM, par appariement géométrique (confiance « moyenne », jamais « vérifiée »). La largeur reste inconnue : les surfaces de
voirie (chaussée, trottoir, terre-plein…) existent dans UrbIS, mais aucune largeur n'en est encore tirée.

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

## Complément OpenStreetMap

Extrait le 2026-11-14T10:03:01.264Z : 12597 chemins `highway`, dont 3406 de chaussée.
Tronçons appariés : 1228 (confiance moyenne), 46 ambigus (candidats contradictoires : aucun attribut retenu), 215 sans correspondance (dont tunnels et ponts, non appariés).

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
| `buildings` | 4609963 |
| `infrastructure` | 237934 |
| `network` | 1778383 |
