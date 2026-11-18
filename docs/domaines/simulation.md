# Simulation simplifiée et indicateurs (v0.5)

<!-- Domaine de la simulation : décisions datées, méthode, mesures et pièges. Un ajout se range ici. -->

## Décisions (Jérôme, v0.5.0)

- **Demande : comptages + hypothèses.** Les comptages réels là où ils existent (source, période, confiance haute) ; ailleurs, la demande que le joueur pose par tronçon, marquée « votre hypothèse ». Sans les deux : « Non renseigné », aucun indicateur.
- **Modèle : par tronçon, statique.** Pour chaque tronçon et chaque mode : capacité de la section éditée, demande, saturation, personnes / h, temps de parcours, délai au carrefour d'aval. Aucune affectation sur le graphe (les itinéraires viendront plus tard), aucune boucle : tout est recalculé à chaque modification.
- **Références : littérature citée.** Capacités et vitesses tirées de sources nommées (`js/data/simulation.js`, textes `ref.*`), confiance « faible », réglables dans l'atelier.

## Sources

- **Compteurs vélo de Bruxelles Mobilité** (`bike/api/counts`, CC0 par la republication de la Ville de Bruxelles) : 4 compteurs dans l'emprise (CB1142, CB1143 rue de la Loi ; CEK18 Tervueren ; CEK31 Nerviens), quarts d'heure du 21 sept. au 16 oct. 2026 (jours ouvrables, avant le congé d'automne FWB). Débit de référence : moyenne de 8 h à 9 h (heure de Bruxelles, UTC+2 sur toute la période). Rattachement : le tronçon de surface le plus proche à moins de 25 m ; deux compteurs d'un même tronçon s'additionnent ; les deux sens sont comptés ensemble. Vitesse des vélos : 18,6 km/h (moyenne des vitesses des compteurs, pondérée ; capteurs non étalonnés). Pipeline : `node outils/donnees/telecharger.mjs velos`, puis `npm run donnees` → `data/processed/comptages.json`.
- **Comptages automobiles** : l'API `traffic/api/counts` ne rend que le direct (vérifié le 2026-11-18). Aucun historique, donc aucune demande automobile réelle.
- **Taux d'occupation des voitures et des bus** : aucune source citable trouvée (enquêtes BELDAM / MOBEL / ECD non consultables en ligne en session). Ce sont des **hypothèses du scénario**, `null` au départ ; sans elles, les personnes / h des voitures et des bus restent « Non renseigné ».
- Listés par le GetCapabilities du serveur WFS (`data.mobility.brussels/geoserver`), contenu non vérifié : feux (`bm_equipment:traffic_lights`), passages piétons (`bm_equipment:Pedestrian_crossing`), voies et vitesses des routes régionales (`bm_network:brr_segments_lanes`, `_speed`), lignes et arrêts STIB. Pas encore repris (voir ROADMAP).

## Méthode (`js/simulation.js`, pur)

- **Voies** (`voiesParMode`) : bandes `voiture`, `bus`, `cyclable` par sens (une bande « double » compte une demi-voie par sens) ; largeur totale des `trottoir`. Une chaussée non découpée : voies d'OSM si `lanes` et `oneway` les répartissent (`voiesOsm`), sinon capacité automobile « voies inconnues ».
- **Capacité** : voies × débit de saturation (1 900 véh./h, HCM 2010 ; 2 000 vélos/h, HCM 2000) × part de vert si le nœud d'aval est à feux dans le scénario ; trottoirs : largeur × 4 500 piétons/h/m (HCM 2010, seuil du niveau E). Vélos sans piste dans un sens où roulent des voitures : « circulation mêlée, non modélisée ». Bus : capacité non modélisée (aucune source), les bus demandés passent tous.
- **Saturation** : par sens si la demande est par sens, sinon les deux sens ensemble (cas d'un comptage). Seuils de la carte : 0,8 (proche), 1 (saturé).
- **Personnes / h** : débit écoulé (borné par la capacité) × occupation ; vélos et piétons : une personne. Le total du tronçon n'existe que si chaque mode renseigné l'est en personnes (sinon la somme mentirait).
- **Temps** : longueur / vitesse (limite OSM ; vélos : vitesse mesurée ; piétons 1,07 m/s), chargé par BPR (α 0,15, β 4). **Délai** : uniforme de Webster au nœud d'aval s'il est à feux, cycle 90 s, deux phases, 4 s perdues par phase (hypothèses de calcul affichées) ; autres régulations : « non modélisé » ; régulation inconnue : « Non renseigné ».
- **Conflits** (`conflits`) : paires de raccords qui se croisent (ni entrée ni sortie communes) et raccords qui coupent une traversée posée, par paire de familles (véhicules, vélos, piétons). Exposition, jamais une prédiction d'accidents ; les feux ne sont pas déduits en phases.
- **Scénario** : `scenario.demande[troncon] = { <mode>: { aller?, retour?, total? } }` (piétons : `total`), `scenario.hypotheses = { occupationVoiture, occupationBus }`. Le `simulationState` n'est jamais sauvegardé.

## Interface

- Bandeau des flux (`js/editeur-flux.js`, touche **F**, bouton « Flux et demande » de l'inspecteur) : demande par mode et par sens, origine, capacité, saturation, personnes ; hypothèses d'occupation ; annuler / rétablir partagés avec les autres éditeurs. Un seul bandeau ouvert à la fois.
- Inspecteur : section « Flux, 8 h – 9 h » en tête des tronçons (méthode et source sous chaque valeur), « Exposition aux conflits » pour les carrefours.
- Carte : couche **Flux** (touche 0) — fluide : trait `noeud` fin ; proche : `bus` cerné d'`encre` (l'ocre seul ne contraste pas : 1,96 sur papier) ; saturé : `encre` épais ; capacité inconnue : tirets `inconnu`. Pas encore en 3D.
- Barre d'état : « Flux : n tronçons · s saturés » ; les licences et projections sont passées au survol des sources (la barre doit tenir sur une ligne à 1280 px).

## Mesures

- `test/simulation.test.mjs` : 19 tests (offre, demande, saturation, personnes, BPR, Webster, conflits, opérations, données réelles).
- `node outils/critere-v05.mjs` (8 tronçons, graine 1) : tout passe ; recalcul complet le plus lent 7 ms dans le conteneur.

## Pièges

- Un comptage à deux sens sur une rue où la piste n'existe que dans un sens : la capacité vélo de l'autre sens est inconnue, donc la saturation et les personnes aussi (rue de la Loi). C'est voulu : découper la section pour l'obtenir.
- Une chaussée séparée par un terre-plein a deux bandes `chaussee` : `voiesOsm` ne s'applique pas (OSM ne dit pas laquelle porte quoi).
- Mesurer un temps de recalcul à travers Playwright compte les allers-retours (~1 s) : le critère le mesure dans la page.
