# Interface : commandes

<!-- Sorti de CLAUDE.md (v0.5.0) : la table des commandes, à tenir à jour avec js/data/aide.js. -->

| Action | Clavier | Souris |
|---|---|---|
| Choisir un tronçon | T (le plus proche du centre) | clic sur l'axe (tolérance 8 px) |
| Choisir un bâtiment | B (le plus proche du centre) | clic sur le bâtiment |
| Choisir un carrefour | N (le plus proche du centre) | clic sur le nœud (tolérance 7 px, avant l'axe) |
| Modifier la section ou le carrefour | M (ouvrir / fermer) ; C : carrefour, aussi depuis un tronçon | bouton de l'inspecteur |
| Flux et demande du tronçon | F (ouvrir / fermer) | bouton de l'inspecteur |
| Raccorder / détacher | Tab jusqu'à la voie qui entre, Entrée, puis la voie qui sort | clic sur l'une, puis sur l'autre |
| Limite entre deux bandes | ← → sur la limite (Maj : 0,5 m) | glisser la limite |
| Annuler / rétablir | Ctrl+Z / Ctrl+Y (ou Ctrl+Maj+Z) | boutons de l'éditeur |
| Vue 2D / 3D | V | bouton « Passer en 3D / en 2D » |
| Tourner, incliner (3D) | touches physiques Q / E (A / E en AZERTY), Page préc. / suiv. | clic droit + glisser, ou Maj + glisser |
| Fermer l'éditeur, puis désélectionner | Échap | clic dans le vide, croix de l'inspecteur |
| Se déplacer | flèches, ZQSD / WASD (touche physique) | glisser |
| Zoomer | + et − | molette |
| Retour à l'emprise | R | bouton « Retour à l'emprise » |
| Couches | 1 à 9, 0 (Flux) | cases à cocher |
| Trafic : pause / reprendre | Espace | bouton en haut à gauche de la vue |
| Trafic : vitesse ×1, ×2, ×4, ×8 | X | bouton en haut à gauche de la vue |
| Outil de voie (v0.7) | Tab jusqu'à la barre d'outils, Entrée ; Échap rend la main (au clavier, le détail : M) | bouton de la barre du bas, puis clic sur une voie ou glisser le long d'une rue |
| Allumer / éteindre une direction | M sur le carrefour : raccords de l'éditeur | clic sur une flèche au sol du carrefour choisi |
| Feux d'un carrefour | M : régulation « Feux », modèle, curseurs (← →) | mêmes commandes du bandeau |
| Mode expert (couches, inspecteur, bandeaux) | O | bouton « Mode expert » de l'en-tête |
| Menu | Échap (sans sélection) | roue crantée |

## Palette « Plan d'urbaniste » (Jérôme, v0.1.0)

Source unique : `js/palette.js` (variables CSS `--jeu-*` posées au lancement, style MapLibre construit depuis elle ; un test vérifie que la carte n'emploie que ces couleurs et que le CSS n'en contient aucune).

| Nom | Valeur | Rôle |
|---|---|---|
| `papier` | `#F2EFE8` | fond de carte et d'interface |
| `bati` | `#D3CBBE` | bâtiments |
| `voirie` | `#FFFFFF` | chaussées, en-tête, barre d'état |
| `trottoir` | `#E6E0D5` | trottoirs, terre-pleins, places (ajoutée : sans elle, trottoir et chaussée se confondent) |
| `bord` | `#9A9284` | contours, axes secondaires |
| `encre` | `#22262B` | texte, axes principaux, emprise, boutons |
| `noeud` | `#2E5A88` | nœuds, rails, liens |
| `selection` | `#D9442B` | tronçon choisi et ses nœuds |
| `cyclable` · `bus` · `stationnement` · `plante` | `#5E9E95` · `#D9A441` · `#A9B4C2` · `#A3BC86` | bandes de section [À VALIDER] (Jérôme a choisi « teintes douces + motifs », v0.3.0) ; toujours doublées d'un motif (carte) et d'un sigle (éditeur) |
| `inconnu` | `#696969` | « Non renseigné » (#8C8C8C proposé : 3,0 de contraste sur papier, assombri à 4,8) ; contour des bâtiments sans hauteur (3D) |

La 3D n'a pas de lumière : toits en `bati` exact, façades mêlées vers `bord` selon leur orientation (réglages `scene.ombreMur*`). Bâtiment choisi : plein `selection` **cerné d'encre** (selection sur bati ne vaut que 2,71).

Police : police système (aucune police distante). Les aplats (bâti, trottoir) ne sont pas des signes : contours `bord` dès le zoom 15–16.

Trafic (v0.6) : voitures `noeud` [À VALIDER], bus `bus`, vélos `cyclable`. Flèches au sol (v0.7) : allumée `encre`, éteinte `bord`, au feu `cyclable` (vert) ou `selection` (rouge, avec barre d'arrêt en 2D).
