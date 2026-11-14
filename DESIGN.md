# Urban Mobility Simulator — Bible du jeu

Ce document décrit **l'intention** : ce que le jeu est et veut être. La technique est
dans `CLAUDE.md`, le cadrage complet dans `docs/PITCH.md`. Les décisions de Jérôme sont
datées par version (« Jérôme, v0.1.0 ») ; les propositions pas encore tranchées portent
`[À VALIDER]`.

## Intention

On prend en main une vraie rue de Bruxelles, entre Schuman et Roodebeek, et l'on
découvre qu'elle a une largeur, et qu'elle n'en aura jamais d'autre. Chaque mètre donné
au trottoir, à la piste cyclable ou au bus est pris à quelqu'un d'autre. Le jeu rend ce
compromis visible, puis mesurable : on compte les personnes qui passent, pas les
voitures. On y revient pour essayer un autre partage de la même rue.

En v0.1, le joueur n'édite encore rien : il lit le corridor réel, tronçon par tronçon,
et voit ce que l'on sait — et surtout ce que l'on ne sait pas — de chaque rue.

## Piliers

1. **Réalisme géographique** : rues, intersections et bâtiments à leur emplacement réel ; l'échelle prime sur l'effet.
2. **L'espace public est une ressource limitée** : la somme des largeurs ne dépasse jamais l'emprise disponible.
3. **La sécurité est une contrainte de conception** : on parle d'exposition aux conflits, jamais de prédiction d'accidents.
4. **Mesurer les personnes, pas les véhicules** : indicateur central = personnes transportées par heure.
5. **Données sources immuables** : `originalData` → `normalizedData` → `currentScenario` ; le joueur n'édite qu'un scénario.
6. **Aucune valeur inventée** : l'inconnu s'affiche « Non renseigné » ; une estimation porte sa méthode et sa confiance.

## Genre et inspirations

City / colonie builder · Gestion / automatisation · Simulation (Jérôme, v0.1.0). Inspirations
de mécanique seulement : *Traffic City* (réorganiser un réseau pour le fluidifier),
*Junxions* (concevoir carrefours et raccordements). Jamais leur nom, leurs visuels ni leurs niveaux.

## La boucle de jeu (cible, à partir de la v0.3)

- **Seconde** : choisir un tronçon, déplacer une limite entre deux usages (trottoir, piste, bus, voiture, stationnement) ; la largeur restante se recalcule.
- **Minute** : refaire une section transversale, puis un carrefour ; voir changer l'exposition aux conflits et les personnes par heure.
- **Partie** : un scénario pour tout le corridor, comparé à l'état réel.
- **Entre deux parties** : le scénario est sauvegardé ; on en ouvre un autre sur la même rue.

En v0.1 la boucle est : **explorer → choisir un tronçon → lire ce qu'on en sait**.

## Le lot minimal (v0.1)

1. Carte 2D du corridor Schuman–Roodebeek : rues, intersections, bâtiments, couches activables, retour à l'emprise.
2. Sélection d'un tronçon, avec surbrillance et inspecteur.
3. Les valeurs inconnues restent « Non renseigné ».

**Critère de validation** (Jérôme, v0.1.0) : données traçables et justes — 0 identifiant
en double, 100 % des `fromNode` / `toNode` renseignés existants, 20 tronçons tirés au sort
ouvrent le bon inspecteur, carte prête en moins de 3 s en local.
Mesuré par `npm test` (`test/donnees.test.mjs`) et `node outils/critere-v01.mjs`.

## Le monde

Le corridor réel : tampon de 600 m le long du métro 1 (Schuman, Mérode, Montgomery,
Joséphine-Charlotte, Gribaumont, Tomberg, Roodebeek) plus la station Georges Henri
(Jérôme, v0.1.0). Quatre secteurs de travail : Schuman · Mérode – Montgomery ·
Georges Henri – Gribaumont · Roodebeek. Aucun lieu inventé, aucun nom inventé.

## Palette, échelle, son

- **Palette** « Plan d'urbaniste » (Jérôme, v0.1.0) : un plan papier lisible des heures ; la sélection en vermillon ressort sans évoquer une alarme. Valeurs dans `CLAUDE.md`.
- **Échelle** : mètres réels (Lambert 72), zoom 11 à 20, barre d'échelle métrique (Jérôme, v0.1.0).
- **Son** : aucun pour la v0.

## Public et accessibilité

Joueur averti, partie longue continue, sur bureau (≈ 1440 × 900), clavier et souris ;
toutes les actions existent aux deux. Français et anglais. Aucun texte indispensable
n'est porté par la seule couleur (la sélection est aussi plus épaisse, les tunnels sont
en tirets).

## Ce que le jeu refuse

- **Pas de fond de carte en ligne** : tout ce qui est dessiné vient de `data/` et est sourcé (porte ouverte vers Steam, pilier 6). (Choix par défaut, v0.1.0 : Jérôme n'a pas tranché.)
- **Pas de décor décoratif** : ni arbres, ni voitures, ni foule inventés pour faire joli (pilier 6). (Choix par défaut, v0.1.0.)
- **Pas de prédiction d'accidents** : on montre l'exposition aux conflits (pilier 3).
- **Pas d'élargissement de la rue, pas de construction de bâtiments** (pilier 2).

`[À VALIDER]` : pas de score global unique ; pas de tutoriel bavard.

## Questions ouvertes

- Largeurs de chaussée : UrbIS fournit des **surfaces** (chaussée, trottoir, terre-plein, site propre) mais aucune largeur ; la méthode de mesure (coupe perpendiculaire à l'axe sur les surfaces ?) est à décider avant l'éditeur (v0.3).
- Hauteurs des bâtiments pour la 3D (v0.2) : absentes de la couche `Buildings` ; source à trouver.
- Brussels Mobility (routes régionales, comptages) : hôte bloqué pendant la v0.1.
