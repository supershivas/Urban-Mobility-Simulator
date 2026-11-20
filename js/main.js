// Le cycle de vie : écran titre → carte du corridor (2D MapLibre ou 3D three.js)
// → menu ; réglages, sauvegarde de la vue, mise à jour, debug. Les deux vues
// lisent les mêmes données locales de data/ (aucun service distant) et partagent
// la sélection et l'inspecteur. Le style est dans carte/style.js, la scène dans
// scene/scene3d.js (chargée à la première bascule), l'inspecteur dans inspecteur.js.
import * as maplibregl from '../vendor/maplibre-gl/maplibre-gl.mjs?v=0.9.4';
import { createKeys, stopTypeahead } from './lib/keys.js?v=0.9.4';
import { lockBrowserGestures } from './lib/pointer.js?v=0.9.4';
import { createStore, autosave, pickJSONFile } from './lib/save.js?v=0.9.4';
import { createI18n } from './lib/i18n.js?v=0.9.4';
import { startUpdateCheck, loadVersion, loadChangelog, downloadJSON } from './lib/app-update.js?v=0.9.4';
import { PALETTE, ROLES } from './palette.js?v=0.9.4';
import { TEXTES } from './data/textes.js?v=0.9.4';
import { COMMANDES_AIDE } from './data/aide.js?v=0.9.4';
import { styleCarte, COUCHES, COUCHES_ACTIVES, COUCHES_SELECTIONNABLES } from './carte/style.js?v=0.9.4';
import { lignesInspecteur, lignesInspecteurBatiment, lignesInspecteurNoeud } from './inspecteur.js?v=0.9.4';
import { creerRepere } from './geo/repere.js?v=0.9.4';
import { boite } from './geo/geometrie.js?v=0.9.4';
import { distancePourZoom, zoomPourDistance } from './scene/camera.js?v=0.9.4';
import { lireJSON, couche, couchesScene } from './donnees.js?v=0.9.4';
import { chargerContenu } from './design-store.js?v=0.9.4';
import { sectionMesuree, OPERATIONS, memeSection, decalages, verifier } from './section.js?v=0.9.4';
import { creerHistorique } from './historique.js?v=0.9.4';
import { featuresSections } from './carte/sections.js?v=0.9.4';
import { ajouterImages } from './carte/motifs.js?v=0.9.4';
import { wgs84VersLambert, lambertVersWgs84 } from './geo/coordonnees.js?v=0.9.4';
import { creerEditeur } from './editeur.js?v=0.9.4';
import { creerEditeurCarrefour, lettre } from './editeur-carrefour.js?v=0.9.4';
import { branchesDe, toutesLesVoies, raccordsDe, verifierCarrefour, traverseesDe, OPERATIONS_CARREFOUR } from './carrefour.js?v=0.9.4';
import { geometrieCarrefour, pointSurLigne } from './geo/raccords.js?v=0.9.4';
import { featuresCarrefours } from './carte/carrefours.js?v=0.9.4';
import { DESSIN_CARREFOUR } from './data/carrefours.js?v=0.9.4';
import { etatTroncon, niveau, bilan, conflits, definirDemande, definirHypothese } from './simulation.js?v=0.9.4';
import { HYPOTHESES } from './data/simulation.js?v=0.9.4';
import { lignesSimulation, lignesConflits } from './inspecteur.js?v=0.9.4';
import { creerEditeurFlux } from './editeur-flux.js?v=0.9.4';
import { createLoop } from './lib/loop.js?v=0.9.4';
import { construireReseau, creerTrafic } from './circulation.js?v=0.9.4';
import { SIMULATION, VEHICULES } from './data/circulation.js?v=0.9.4';
import { lignesTrafic } from './inspecteur.js?v=0.9.4';
import { appliquerOutil } from './outils.js?v=0.9.4';
import { OUTILS } from './data/bandes.js?v=0.9.4';
import { directionsDe, phasesDe, auVert, etatFeux } from './carrefour.js?v=0.9.4';
import { distancePointLigne } from './geo/geometrie.js?v=0.9.4';
import { contourBande } from './geo/decalage.js?v=0.9.4';
import { bandeAuDecalage } from './outils.js?v=0.9.4';
import { MISSIONS } from './data/missions.js?v=0.9.4';
import { mission, suivante, suivi, evaluer, progressionVide } from './missions.js?v=0.9.4';

const JEU = 'urban-mobility-simulator';
const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const DEBUG = new URLSearchParams(location.search).has('debug');
const t0 = performance.now();

// Une seule source pour les couleurs : la palette, posée en variables CSS
for (const [role, couleur] of Object.entries(ROLES)) document.documentElement.style.setProperty(`--jeu-${role}`, couleur);

const store = createStore({
  game: JEU,
  debug: DEBUG,
  entries: {
    partie: { version: 1 }, // { vue, vue3d, mode, selection, couches, scenario: { sections: { [tronçon]: section }, carrefours: { [nœud]: choix } } }
    prefs: { version: 1, debugWrites: false, defaults: { langue: (navigator.language || 'fr').startsWith('fr') ? 'fr' : 'en', expert: false } },
    progression: { version: 1 }, // v0.8 : { reussies: [id], enCours: id | null, etape, departs: [id] } — à part de la partie (section 11)
  },
  secret: ['gh-token'],
});
const prefs = store.load('prefs');
// Mode debug : &expert=1 ouvre en mode expert (les critères des versions 0.1 à 0.7 visent l'inspecteur et les couches)
if (DEBUG && new URLSearchParams(location.search).get('expert') === '1') prefs.expert = true;
const i18n = createI18n(TEXTES, { lang: prefs.langue });
const t = (k, v) => i18n.t(k, v);
document.documentElement.lang = i18n.lang;
i18n.apply(document);

const contenu = await chargerContenu();
const R = contenu.reglages;
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
const duree = () => (reduit ? 0 : R.carte.dureeVolMs);
lockBrowserGestures($('ecran'));
stopTypeahead();

// ─── Données : le modèle (network.json) et les codes UrbIS ─────────────────
let reseau, codes, meta, emprise, comptages;
try {
  [reseau, codes, meta, emprise, comptages] = await Promise.all([
    lireJSON('data/processed/network.json'), lireJSON('data/urbis-codes.json'),
    lireJSON('data/processed/metadata.json'), lireJSON('data/metadata/corridor.geojson'),
    lireJSON('data/processed/comptages.json'),
  ]);
} catch (e) {
  document.querySelector('#chargement .jeu-chargement-barre').hidden = true;
  $('chargement-texte').textContent = t('chargement.erreur', { raison: e.message });
  throw e;
}
const segments = new Map(reseau.streetSegments.map(s => [s.id, s]));
const noeuds = new Map(reseau.intersections.map(n => [n.id, n]));
const rues = new Map(reseau.streets.map(r => [r.id, r]));
const repere = creerRepere(meta.repereLocal.origine); // la scène 3D travaille en mètres autour de cette origine
const limitesEmprise = emprise.features[0].geometry.coordinates[0].reduce(
  (b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);

function majStatut() {
  $('statut-emprise').textContent = t('statut.emprise', { n: meta.emprise.tamponMetres });
  $('statut-sources').title = t('statut.projection'); // licences et projections : au survol (la barre tient sur une ligne)
  const anomalies = Object.values(meta.topologie.anomalies).reduce((a, b) => a + b, 0);
  $('statut-donnees').textContent = t('statut.donnees', {
    segments: meta.comptes.streetSegments, noeuds: meta.comptes.intersections, batiments: meta.comptes.buildings,
  });
  $('statut-anomalies').textContent = t('statut.anomalies', { anomalies });
  $('statut-anomalies').title = t('statut.rapport');
  majStatutFlux();
}
// Le bilan des flux (v0.5) : tronçons renseignés, saturés (refait à chaque modification)
let bilanFlux = { renseignes: 0, satures: 0, proches: 0, inconnus: 0 };
function majStatutFlux() {
  $('statut-flux').textContent = t('statut.flux', { n: bilanFlux.renseignes, s: bilanFlux.satures });
  $('statut-flux').title = t('statut.flux-titre', { n: bilanFlux.renseignes, s: bilanFlux.satures, p: bilanFlux.proches, i: bilanFlux.inconnus });
}
majStatut();

// ─── La partie : la vue, la sélection et les couches (sauvegardées) ───────
// { vue: { centre, zoom }, vue3d: { cible, distance, azimut, inclinaison }, mode: '2d' | '3d', selection, couches,
//   scenario: { sections, carrefours, demande, hypotheses } } — le scénario ne garde que ce que le joueur a modifié
//   (le reste : état mesuré, raccords proposés, comptages)
const scenarioVide = () => ({ sections: {}, carrefours: {}, demande: {}, hypotheses: { ...HYPOTHESES } });
// La partie s'ouvre en 3D (Jérôme, v0.5.0) ; en mode debug, &vue=2d la garde sur la carte (critères, captures)
const VUE_DEPART = DEBUG && new URLSearchParams(location.search).get('vue') === '2d' ? '2d' : '3d';
const nouvellePartie = () => ({ vue: null, vue3d: null, mode: VUE_DEPART, selection: null, couches: { ...COUCHES_ACTIVES }, scenario: scenarioVide() });
let etat = null;

// ─── Carte ─────────────────────────────────────────────────────────────────
const carte = new maplibregl.Map({
  container: 'carte',
  style: styleCarte(PALETTE, R, new URL('data/', location.href).href),
  bounds: limitesEmprise,
  fitBoundsOptions: { padding: R.carte.margeEmprisePx },
  minZoom: R.carte.zoomMin,
  maxZoom: R.carte.zoomMax,
  attributionControl: false,
  keyboard: false,       // le clavier passe par keys.js (section 8)
  pitchWithRotate: false,
  dragRotate: false,
});
carte.touchZoomRotate.disableRotation();
let largeurSelection2d = null; // l'épaisseur du style, rendue quand la section n'est plus dessinée
carte.on('load', () => { ajouterImages(carte, PALETTE); largeurSelection2d = carte.getPaintProperty('rues-selection', 'line-width'); }); // motifs des bandes et flèches de sens, dessinés depuis la palette
carte.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
const pret = new Promise(res => carte.once('idle', res));
pret.then(() => {
  window.__jeu?.log('carte-prete', { ms: Math.round(performance.now() - t0) });
});

// Étiquettes des stations (DOM : pas de glyphes à charger)
const stationsCarte = [];
couche('infra').then(infra => {
  for (const f of infra.features.filter(f => f.properties.famille === 'station')) {
    const m = new maplibregl.Marker({ element: el('div', { className: 'etiquette-station', textContent: f.properties.nom }), anchor: 'bottom' })
      .setLngLat(f.geometry.coordinates).addTo(carte);
    m.getElement().dataset.couche = 'stations';
    stationsCarte.push(m);
  }
  appliquerCouches();
});

function recentrer() {
  if (mode === '3d') { scene?.recentrer(); return; }
  carte.fitBounds(limitesEmprise, { padding: R.carte.margeEmprisePx, duration: duree() });
}

// ─── Couches activables ────────────────────────────────────────────────────
const TOUCHES_COUCHES = Object.keys(COUCHES).map((c, i) => [c, String((i + 1) % 10)]); // la dixième : 0
function construireCouches() {
  $('couches').replaceChildren(...TOUCHES_COUCHES.map(([c, touche]) => {
    const input = el('input', { type: 'checkbox', id: `couche-${c}`, checked: etat.couches[c] });
    input.onchange = () => basculerCouche(c, input.checked);
    return el('label', { className: 'couche', htmlFor: `couche-${c}` }, input, el('span', { textContent: t(`couche.${c}`) }), el('kbd', { textContent: touche }));
  }));
}
function basculerCouche(c, visible = !etat.couches[c]) {
  etat.couches[c] = visible;
  const input = $(`couche-${c}`);
  if (input) input.checked = visible;
  appliquerCouches();
  sauvegarder();
  window.__jeu?.log('couche', { couche: c, visible });
}
function appliquerCouches() {
  if (etat) scene?.definirCouches(etat.couches);
  if (!etat || !carte.isStyleLoaded()) return;
  for (const [c, ids] of Object.entries(COUCHES)) {
    for (const id of ids) carte.setLayoutProperty(id, 'visibility', etat.couches[c] ? 'visible' : 'none');
  }
  const lisibles = carte.getZoom() >= R.carte.zoomEtiquettes; // en dessous, les étiquettes se chevauchent
  document.querySelectorAll('[data-couche="stations"]').forEach(e => { e.style.display = etat.couches.stations && lisibles ? '' : 'none'; });
  etiquettesDansLaVue();
}
carte.on('zoomend', appliquerCouches);
// Une étiquette hors de la carte est masquée : sinon elle déborde de la vue (vu par l'audit quand la mission zoome sur sa rue)
function etiquettesDansLaVue() {
  const r = $('carte').getBoundingClientRect();
  for (const m of stationsCarte) {
    const p = carte.project(m.getLngLat()), dedans = p.x > 0 && p.y > 0 && p.x < r.width && p.y < r.height;
    m.getElement().classList.toggle('hors-vue', !dedans);
  }
}
carte.on('move', () => etiquettesDansLaVue());

// ─── Sélection d'un tronçon ou d'un bâtiment : une seule, pour les deux vues ─
const estBatiment = id => typeof id === 'string' && id.startsWith('bld-');
const estNoeud = id => typeof id === 'string' && noeuds.has(id);
let batiments = null; // Map(id → { id, hauteur, solides }), une fois buildings.geojson lu
const chargerBatiments = async () => (batiments ??= new Map((await couche('batiments')).features.map(f => [f.properties.id, f.properties])));
const SURBRILLANCE_BATIMENT = ['batiments-selection', 'batiments-selection-contour'];

// batiment : ses propriétés quand on les a déjà (clic sur la carte), sinon elles sont lues dans buildings.geojson
function selectionner(id, { centrer = false, batiment = null } = {}) {
  const s = id && segments.has(id) ? segments.get(id) : null;
  const idBatiment = estBatiment(id) ? id : null;
  const idNoeud = estNoeud(id) ? id : null;
  const b = idBatiment ? (batiment ?? batiments?.get(id) ?? null) : null;
  etat.selection = s ? s.id : idBatiment ?? idNoeud;
  carte.setFilter('rues-selection', ['==', ['get', 'id'], s ? s.id : '']);
  carte.setFilter('noeuds-selection', ['in', ['get', 'id'], ['literal', s ? [s.fromNode, s.toNode].filter(Boolean) : idNoeud ? [idNoeud] : []]]);
  for (const l of SURBRILLANCE_BATIMENT) carte.setFilter(l, ['==', ['get', 'id'], idBatiment ?? '']);
  scene?.selectionner(objetScene(etat.selection));
  if (idNoeud) afficherInspecteur(noeuds.get(idNoeud));
  else if (idBatiment && !b) {
    // Sélection restaurée avant la lecture des bâtiments : on les lit, puis on affiche (ou on oublie un identifiant disparu)
    afficherInspecteur(null, t('inspecteur.lecture'));
    chargerBatiments().then(m => { if (etat?.selection === id) selectionner(m.has(id) ? id : null); }, e => toast(e.message));
  } else afficherInspecteur(s ?? (b && { id: idBatiment, hauteur: b.hauteur ?? null, solides: b.solides ?? 0 }));
  // L'éditeur ouvert suit la sélection : il passe à l'autre tronçon ou carrefour s'il est modifiable, sinon il se ferme
  if (editeFlux && editeFlux !== etat.selection) { if (s) ouvrirFlux(s.id); else fermerFlux(); }
  if ((edite || editeCarrefour) && (edite ?? editeCarrefour) !== etat.selection) {
    if (s?.emprise) ouvrirEditeur(s.id);
    else if (idNoeud && carrefourModifiable(idNoeud)) ouvrirCarrefour(idNoeud);
    else { fermerEditeur(); fermerCarrefour(); }
  }
  if (s && centrer) {
    const n = [s.fromNode, s.toNode].map(x => noeuds.get(x)).filter(Boolean);
    const f = carte.querySourceFeatures('rues', { filter: ['==', ['get', 'id'], s.id] })[0];
    if (f) {
      const c = f.geometry.coordinates;
      carte.easeTo({ center: c[Math.floor(c.length / 2)], duration: duree() });
    } else if (n.length) window.__jeu?.log('centrage-impossible', { id });
  }
  majSections();
  sauvegarder();
  window.__jeu?.log('selection', { id: etat.selection });
}
// Ce que la vue 3D met en évidence pour une sélection
function objetScene(id) {
  if (!id) return null;
  if (estBatiment(id)) return { type: 'batiment', id };
  if (estNoeud(id)) return { type: 'noeud', id };
  const s = segments.get(id);
  return s ? { type: 'troncon', id, noeuds: [s.fromNode, s.toNode].filter(Boolean) } : null;
}

// Le tronçon le plus proche d'un point de l'écran, dans la tolérance de clic
function tronconPres(point) {
  const tol = R.selection.toleranceClicPx;
  const candidats = carte.queryRenderedFeatures([[point.x - tol, point.y - tol], [point.x + tol, point.y + tol]], { layers: COUCHES_SELECTIONNABLES.filter(l => carte.getLayoutProperty(l, 'visibility') !== 'none') });
  let meilleur = null, dMin = Infinity;
  for (const f of candidats) {
    const lignes = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const l of lignes) for (let i = 1; i < l.length; i++) {
      const a = carte.project(l[i - 1]), b = carte.project(l[i]);
      const d = distanceEcran(point, a, b);
      if (d < dMin) { dMin = d; meilleur = f.properties.id; }
    }
  }
  return dMin <= tol ? meilleur : null;
}
function distanceEcran(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const u = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}
// Le bâtiment sous un point de la carte (les tronçons gardent la priorité au clic)
function batimentSous(point) {
  if (!etat.couches.batiments) return null;
  return carte.queryRenderedFeatures(point, { layers: ['batiments'] })[0]?.properties ?? null;
}
// Le nœud le plus proche d'un point de l'écran, dans sa tolérance (il passe avant l'axe, qui y aboutit)
function noeudPres(point) {
  if (!etat.couches.intersections || carte.getZoom() < 14) return null; // la couche des nœuds n'est dessinée qu'à partir du zoom 14
  const tol = R.selection.toleranceNoeudPx;
  let meilleur = null, dMin = tol;
  for (const f of carte.queryRenderedFeatures([[point.x - tol, point.y - tol], [point.x + tol, point.y + tol]], { layers: ['noeuds'] })) {
    const p = carte.project(f.geometry.coordinates), d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d <= dMin) { dMin = d; meilleur = f.properties.id; }
  }
  return meilleur;
}
carte.on('click', e => {
  if (outil) return; // l'outil actif peint (pointerdown / move / up), il ne choisit pas
  if (cliquerFleche(e.point.x, e.point.y)) return;
  const noeud = noeudPres(e.point), troncon = noeud ? null : tronconPres(e.point), b = noeud || troncon ? null : batimentSous(e.point);
  selectionner(noeud ?? troncon ?? b?.id ?? null, { batiment: b });
});

function afficherInspecteur(s, vide = t('inspecteur.vide')) {
  $('deselectionner').hidden = !s;
  if (!s) { delete $('inspecteur-corps').dataset.segment; $('inspecteur-corps').replaceChildren(el('p', { className: 'vide', textContent: vide })); return; }
  const batiment = estBatiment(s.id), noeud = estNoeud(s.id);
  const c = noeud ? etatCarrefour(s.id) : null;
  const sections = batiment ? lignesInspecteurBatiment(s, { t, lang: i18n.lang, infos: meta.batiments })
    : noeud ? [...lignesInspecteurNoeud(s, { t, lang: i18n.lang, codes, ...c }), ...(c.branches.length >= 2 && lignesRues ? lignesConflits(conflitsDe(s.id), { t, regulation: c.carrefour?.regulation ?? null }) : [])]
      : [...(trafic ? lignesTrafic(trafic.mesures(s.id), { t, lang: i18n.lang, entree: entreeDe(s.id), comptage: comptages.parTroncon[s.id] ?? null }) : []), ...lignesSimulation(etatSim(s.id), { t, lang: i18n.lang }), ...lignesInspecteur(s, { t, lang: i18n.lang, codes, noeuds, rues, section: etat?.scenario.sections[s.id] ?? null })];
  const nom = batiment ? t('inspecteur.batiment') : noeud ? nomCarrefour(c.branches) : [s.nom.fr, s.nom.nl].filter(Boolean)[0];
  $('inspecteur-corps').replaceChildren(
    ...(noeud ? [el('p', { className: 'genre-objet', textContent: t('inspecteur.noeud') })] : []),
    el('p', { className: `nom-troncon${nom ? '' : ' inconnu'}`, textContent: nom ?? t('valeur.inconnu') }),
    ...(!batiment && !noeud && s.emprise ? [el('button', { className: 'bouton inspecteur-editer', id: 'editer-section', type: 'button', onclick: () => ouvrirEditeur(s.id) },
      t('inspecteur.editer'), ' ', el('kbd', { textContent: 'M' }))] : []),
    ...(!batiment && !noeud ? [el('button', { className: 'bouton inspecteur-editer', id: 'editer-flux', type: 'button', onclick: () => ouvrirFlux(s.id) },
      t('inspecteur.editer-flux'), ' ', el('kbd', { textContent: 'F' }))] : []),
    ...(noeud && c.branches.length >= 2 ? [el('button', { className: 'bouton inspecteur-editer', id: 'editer-carrefour', type: 'button', onclick: () => ouvrirCarrefour(s.id) },
      t('inspecteur.editer-carrefour'), ' ', el('kbd', { textContent: 'M' }))] : []),
    ...sections.flatMap(sec => [
      el('h3', { textContent: sec.titre }),
      el('dl', {}, ...sec.lignes.flatMap(l => [
        el('dt', { textContent: l.champ }),
        el('dd', { className: l.inconnu ? 'inconnu' : '' }, l.valeur, ...(l.source ? [el('small', { textContent: l.source })] : []),
          ...(l.copiable ? [boutonCopier(l)] : [])),
      ])),
    ]),
  );
  $('inspecteur-corps').dataset.segment = s.id; // l'objet affiché (tronçon ou bâtiment)
}
const objetChoisi = () => (!etat?.selection ? null : estBatiment(etat.selection) ? batiments?.get(etat.selection) ?? null
  : noeuds.get(etat.selection) ?? segments.get(etat.selection) ?? null);

// ─── Vue 3D : chargée à la première bascule, synchronisée avec la carte ────
let scene = null, mode = '2d', sceneMs = null, chargementScene = null;
const rad = deg => (deg * Math.PI) / 180;
const borner = (v, min, max) => Math.max(min, Math.min(max, v));
const hauteurVue = () => $('scene').clientHeight || $('carte').clientHeight;
const etiquettes3d = [];

function chargerScene() {
  return (chargementScene ??= (async () => {
    $('scene-attente').hidden = false;
    await new Promise(res => setTimeout(res, 30)); // laisse le message s'afficher : la construction occupe le fil
    const [{ creerScene }, couches] = await Promise.all([import('./scene/scene3d.js?v=0.9.4'), couchesScene(), chargerBatiments()]);
    scene = creerScene({
      conteneur: $('scene'), repere, P: PALETTE, R, donnees: { ...couches, emprise }, mouvementReduit: reduit,
      surChoix: (c, pt) => { if (!enCarte()) return; if (pt && cliquerFleche(pt.x, pt.y)) return; selectionner(c?.id ?? null); },
      surRendu: habillerScene,
    });
    majSections(); // et les carrefours
    for (const s of scene.stations) etiquettes3d.push($('scene-etiquettes').appendChild(el('div', { className: 'etiquette-station', textContent: s.nom })));
    $('scene-attente').hidden = true;
  })().catch(e => {
    chargementScene = null;
    $('scene-attente').hidden = true;
    throw e;
  }));
}

// Étiquettes des stations et barre d'échelle de la vue 3D (DOM, comme sur la carte), refaites à chaque image
function habillerScene() {
  const e = scene.etat();
  const lisibles = etat?.couches.stations && zoomPourDistance(e.distance, repere.localVersLonLat(e.cible)[1], hauteurVue(), R.scene.fovDegres) >= R.carte.zoomEtiquettes;
  scene.stations.forEach((s, i) => {
    const p = scene.versEcran(s.local);
    const dedans = p.x > 0 && p.y > 0 && p.x < $('scene').clientWidth && p.y < $('scene').clientHeight;
    etiquettes3d[i].style.display = lisibles && p.visible && dedans ? '' : 'none';
    etiquettes3d[i].style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) translateY(-12px)`;
  });
  for (const b of etiquettesBranches) {
    const p = scene.versEcran(b.local);
    b.dom.style.display = p.visible ? '' : 'none';
    b.dom.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
  }
  // Une longueur ronde (1, 2 ou 5 × 10ⁿ m) qui tient dans la largeur prévue, à l'échelle du point visé
  const mpp = scene.mpp(), max = mpp * R.scene.echelleMaxPx, p10 = 10 ** Math.floor(Math.log10(max));
  const metres = [5, 2, 1].find(k => k * p10 <= max) * p10;
  $('scene-echelle').style.width = `${metres / mpp}px`;
  $('scene-echelle').textContent = metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
}

function majBascule() {
  $('bascule-vue-texte').textContent = t(mode === '3d' ? 'outils.vue2d' : 'outils.vue3d');
  $('bascule-vue').setAttribute('aria-pressed', String(mode === '3d'));
}

// reprise : rouvrir la vue 3D telle qu'elle a été sauvegardée ; sinon elle part du centre et de l'échelle de la carte
async function definirMode(m, { reprise = false } = {}) {
  if (!etat || m === mode) return sceneMs;
  if (m === '3d') {
    const debut = performance.now();
    if (!reprise) sauvegarder();
    const c = carte.getCenter();
    const depart = reprise && etat.vue3d ? etat.vue3d : {
      cible: repere.lonLatVersLocal([c.lng, c.lat]),
      distance: distancePourZoom(carte.getZoom(), c.lat, hauteurVue(), R.scene.fovDegres),
      azimut: etat.vue3d?.azimut ?? 0,
      inclinaison: etat.vue3d?.inclinaison ?? rad(R.scene.inclinaisonDefautDegres),
    };
    mode = '3d';
    $('scene').hidden = false;
    $('carte').inert = true;
    majBascule();
    try {
      await chargerScene();
    } catch (e) {
      // WebGL refusé, fichier illisible… : on le dit et on reste sur la carte
      toast(t('scene.erreur', { raison: e.message }));
      window.__jeu?.log('scene-erreur', { raison: e.message });
      mode = '2d'; $('scene').hidden = true; $('carte').inert = false; majBascule();
      return null;
    }
    if (mode !== '3d') return sceneMs; // rebasculé pendant le chargement
    scene.activer(true);
    scene.definirCouches(etat.couches);
    scene.definirEtat(depart);
    scene.selectionner(objetScene(etat.selection));
    scene.dessinerMaintenant();
    if (sceneMs === null) {
      sceneMs = Math.round(performance.now() - debut);
      window.__jeu?.log('scene-prete', { ms: sceneMs, ...scene.comptes });
    }
  } else {
    const e = scene?.etat();
    mode = '2d';
    scene?.activer(false);
    $('scene').hidden = true;
    $('carte').inert = false;
    if (e) {
      const centre = repere.localVersLonLat(e.cible);
      etat.vue3d = e;
      carte.jumpTo({ center: centre, zoom: borner(zoomPourDistance(e.distance, centre[1], hauteurVue() || carte.getCanvas().clientHeight, R.scene.fovDegres), R.carte.zoomMin, R.carte.zoomMax) });
    }
    majBascule();
  }
  sauvegarder();
  window.__jeu?.log('vue', { mode });
  return sceneMs;
}
$('bascule-vue').onclick = () => definirMode(mode === '3d' ? '2d' : '3d');

// ─── Écrans ────────────────────────────────────────────────────────────────
function montrerTitre() {
  // Désactivés dans le HTML tant que les données ne sont pas chargées : un clic
  // trop tôt ne faisait rien (vu en ligne, ~2 Mo de network.json).
  $('continuer').disabled = false;
  $('nouvelle').disabled = false;
  $('titre').hidden = false;
  scene?.activer(false); // derrière l'écran titre, la scène ne calcule rien
  majBoucle();
  majMission();
  $('continuer').hidden = !store.has('partie');
  ($('continuer').hidden ? $('nouvelle') : $('continuer')).focus();
}
async function jouer(partie) {
  etat = { ...nouvellePartie(), ...partie };
  etat.couches = { ...COUCHES_ACTIVES, ...etat.couches }; // une couche ajoutée depuis la sauvegarde prend sa valeur par défaut
  // Une partie de la v0.3 n'a pas de carrefours (ils restent proposés), une partie de la v0.4 ni demande ni hypothèses
  etat.scenario = { ...scenarioVide(), ...etat.scenario };
  etat.scenario.hypotheses = { ...HYPOTHESES, ...etat.scenario.hypotheses };
  historique.reinitialiser(etat.scenario);
  fermerEditeur();
  fermerCarrefour();
  fermerFlux();
  // Toujours repartir de la carte : la vue 3D se rouvre ensuite si la partie y était
  mode = '2d'; scene?.activer(false); $('scene').hidden = true; $('carte').inert = false; majBascule();
  $('titre').hidden = true;
  construireCouches();
  if (!carte.isStyleLoaded()) await new Promise(res => carte.once('load', res));
  appliquerCouches();
  if (etat.vue) carte.jumpTo({ center: etat.vue.centre, zoom: etat.vue.zoom });
  else recentrer();
  selectionner(etat.selection);
  majSections();
  // Le trafic repart à 8 h à chaque partie ouverte : seul le scénario est sauvegardé, pas les blocs
  demarrerTrafic();
  if (partie.mode === '3d') await definirMode('3d', { reprise: true });
  // Première partie : la première mission commence (vol jusqu'à son lieu) ; sinon la mission en cours reprend
  if (progression.enCours && !partie.vue) demarrerMission(progression.enCours);
  majMission();
}
function sauvegarder() {
  if (!etat) return;
  if (mode === '3d' && scene) {
    // La vue 3D fait foi : la carte la retrouvera au même endroit, à la même échelle
    const e = scene.etat(), centre = repere.localVersLonLat(e.cible);
    etat.vue3d = e;
    etat.vue = { centre, zoom: borner(zoomPourDistance(e.distance, centre[1], hauteurVue(), R.scene.fovDegres), R.carte.zoomMin, R.carte.zoomMax) };
  } else {
    const c = carte.getCenter();
    etat.vue = { centre: [c.lng, c.lat], zoom: carte.getZoom() };
  }
  etat.mode = mode;
  store.save('partie', etat);
}
carte.on('moveend', () => { if (etat && $('titre').hidden && mode === '2d') sauvegarder(); });

$('continuer').onclick = () => jouer(store.load('partie') || nouvellePartie());
$('nouvelle').onclick = () => {
  if (!store.has('partie')) return jouer(nouvellePartie());
  const d = $('dialogue-confirmer');
  d.onclose = () => { if (d.returnValue === 'oui') jouer(nouvellePartie()); };
  d.showModal();
};
$('nom-jeu').onclick = e => { e.preventDefault(); sauvegarder(); montrerTitre(); };
$('ouvrir-menu').onclick = () => { $('dialogue-pause').showModal(); majBoucle(); };
$('reprendre').onclick = () => $('dialogue-pause').close();
for (const d of document.querySelectorAll('dialog')) d.addEventListener('close', () => majBoucle()); // une boîte fermée : le trafic reprend
$('quitter').onclick = () => { $('dialogue-pause').close(); sauvegarder(); montrerTitre(); };
// Aide clavier : texte relu à chaque ouverture, donc toujours dans la langue courante
function basculerAide() {
  const d = $('dialogue-aide');
  if (d.open) { d.close(); return; }
  $('aide-corps').replaceChildren(el('dl', {}, ...COMMANDES_AIDE.flatMap(id => [
    el('dt', { textContent: t(`aide.${id}.action`) }),
    el('dd', {}, el('kbd', { textContent: t(`aide.${id}.clavier`) }), ` — ${t('aide.souris')} : ${t(`aide.${id}.souris`)}`),
  ])));
  d.showModal();
  d.scrollTop = 0; // le focus initial sur « Fermer » faisait défiler la boîte jusqu'en bas
}
$('pause-aide').onclick = basculerAide;
$('pause-reglages').onclick = () => $('dialogue-reglages').showModal();
$('ouvrir-reglages').onclick = () => $('dialogue-reglages').showModal();
$('recentrer').onclick = recentrer;
$('deselectionner').onclick = () => selectionner(null);

// ─── Éditeur de section transversale (v0.3) ────────────────────────────────
// currentScenario = etat.scenario : seules les sections modifiées y sont ; les données sources ne changent jamais.
const historique = creerHistorique(scenarioVide());
let edite = null, apercu = null; // tronçon édité ; section affichée pendant un glisser (pas encore dans l'historique)
const sectionDe = id => etat?.scenario.sections[id] ?? sectionMesuree(segments.get(id));
const nomDe = s => [s.nom.fr, s.nom.nl].filter(Boolean)[0] ?? null;
const editeur = creerEditeur({
  racine: $('editeur'), P: PALETTE, t, lang: i18n.lang,
  rappels: {
    surOperation: (nom, args, opts) => operer(nom, args, opts),
    surAnnuler: () => annuler(), surRetablir: () => retablir(),
    surMesure: () => revenirMesure(), surFermer: () => fermerEditeur(),
    surChoixBande: () => majSections(),
  },
});
function infoEditeur(id) {
  const s = segments.get(id), e = s.emprise;
  return {
    nom: nomDe(s), modifiee: !!etat.scenario.sections[id], peutAnnuler: historique.peutAnnuler, peutRetablir: historique.peutRetablir,
    source: t('valeur.emprise-source', { coupes: e.coupes, ecart: e.ecart, confiance: t(`valeur.confiance.${e.confiance}`) }),
  };
}
function ouvrirEditeur(id) {
  const s = segments.get(id);
  if (!s?.emprise) { toast(t(s ? 'editeur.non-editable' : 'editeur.choisir')); return false; }
  if (editeCarrefour) fermerCarrefour(); // un seul bandeau à la fois
  if (editeFlux) fermerFlux();
  edite = id; apercu = null;
  editeur.afficher(sectionDe(id), infoEditeur(id));
  carte.resize();
  majSections();
  window.__jeu?.log('editeur', { troncon: id });
  return true;
}
function fermerEditeur() {
  if (!edite) return;
  edite = null; apercu = null;
  editeur.masquer();
  carte.resize();
  majSections();
}
// M : ferme le bandeau ouvert, sinon ouvre celui de la sélection (section d'un tronçon, ou carrefour)
function basculerEditeur() {
  if (edite) return fermerEditeur();
  if (editeCarrefour) return fermerCarrefour();
  if (editeFlux) return fermerFlux();
  const id = etat?.selection;
  if (estNoeud(id)) return ouvrirCarrefour(id);
  if (id && segments.has(id)) return ouvrirEditeur(id);
  toast(t('editeur.choisir'));
}

/** Une opération de js/section.js sur la section éditée. apercu : montrée sans entrer dans l'historique (glisser). */
function operer(nom, args, { apercu: provisoire = false, annulerApercu = false } = {}) {
  if (!edite) return null;
  if (annulerApercu || !nom) { apercu = null; editeur.apercu(sectionDe(edite)); majSections(); return null; }
  const r = OPERATIONS[nom](sectionDe(edite), ...args);
  if (r.refus) { editeur.message(t(`refus.${r.refus}`, r.valeurs), true); window.__jeu?.log('refus', { operation: nom, refus: r.refus }); return r; }
  if (verifier(r.section).length) throw new Error(`Section invalide après ${nom}`); // ne doit jamais arriver : les règles l'empêchent
  if (provisoire) { apercu = r.section; editeur.apercu(r.section); majSections(); return r; }
  apercu = null;
  const sections = { ...etat.scenario.sections };
  if (memeSection(r.section, sectionMesuree(segments.get(edite)))) delete sections[edite]; // revenue à la mesure : rien à garder
  else sections[edite] = r.section;
  etat.scenario = historique.faire({ ...etat.scenario, sections });
  apresChangement();
  window.__jeu?.log('section', { troncon: edite, operation: nom });
  return r;
}
function apresChangement() {
  if (edite) editeur.afficher(sectionDe(edite), infoEditeur(edite));
  if (editeCarrefour) editeurCarrefour.afficher(infoCarrefour(editeCarrefour));
  majSections(); // et les carrefours, et les flux
  if (editeFlux) editeurFlux.afficher(infoFlux(editeFlux));
  if (etat.selection && !estBatiment(etat.selection)) afficherInspecteur(objetChoisi());
  majReseauTrafic(); // les blocs suivent aussitôt les voies et raccords du scénario
  sauvegarder();
}
const messageEditeur = (texte, refus = false) => (editeCarrefour ? editeurCarrefour : editeFlux ? editeurFlux : editeur).message(texte, refus);
function annuler() {
  const e = historique.annuler();
  if (!e) { messageEditeur(t('editeur.rien-annuler')); return; }
  etat.scenario = e; apresChangement(); messageEditeur(t('editeur.annule'));
}
function retablir() {
  const e = historique.retablir();
  if (!e) { messageEditeur(t('editeur.rien-retablir')); return; }
  etat.scenario = e; apresChangement(); messageEditeur(t('editeur.retabli'));
}
function revenirMesure() {
  if (!edite || !etat.scenario.sections[edite]) return;
  const sections = { ...etat.scenario.sections };
  delete sections[edite];
  etat.scenario = historique.faire({ ...etat.scenario, sections });
  apresChangement();
  editeur.message(t('editeur.remis'));
}

// Les sections dessinées : toutes celles du scénario, plus celle qu'on édite (même inchangée)
let lignesRues = null; // Map(id → ligne WGS84), une fois streets.geojson lu
couche('rues').then(g => { lignesRues = new Map(g.features.map(f => [f.properties.id, f.geometry.coordinates])); majSections(); if (etat && !trafic) demarrerTrafic(); if (volEnAttente) allerAuLieu(); });
function sectionsDessinees() {
  if (!etat) return [];
  const ids = new Set(Object.keys(etat.scenario.sections));
  if (edite) ids.add(edite);
  return [...ids].map(id => (id === edite && apercu ? apercu : sectionDe(id))).filter(Boolean);
}
function majSections() {
  const liste = sectionsDessinees();
  const bande = edite && editeur.bandeChoisie ? `${edite}:${editeur.bandeChoisie}` : '';
  if (lignesRues && carte.getSource('sections')) {
    carte.getSource('sections').setData(featuresSections(
      liste.filter(s => lignesRues.has(s.troncon)).map(section => ({ ligne: lignesRues.get(section.troncon), section })), wgs84VersLambert, lambertVersWgs84));
    for (const l of ['sections-choisie-cerne', 'sections-choisie']) carte.setFilter(l, ['==', ['get', 'id'], bande]);
  }
  scene?.definirSections(liste.map(section => ({ section, decalages: decalages(section) })), bande || null);
  // Le tronçon choisi dont la section est dessinée : un filet de sélection, qui laisse voir les bandes
  const fin = !!etat?.selection && liste.some(x => x.troncon === etat.selection);
  if (carte.getLayer('rues-selection')) carte.setPaintProperty('rues-selection', 'line-width', fin ? R.traits.selectionFinPx : largeurSelection2d);
  scene?.affinerSelection(fin);
  majCarrefours(); // les voies des carrefours viennent des sections : ils suivent
  majFlux();       // la capacité aussi
}

// ─── Carrefours (v0.4) : raccords, traversées, régulation ──────────────────
// currentScenario.carrefours ne garde que les choix du joueur ; les raccords en vigueur sont recalculés
// à partir des sections du moment (js/carrefour.js), donc une voie créée dans un tronçon y est raccordée.
let editeCarrefour = null;
const lignesMetres = new Map(); // tronçon → ligne Lambert 72 (calculée une fois, depuis streets.geojson)
const ligneDe = id => {
  if (!lignesRues?.has(id)) return null;
  if (!lignesMetres.has(id)) lignesMetres.set(id, lignesRues.get(id).map(wgs84VersLambert));
  return lignesMetres.get(id);
};
const sectionBranche = id => (id === edite && apercu ? apercu : sectionDe(id));
function etatCarrefour(id) {
  const branches = branchesDe(noeuds.get(id), { segments, sectionDe: sectionBranche, ligneDe })
    .map(b => ({ ...b, nomTexte: b.nom ? [b.nom.fr, b.nom.nl].filter(Boolean)[0] ?? null : null }));
  const carrefour = etat?.scenario.carrefours?.[id] ?? null;
  const { raccords, perdus } = raccordsDe(branches, carrefour);
  return { branches, voies: toutesLesVoies(branches), raccords, perdus, verif: verifierCarrefour(branches, raccords), carrefour };
}
const nomCarrefour = branches => [...new Set(branches.map(b => b.nomTexte).filter(Boolean))].join(' × ') || null;
const carrefourModifiable = id => !!lignesRues && etatCarrefour(id).branches.length >= 2;
function infoCarrefour(id) {
  const c = etatCarrefour(id);
  return { id, nom: nomCarrefour(c.branches), ...c, feux: c.carrefour?.regulation === 'feux' ? phasesDe(c.branches, c.carrefour) : null, peutAnnuler: historique.peutAnnuler, peutRetablir: historique.peutRetablir };
}
const editeurCarrefour = creerEditeurCarrefour({
  racine: $('editeur'), t, lang: i18n.lang,
  rappels: {
    surOperation: (nom, args) => opererCarrefour(nom, args),
    surAnnuler: () => annuler(), surRetablir: () => retablir(),
    surRemettre: () => remettreCarrefour(), surFermer: () => fermerCarrefour(),
    surChoixVoie: () => majCarrefours(),
  },
});
function ouvrirCarrefour(id) {
  if (!noeuds.has(id)) { toast(t('carrefour.choisir')); return false; }
  if (!carrefourModifiable(id)) { toast(t('carrefour.non-editable')); return false; }
  if (edite) fermerEditeur();
  if (editeFlux) fermerFlux();
  if (etat.selection !== id) { editeCarrefour = id; selectionner(id); }
  editeCarrefour = id;
  editeurCarrefour.afficher(infoCarrefour(id));
  carte.resize();
  majCarrefours();
  window.__jeu?.log('carrefour', { noeud: id });
  return true;
}
function fermerCarrefour() {
  if (!editeCarrefour) return;
  editeCarrefour = null;
  editeurCarrefour.masquer();
  carte.resize();
  majCarrefours();
}
/** Une opération de js/carrefour.js sur le carrefour édité ; le scénario n'en garde que les choix du joueur. */
function opererCarrefour(nom, args) {
  return editeCarrefour ? opererSurNoeud(editeCarrefour, nom, args) : null;
}
/** Une opération de js/carrefour.js sur un nœud (bandeau ouvert ou flèches au sol) ; le scénario n'en garde que les choix. */
function opererSurNoeud(id, nom, args) {
  const c = etatCarrefour(id);
  const r = OPERATIONS_CARREFOUR[nom](c.carrefour, c.branches, ...args);
  if (r.refus) { window.__jeu?.log('refus', { operation: nom, refus: r.refus }); return r; }
  const carrefours = { ...etat.scenario.carrefours };
  if (r.carrefour) carrefours[id] = r.carrefour; else delete carrefours[id];
  etat.scenario = historique.faire({ ...etat.scenario, carrefours });
  apresChangement();
  window.__jeu?.log('carrefour-operation', { noeud: id, operation: nom });
  return r;
}
function remettreCarrefour() {
  if (!editeCarrefour || !etat.scenario.carrefours[editeCarrefour]) return;
  const carrefours = { ...etat.scenario.carrefours };
  delete carrefours[editeCarrefour];
  etat.scenario = historique.faire({ ...etat.scenario, carrefours });
  apresChangement();
  editeurCarrefour.message(t('carrefour.remis'));
}

// Ce qui est dessiné : le carrefour choisi (ou édité) en entier, et les traversées posées partout ailleurs
const etiquettesBranches = []; // { marqueur (2D), dom (3D), local }
let geometriesDessinees = [], donneesCarrefours2d = null; // ce que reçoit la carte (lu par le mode debug)
function majCarrefours() {
  if (!etat || !lignesRues) return;
  const complet = editeCarrefour ?? (estNoeud(etat.selection) ? etat.selection : null);
  const ids = new Set(Object.keys(etat.scenario.carrefours ?? {}));
  if (complet) ids.add(complet);
  geometriesDessinees = [...ids].filter(id => noeuds.has(id)).map(id => {
    const c = etatCarrefour(id);
    if (c.branches.length < 2) return null;
    return { noeud: id, complet: id === complet, branches: c.branches, geometrie: geometrieCarrefour(c.branches, c.raccords, traverseesDe(c.branches, c.carrefour), DESSIN_CARREFOUR) };
  }).filter(Boolean);
  const voie = editeCarrefour ? editeurCarrefour.voieChoisie : null;
  donneesCarrefours2d = featuresCarrefours(geometriesDessinees, voie, lambertVersWgs84);
  carte.getSource('carrefours')?.setData(donneesCarrefours2d);
  const local = l => l.map(p => repere.versLocal(p));
  scene?.definirCarrefours(geometriesDessinees.map(({ noeud, complet: plein, geometrie: g }) => ({
    noeud, complet: plein, zone: g.zone && local(g.zone),
    traversees: g.traversees.map(tr => ({ type: tr.type, anneau: local(tr.anneau), bandes: tr.bandes.map(local) })),
    raccords: g.raccords.map(r => ({ de: r.de, vers: r.vers, origine: r.origine, ligne: local(r.ligne) })),
  })), voie);
  // Les lettres des branches (comme dans le bandeau), un peu au-delà du recul
  for (const e of etiquettesBranches.splice(0)) { e.marqueur.remove(); e.dom.remove(); }
  const g = geometriesDessinees.find(x => x.complet);
  if (g && etat.couches.sections) {
    g.branches.forEach((b, i) => {
      const p = pointSurLigne(b.ligne, Math.min(b.longueur * 0.6, g.geometrie.recul + R.carrefour.lettreAuDelaM)).p;
      const texte = lettre(i);
      const marqueur = new maplibregl.Marker({ element: el('div', { className: 'etiquette-branche', textContent: texte }) }).setLngLat(lambertVersWgs84(p)).addTo(carte);
      const dom = $('scene-etiquettes').appendChild(el('div', { className: 'etiquette-branche', textContent: texte }));
      etiquettesBranches.push({ marqueur, dom, local: repere.versLocal(p) });
    });
  }
}

// ─── Flux et indicateurs (v0.5) : simulation statique, refaite à chaque modification ─
// simulationState n'est jamais sauvegardé : il se recalcule depuis le scénario, les données et les comptages.
let editeFlux = null;
const regulationDe = n => (n ? etat?.scenario.carrefours?.[n]?.regulation ?? null : null);
function etatSim(id) {
  const s = segments.get(id);
  return etatTroncon({
    segment: s, section: sectionBranche(id), choix: etat?.scenario.demande?.[id] ?? null, comptage: comptages.parTroncon[id] ?? null,
    hypotheses: etat?.scenario.hypotheses ?? HYPOTHESES, regulation: { aller: regulationDe(s.toNode), retour: regulationDe(s.fromNode) },
    vitesseVeloKmh: comptages.vitesseVeloKmh,
  });
}
/** Les tronçons qui ont une demande : choix du joueur et comptages. */
const tronconsFlux = () => [...new Set([...Object.keys(etat?.scenario.demande ?? {}), ...Object.keys(comptages.parTroncon)])].filter(id => segments.has(id));
let donneesFlux2d = null; // ce que reçoit la carte (lu par le mode debug)
function majFlux() {
  if (!etat) return;
  const etats = tronconsFlux().map(etatSim);
  bilanFlux = bilan(etats);
  majStatutFlux();
  if (!lignesRues) return;
  donneesFlux2d = { type: 'FeatureCollection', features: etats.filter(e => e.renseigne && lignesRues.has(e.troncon)).map(e => ({
    type: 'Feature', properties: { id: e.troncon, niveau: niveau(e.saturationMax) ?? 'inconnu' }, geometry: { type: 'LineString', coordinates: lignesRues.get(e.troncon) },
  })) };
  carte.getSource('flux')?.setData(donneesFlux2d);
}
function conflitsDe(id) {
  const c = etatCarrefour(id);
  return conflits(geometrieCarrefour(c.branches, c.raccords, traverseesDe(c.branches, c.carrefour), DESSIN_CARREFOUR), c.voies);
}
const editeurFlux = creerEditeurFlux({
  racine: $('editeur'), t, lang: i18n.lang,
  rappels: {
    surOperation: (nom, args) => opererFlux(nom, args),
    surAnnuler: () => annuler(), surRetablir: () => retablir(),
    surEffacer: () => effacerFlux(), surFermer: () => fermerFlux(),
  },
});
const infoFlux = id => ({
  id, nom: nomDe(segments.get(id)), etat: etatSim(id), choix: etat.scenario.demande[id] ?? null, hypotheses: etat.scenario.hypotheses,
  peutAnnuler: historique.peutAnnuler, peutRetablir: historique.peutRetablir,
});
function ouvrirFlux(id) {
  if (!segments.has(id)) { toast(t('flux.choisir')); return false; }
  if (edite) fermerEditeur();
  if (editeCarrefour) fermerCarrefour();
  editeFlux = id;
  editeurFlux.afficher(infoFlux(id));
  carte.resize();
  window.__jeu?.log('flux', { troncon: id });
  return true;
}
function fermerFlux() {
  if (!editeFlux) return;
  editeFlux = null;
  editeurFlux.masquer();
  carte.resize();
}
function basculerFlux() {
  if (editeFlux) return fermerFlux();
  const id = etat?.selection;
  if (id && segments.has(id)) return ouvrirFlux(id);
  toast(t('flux.choisir'));
}
/** Une opération de js/simulation.js : la demande du tronçon ouvert, ou une hypothèse du scénario. */
function opererFlux(nom, args) {
  if (!editeFlux) return null;
  const r = nom === 'definirHypothese' ? definirHypothese(etat.scenario.hypotheses, ...args) : definirDemande(etat.scenario.demande[editeFlux] ?? null, ...args);
  if (r.refus) { window.__jeu?.log('refus', { operation: nom, refus: r.refus }); return r; }
  if (r.hypotheses) etat.scenario = historique.faire({ ...etat.scenario, hypotheses: r.hypotheses });
  else {
    const demande = { ...etat.scenario.demande };
    if (r.demande) demande[editeFlux] = r.demande; else delete demande[editeFlux];
    etat.scenario = historique.faire({ ...etat.scenario, demande });
  }
  apresChangement();
  window.__jeu?.log('flux-operation', { troncon: editeFlux, operation: nom });
  return r;
}
function effacerFlux() {
  if (!editeFlux || !etat.scenario.demande[editeFlux]) return;
  const demande = { ...etat.scenario.demande };
  delete demande[editeFlux];
  etat.scenario = historique.faire({ ...etat.scenario, demande });
  apresChangement();
  editeurFlux.message(t('flux.efface'));
}

// ─── Trafic en temps réel (v0.6) : boucle à pas fixe, blocs sur les voies du scénario ──
// La simulation avance par pas fixes (js/lib/loop.js), en pause quand le joueur la met en pause, sur l'écran
// titre, quand une boîte de dialogue est ouverte et onglet caché. Le rendu lit les positions à chaque image.
let trafic = null, reseauTrafic = null, pauseJoueur = false, rangVitesse = 0, dernierTemps2d = -1, dernierTemps3d = -1;
const boucle = createLoop({ update: dt => trafic?.pas(dt), render: alpha => dessinerTrafic(alpha), step: SIMULATION.pasS, hidden: 'pause' });
function nouveauReseau() {
  return construireReseau({
    segments, noeuds, sectionDe, ligneDe, carrefourDe: id => etat?.scenario.carrefours?.[id] ?? null, regulationDe,
    vitesseVeloKmh: comptages.vitesseVeloKmh, D: DESSIN_CARREFOUR,
  });
}
function demarrerTrafic() {
  if (!lignesRues) return; // les axes ne sont pas encore lus : demarrerTrafic() est rappelé quand ils le sont
  const t = performance.now();
  reseauTrafic = nouveauReseau();
  trafic = creerTrafic(reseauTrafic, { graine: SIMULATION.graine, demandeDe: id => etat?.scenario.demande?.[id] ?? null });
  window.__jeu?.log('trafic', { chemins: reseauTrafic.chemins.size, entrees: reseauTrafic.entrees.length, ms: Math.round(performance.now() - t) });
  suiviM = suivi(trafic.temps); secondeM = -1; // le trafic repart : la mission se mesure de nouveau
  majMission();
  boucle.start();
  majBoucle();
}
// Reconstruire tout le réseau prend ~0,1 à 0,3 s : une rafale de modifications (glisser, annuler en série)
// n'en déclenche qu'une, peu après la dernière ; reconstruireTrafic() le fait tout de suite (debug, critères)
let minuterieReseau = 0;
function majReseauTrafic() {
  if (!trafic) return;
  clearTimeout(minuterieReseau);
  minuterieReseau = setTimeout(reconstruireTrafic, R.trafic?.delaiReconstructionMs ?? 150);
}
function reconstruireTrafic() {
  clearTimeout(minuterieReseau);
  if (!trafic) return;
  const t = performance.now();
  reseauTrafic = nouveauReseau();
  trafic.reconstruire(reseauTrafic);
  dernierTemps2d = dernierTemps3d = -1;
  window.__jeu?.log('trafic-reseau', { ms: Math.round(performance.now() - t) });
}
const entreeDe = id => (reseauTrafic?.entrees.filter(e => e.troncon === id) ?? []).map(e => ({ sens: e.sens, hierarchie: e.hierarchie, modes: Object.fromEntries(Object.keys(VEHICULES).map(m => [m, trafic.debitEntree(e, m)])) }));
/** La boucle tourne en partie, hors pause du joueur et hors boîte de dialogue ; sinon elle attend. */
function majBoucle() {
  const marche = !!trafic && enCarte() && !pauseJoueur;
  if (marche) boucle.resume(); else boucle.pause();
  majHud();
}
function basculerPause() { pauseJoueur = !pauseJoueur; majBoucle(); window.__jeu?.log('trafic-pause', { pause: pauseJoueur }); }
function changerVitesse() {
  rangVitesse = (rangVitesse + 1) % SIMULATION.vitesses.length;
  boucle.setTimeScale(SIMULATION.vitesses[rangVitesse]);
  majHud();
}
const heure = s => { const m = Math.floor(SIMULATION.heureDepart * 60 + s / 60); return `${Math.floor(m / 60) % 24} h ${String(m % 60).padStart(2, '0')}`; };
let hudSeconde = -1;
function majHud(force = true) {
  if (!trafic) { $('trafic-hud').hidden = true; return; }
  const sec = Math.floor(trafic.temps);
  if (!force && sec === hudSeconde) return;
  hudSeconde = sec;
  $('trafic-hud').hidden = false;
  const enPause = pauseJoueur || !enCarte();
  $('trafic-pause-texte').textContent = t(pauseJoueur ? 'trafic.reprendre' : 'trafic.pause');
  $('trafic-pause').setAttribute('aria-pressed', String(pauseJoueur));
  $('trafic-vitesse-texte').textContent = `×${SIMULATION.vitesses[rangVitesse]}`;
  $('hud-vue-texte').textContent = mode === '3d' ? '2D' : '3D';
  $('trafic-vitesse').title = t('trafic.vitesse');
  const b = trafic.bilan();
  $('trafic-horloge').textContent = t('trafic.horloge', { h: heure(trafic.temps), n: b.enCirculation });
  $('trafic-horloge').title = t('trafic.bilan', { e: b.entres, s: b.sortis, i: b.sansIssue, r: b.refuses });
  $('trafic-hud').classList.toggle('en-pause', enPause);
  // L'inspecteur d'un tronçon suit le trafic, une fois par seconde simulée
  if (!force && etat?.selection && segments.has(etat.selection) && sec % 2 === 0) afficherInspecteur(objetChoisi());
}
$('trafic-pause').onclick = basculerPause;
$('trafic-vitesse').onclick = changerVitesse;

// Le rendu : un calque 2D par-dessus la carte (rectangles à l'échelle), des instances dans la 3D
const calque = $('trafic-2d'), ctx2d = calque.getContext('2d');
const TEINTE_2D = { voiture: PALETTE.noeud, bus: PALETTE.bus, velo: PALETTE.cyclable }; // mêmes teintes que la 3D ; cerne blanc (lisible sur l'encre des axes)
function dessinerTrafic(alpha) {
  if (!trafic) return;
  majHud(false);
  suivreMission();
  const visible = etat?.couches.flux !== false;
  majFleches();
  if (mode === '3d') {
    if (calque.width) { ctx2d.clearRect(0, 0, calque.width, calque.height); }
    if (scene && (trafic.temps !== dernierTemps3d || !visible)) { scene.definirTrafic(trafic.positions(alpha)); dernierTemps3d = trafic.temps; }
    scene?.definirFleches([...fleches, ...marquesMission()].map(f => ({ anneau: f.anneau.map(p => repere.versLocal(p)), couleur: f.couleur })));
    return;
  }
  dessiner2d(visible ? trafic.positions(alpha) : null);
}
function dessiner2d(lots) {
  const r = $('carte').getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  if (calque.width !== Math.round(r.width * dpr) || calque.height !== Math.round(r.height * dpr)) { calque.width = Math.round(r.width * dpr); calque.height = Math.round(r.height * dpr); }
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx2d.clearRect(0, 0, r.width, r.height);
  // Lambert 72 → écran : une transformation affine calée au centre de la vue (écart < 1 px dans l'écran)
  const c = wgs84VersLambert(carte.getCenter().toArray());
  const ecran = p => carte.project(lambertVersWgs84(p));
  const o = ecran(c), ex = ecran([c[0] + 100, c[1]]), ey = ecran([c[0], c[1] + 100]);
  const ux = [(ex.x - o.x) / 100, (ex.y - o.y) / 100], uy = [(ey.x - o.x) / 100, (ey.y - o.y) / 100];
  const pxParM = Math.hypot(...ux);
  versEcran2d = p => { const dx = p[0] - c[0], dy = p[1] - c[1]; return [o.x + dx * ux[0] + dy * uy[0], o.y + dx * ux[1] + dy * uy[1]]; };
  // Les flèches au sol du carrefour choisi (sous les blocs)
  for (const f of fleches) {
    ctx2d.beginPath();
    f.anneau.forEach((p, k) => { const [X, Y] = versEcran2d(p); if (k) ctx2d.lineTo(X, Y); else ctx2d.moveTo(X, Y); });
    ctx2d.closePath();
    ctx2d.fillStyle = f.couleur;
    ctx2d.fill();
    ctx2d.strokeStyle = PALETTE.voirie; // un filet blanc détache la flèche des axes d'encre
    ctx2d.lineWidth = 1;
    ctx2d.stroke();
    // Au rouge, une barre d'arrêt en travers de la base : le feu ne se lit pas qu'à la couleur
    if (f.couleur === PALETTE.selection) {
      const [a1, a2] = [versEcran2d(f.barre[0]), versEcran2d(f.barre[1])];
      ctx2d.beginPath(); ctx2d.moveTo(...a1); ctx2d.lineTo(...a2);
      ctx2d.strokeStyle = PALETTE.selection; ctx2d.lineWidth = Math.max(2, 0.5 * pxParM); ctx2d.stroke();
    }
  }
  // La voie sous l'outil et la voie que la mission désigne : un contour (la voie reste lisible dessous)
  for (const f of marquesMission()) {
    ctx2d.beginPath();
    f.anneau.forEach((p, k) => { const [X, Y] = versEcran2d(p); if (k) ctx2d.lineTo(X, Y); else ctx2d.moveTo(X, Y); });
    ctx2d.closePath();
    ctx2d.setLineDash(f.tirets ? [6, 4] : []);
    ctx2d.strokeStyle = f.couleur; ctx2d.lineWidth = 3; ctx2d.stroke();
    ctx2d.setLineDash([]);
  }
  if (!lots) return;
  for (const [m, t] of Object.entries(lots)) {
    const G = VEHICULES[m], L = Math.max(G.longueur, 2 / pxParM) / 2, W = Math.max(G.largeur, 1.5 / pxParM) / 2;
    ctx2d.fillStyle = TEINTE_2D[m];
    ctx2d.strokeStyle = m === 'voiture' ? PALETTE.voirie : PALETTE.encre;
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    for (let i = 0; i < t.length; i += 3) {
      const dx = t[i] - c[0], dy = t[i + 1] - c[1];
      const X = o.x + dx * ux[0] + dy * uy[0], Y = o.y + dx * ux[1] + dy * uy[1];
      if (X < -20 || Y < -20 || X > r.width + 20 || Y > r.height + 20) continue;
      const ca = Math.cos(t[i + 2]), sa = Math.sin(t[i + 2]);
      // Axe du bloc (cap) et sa normale, en mètres Lambert, puis à l'écran
      const ax = [ca * ux[0] + sa * uy[0], ca * ux[1] + sa * uy[1]], ay = [-sa * ux[0] + ca * uy[0], -sa * ux[1] + ca * uy[1]];
      ctx2d.moveTo(X + ax[0] * L + ay[0] * W, Y + ax[1] * L + ay[1] * W);
      ctx2d.lineTo(X + ax[0] * L - ay[0] * W, Y + ax[1] * L - ay[1] * W);
      ctx2d.lineTo(X - ax[0] * L - ay[0] * W, Y - ax[1] * L - ay[1] * W);
      ctx2d.lineTo(X - ax[0] * L + ay[0] * W, Y - ax[1] * L + ay[1] * W);
      ctx2d.closePath();
    }
    ctx2d.fill();
    ctx2d.stroke(); // aucune teinte ne ressort seule partout (axes d'encre, chaussée blanche, papier)
  }
}

// ─── Outils de la barre (v0.7) : un clic (ou un glisser) sur une voie la transforme ──
let outil = null, trait = null, versEcran2d = null; // trait : tronçons déjà peints pendant ce glisser
function majBarre() {
  for (const b of document.querySelectorAll('#barre-outils [data-outil]')) b.setAttribute('aria-pressed', String(b.dataset.outil === (outil ?? '')));
  $('barre-outils').classList.toggle('active', !!outil);
  $('carte').classList.toggle('peinture', !!outil);
}
function choisirOutil(o) {
  outil = o && o !== outil ? o : null;
  if (outil) carte.dragPan.disable(); else carte.dragPan.enable();
  scene?.definirPeinture(outil ? peindre : null);
  scene?.definirSurvol(outil ? majSurvol : null);
  if (!outil) majSurvol(null);
  majBarre();
  if (outil) toast(t('outil.aide', { outil: t(`outil.${outil}`) }));
  window.__jeu?.log('outil', { outil });
}
function construireBarre() {
  $('barre-outils').replaceChildren(...[null, ...OUTILS].map(o => {
    const b = el('button', { type: 'button', className: `outil${o ? '' : ' outil-aucun'}`, textContent: t(`outil.${o ?? 'aucun'}`), onclick: () => choisirOutil(o) });
    b.dataset.outil = o ?? '';
    b.title = t(`outil.${o ?? 'aucun'}.titre`);
    return b;
  }));
  $('barre-outils').setAttribute('aria-label', t('outil.libelle'));
  majBarre();
}
construireBarre();
/** Le tronçon dont la section couvre ce point (Lambert 72), et le décalage du point à l'axe (positif à gauche). */
function voieSous(p) {
  let meilleur = null;
  for (const s of segments.values()) {
    const l = ligneDe(s.id);
    if (!l || s.niveau !== 0) continue; // un clic touche la surface, jamais un tunnel dessous (ni un pont)
    const r = distancePointLigne(p, l);
    const sec = sectionDe(s.id);
    const demi = sec ? Math.max(sec.axe, sec.emprise - sec.axe) + 0.5 : 4;
    if (r.distance > demi || (meilleur && r.distance >= meilleur.distance)) continue;
    const a = l[r.segment], b = l[r.segment + 1];
    const cote = Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) || 1;
    meilleur = { troncon: s.id, distance: r.distance, decalage: cote * r.distance };
  }
  return meilleur;
}
/** Pose l'outil actif au point p (Lambert 72) ; un même glisser ne repasse pas sur un tronçon. */
function poserOutil(p) {
  const v = voieSous(p);
  if (!v || trait?.has(v.troncon)) return null;
  trait?.add(v.troncon);
  const seg = segments.get(v.troncon);
  const r = appliquerOutil(sectionDe(v.troncon), v.decalage, outil, { sensSource: seg.sourceAttributes?.oneway ?? null });
  if (r.refus) { if (r.refus !== 'deja' || trait?.size === 1) toast(t(`refus.${r.refus}`, r.valeurs)); return r; }
  const sections = { ...etat.scenario.sections };
  if (memeSection(r.section, sectionMesuree(seg))) delete sections[v.troncon]; else sections[v.troncon] = r.section;
  etat.scenario = historique.faire({ ...etat.scenario, sections });
  apresChangement();
  if (r.decoupee) toast(t('outil.decoupee', { n: r.decoupee }));
  window.__jeu?.log('outil-pose', { outil, troncon: v.troncon, decalage: Math.round(v.decalage * 10) / 10 });
  return r;
}
function peindre(phase, p) {
  if (phase === 'debut') { trait = new Set(); poserOutil(p); } else if (phase === 'glisse' && trait) poserOutil(p); else trait = null;
}
// En 2D : le bouton gauche peint quand un outil est actif (la carte ne se déplace plus qu'au clavier)
const pointCarte = e => { const r = carte.getCanvas().getBoundingClientRect(); return wgs84VersLambert(carte.unproject([e.clientX - r.left, e.clientY - r.top]).toArray()); };
carte.getCanvas().addEventListener('pointerdown', e => { if (outil && e.button === 0 && !e.shiftKey) peindre('debut', pointCarte(e)); });
carte.getCanvas().addEventListener('pointermove', e => {
  if (outil && trait && e.buttons & 1) peindre('glisse', pointCarte(e));
  if (outil && !(e.buttons & 1)) { const r = carte.getCanvas().getBoundingClientRect(); majSurvol(pointCarte(e), e.clientX - r.left, e.clientY - r.top); }
});
carte.getCanvas().addEventListener('pointerleave', () => majSurvol(null));
window.addEventListener('pointerup', () => { if (trait) peindre('fin'); });

// ─── Survol (v0.8) : la voie sous l'outil est surlignée, une étiquette dit ce que fera le clic ──
let survol = null; // { anneau (Lambert 72), texte }
function majSurvol(p, x, y) {
  const etiquette = $('survol');
  if (!p || !outil) { survol = null; etiquette.hidden = true; return; }
  const v = voieSous(p);
  const sec = v ? sectionDe(v.troncon) : null;
  let texte;
  if (!v) { survol = null; texte = t('survol.rien'); }
  else if (!sec) { survol = null; texte = t('survol.non-mesuree'); }
  else {
    const i = bandeAuDecalage(sec, v.decalage);
    if (i === null) { survol = null; texte = t('survol.rien'); }
    else {
      // L'aperçu est le résultat exact du clic : l'outil est essayé sur une copie, la bande qui changera est surlignée
      const b = sec.bandes[i];
      const r = appliquerOutil(sec, v.decalage, outil, { sensSource: segments.get(v.troncon).sourceAttributes?.oneway ?? null });
      const nom = x => `${t(`bande.${x.type}`)}${x.sens ? ` ${t(`sens.${x.sens}.signe`)}` : ''}`;
      const avant = b.type === 'chaussee' ? t('survol.chaussee') : nom(b);
      const d = r.section && outil !== 'supprimer' ? decalages(r.section)[r.indice] : decalages(sec)[i];
      survol = { anneau: contourBande(ligneDe(v.troncon), d.gauche, d.droite) };
      if (r.refus) texte = t(`refus.${r.refus}`, r.valeurs);
      else if (outil === 'supprimer') texte = t('survol.retirer', { avant });
      else if (r.decoupee) texte = t('survol.decoupe', { n: r.decoupee, apres: nom(r.section.bandes[r.indice]) });
      else texte = t('survol.devient', { avant, apres: nom(r.section.bandes[r.indice]) });
    }
  }
  etiquette.textContent = texte;
  etiquette.hidden = false;
  etiquette.style.left = `${x + 16}px`;
  etiquette.style.top = `${y + 16}px`;
}
/** Ce que la vue surligne pour le joueur : la voie sous l'outil, la voie que la mission guidée désigne. */
function marquesMission() {
  const out = [];
  if (survol) out.push({ anneau: survol.anneau, couleur: PALETTE.selection });
  const c = cibleGuidee();
  if (c) out.push({ anneau: c, couleur: PALETTE.encre, tirets: true });
  return out;
}

// ─── Flèches de direction au sol (v0.7) : sur le carrefour choisi ─────────
let fleches = [], noeudFleches = null, scenarioFleches = null;
const LONG = 3.2, TETE = 1.2, DEMI_TETE = 0.6, DEMI_TIGE = 0.18, RECUL_FLECHE = 4.5; // m (dessin)
function construireFleches(id) {
  const c = etatCarrefour(id);
  if (c.branches.length < 2) return [];
  const geo = geometrieCarrefour(c.branches, c.raccords, [], DESSIN_CARREFOUR);
  const feux = c.carrefour?.regulation === 'feux' ? phasesDe(c.branches, c.carrefour) : null;
  const out = [];
  for (const v of c.voies.values()) {
    if (!v.entrante) continue;
    const a = geo.ancres.get(v.id);
    if (!a) continue;
    const cap0 = Math.atan2(a.direction[1], a.direction[0]); // sens de marche, vers le nœud
    const base = [a.point[0] - a.direction[0] * RECUL_FLECHE, a.point[1] - a.direction[1] * RECUL_FLECHE];
    for (const d of directionsDe(c.branches, c.raccords, v.id)) {
      const cap = cap0 + Math.max(-1.2, Math.min(1.2, d.virage * 0.8));
      const u = [Math.cos(cap), Math.sin(cap)], n = [-u[1], u[0]];
      const P = (l, w) => [base[0] + u[0] * l + n[0] * w, base[1] + u[1] * l + n[1] * w];
      out.push({
        noeud: id, voie: v.id, troncon: d.troncon, direction: d.direction, actif: d.actif, mouvement: `${v.troncon}>${d.troncon}`,
        pointe: P(LONG, 0), milieu: P(LONG / 2, 0), barre: [P(-0.4, DEMI_TETE * 1.2), P(-0.4, -DEMI_TETE * 1.2)],
        anneau: [P(0, DEMI_TIGE), P(LONG - TETE, DEMI_TIGE), P(LONG - TETE, DEMI_TETE), P(LONG, 0), P(LONG - TETE, -DEMI_TETE), P(LONG - TETE, -DEMI_TIGE), P(0, -DEMI_TIGE)],
      });
    }
  }
  return out.map(f => ({ ...f, feux }));
}
// Recalculées quand le carrefour ou le scénario change ; leur teinte suit le feu à chaque image
function majFleches() {
  const id = etat && etat.couches.sections !== false ? editeCarrefour ?? (estNoeud(etat.selection) ? etat.selection : null) : null;
  // Le scénario est un nouvel objet à chaque modification (historique.faire) : il suffit de comparer
  if (etat?.scenario !== scenarioFleches || id !== noeudFleches) { scenarioFleches = etat?.scenario; noeudFleches = id; fleches = id && lignesRues ? construireFleches(id) : []; }
  const temps = trafic?.temps ?? 0;
  for (const f of fleches) {
    f.couleur = !f.actif ? PALETTE.bord : f.feux ? (auVert(f.feux, temps, f.mouvement) ? PALETTE.cyclable : PALETTE.selection) : PALETTE.encre;
  }
}
/** Un clic (point de la vue, en pixels) sur une flèche allume ou éteint sa direction. → vrai si une flèche a été touchée. */
function cliquerFleche(x, y) {
  if (!fleches.length) return false;
  const ecranDe = p => (mode === '3d' && scene ? (q => [q.x, q.y])(scene.versEcran(repere.versLocal(p))) : versEcran2d?.(p) ?? [Infinity, Infinity]);
  let meilleur = null, dMin = R.selection.toleranceFlechePx;
  for (const f of fleches) {
    for (const p of [f.pointe, f.milieu]) { const [X, Y] = ecranDe(p); const d = Math.hypot(X - x, Y - y); if (d < dMin) { dMin = d; meilleur = f; } }
  }
  if (!meilleur) return false;
  const r = opererSurNoeud(meilleur.noeud, 'basculerDirection', [meilleur.voie, meilleur.troncon]);
  if (r?.refus) toast(t(`refus.${r.refus}`, { ...r.valeurs, de: r.valeurs?.de ? t(`mode.${r.valeurs.de}`) : undefined }));
  else if (editeCarrefour) editeurCarrefour.afficher(infoCarrefour(editeCarrefour));
  scenarioFleches = null;
  return true;
}

// ─── Mode expert (v0.8) : l'écran de jeu est épuré par défaut ─────────────
function appliquerExpert() {
  $('ecran').classList.toggle('mode-jeu', !prefs.expert);
  $('bascule-expert').setAttribute('aria-pressed', String(!!prefs.expert));
  $('bascule-expert').title = t(prefs.expert ? 'expert.titre-quitter' : 'expert.titre');
  carte.resize();
}
function basculerExpert() { prefs.expert = !prefs.expert; store.save('prefs', prefs); appliquerExpert(); window.__jeu?.log('expert', { expert: prefs.expert }); }
$('bascule-expert').onclick = basculerExpert;
$('hud-vue').onclick = () => definirMode(mode === '3d' ? '2d' : '3d');
appliquerExpert();

// ─── Missions (v0.8) : des lieux réels, jugés sur le trafic simulé ────────
// La progression vit à part de la partie (clé « progression ») : une nouvelle partie ne la perd pas.
const progression = { ...progressionVide(), departs: [], ...store.load('progression') };
// Mode debug : &mission=0 coupe les missions (les critères des versions 0.1 à 0.7 visent la carte, la vue ne doit pas voler)
const SANS_MISSION = DEBUG && new URLSearchParams(location.search).get('mission') === '0';
if (SANS_MISSION) progression.enCours = null;
let suiviM = null, secondeM = -1;
const sauverProgression = () => store.save('progression', progression);
const missionCourante = () => (progression.enCours ? mission(progression.enCours) : null);
const etapeCourante = () => missionCourante()?.etapes?.[progression.etape] ?? null;
/** Le point du lieu d'une mission (Lambert 72) : le milieu du tronçon, sinon le nœud. */
function pointDuLieu(m) {
  const l = m.lieu.troncon ? ligneDe(m.lieu.troncon) : null;
  if (l) return pointSurLigne(l, l.reduce((a, p, i) => a + (i ? Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0) / 2).p;
  return m.lieu.noeud ? noeuds.get(m.lieu.noeud)?.positionLambert72 ?? null : null;
}
let volEnAttente = false; // le lieu d'une mission sur un tronçon attend la lecture des axes
function allerAuLieu(m = missionCourante()) {
  const p = m && pointDuLieu(m);
  volEnAttente = !!m && !p;
  if (!p) return;
  if (mode === '3d' && scene) scene.definirEtat({ cible: repere.versLocal(p), distance: R.mission.distanceM, inclinaison: rad(R.mission.inclinaisonDegres) }, { anime: true });
  else carte.flyTo({ center: lambertVersWgs84(p), zoom: m.lieu.zoom, duration: duree() });
  if (m.lieu.noeud && !m.guidee) selectionner(m.lieu.noeud); // les flèches au sol du carrefour visé
}
/** Commence (ou recommence) une mission : sa situation de départ entre dans le scénario (Ctrl+Z la défait). */
function demarrerMission(id, { recommencer = false } = {}) {
  if (SANS_MISSION) return;
  const m = mission(id);
  progression.enCours = m ? id : null;
  progression.etape = 0;
  if (m?.depart && (recommencer || !progression.departs.includes(id))) {
    etat.scenario = historique.faire({ ...etat.scenario, carrefours: { ...etat.scenario.carrefours, ...m.depart.carrefours } });
    apresChangement();
    progression.departs = [...new Set([...progression.departs, id])];
  }
  sauverProgression();
  suiviM = trafic ? suivi(trafic.temps) : null;
  if (m) allerAuLieu(m);
  majMission();
  window.__jeu?.log('mission', { id, recommencer });
}
function avancerEtape() {
  progression.etape++;
  sauverProgression();
  const e = etapeCourante();
  // L'étape d'attente accélère le temps : le résultat se voit en quelques secondes
  if (e?.vitesse) { rangVitesse = Math.max(0, SIMULATION.vitesses.indexOf(e.vitesse)); boucle.setTimeScale(SIMULATION.vitesses[rangVitesse]); if (pauseJoueur) basculerPause(); }
  majMission();
}
/** Une fois par image : les étapes guidées ; une fois par seconde simulée : l'objectif. */
function suivreMission() {
  const m = missionCourante();
  if (!m || !trafic) return;
  suiviM ??= suivi(trafic.temps);
  const e = etapeCourante();
  if (e) {
    const fini = e.fin === 'outil-cyclable' ? outil === 'cyclable'
      : e.fin === 'piste-posee' ? (sectionDe(m.objectif.troncon)?.bandes ?? []).some(b => b.type === 'cyclable')
        : e.fin === 'objectif' ? suiviM.reussie : false;
    if (fini) avancerEtape();
  }
  const sec = Math.floor(trafic.temps);
  if (sec === secondeM || suiviM.reussie) return;
  secondeM = sec;
  const avant = suiviM.reussie;
  suiviM = evaluer(m, suiviM, { temps: trafic.temps, trafic });
  if (suiviM.reussie && !avant) {
    progression.reussies = [...new Set([...progression.reussies, m.id])];
    sauverProgression();
    toast(t('mission.reussie-toast', { titre: t(`mission.${m.id}.titre`) }));
    window.__jeu?.log('mission-reussie', { id: m.id });
  }
  majMission();
}
/** La voie que la mission guidée désigne (étape « poser ») : la chaussée de son tronçon. */
function cibleGuidee() {
  const m = missionCourante(), e = etapeCourante();
  if (!m?.guidee || !['regarder', 'outil', 'poser'].includes(e?.id)) return null;
  const sec = sectionDe(m.objectif.troncon), l = ligneDe(m.objectif.troncon);
  const d = sec && l ? decalages(sec).find(b => b.type === 'chaussee' || b.type === 'voiture') : null;
  return d ? contourBande(l, d.gauche, d.droite) : null;
}
function majMission() {
  const boite = $('mission');
  for (const b of document.querySelectorAll('#barre-outils .outil')) b.classList.remove('conseille', 'guide');
  const m = missionCourante();
  if (!etat || !$('titre').hidden || SANS_MISSION) { boite.replaceChildren(); return; }
  if (!m) {
    boite.className = 'mission';
    boite.replaceChildren(el('h2', { textContent: t('mission.libre.titre') }), el('p', { textContent: t('mission.libre.texte') }), listeMissions(),
      el('div', { className: 'mission-boutons' }, bouton('mission.rejouer', () => demarrerMission(MISSIONS[0].id, { recommencer: true }))));
    return;
  }
  const e = etapeCourante(), s = suiviM, n = MISSIONS.indexOf(m) + 1;
  for (const o of m.outils ?? []) {
    const b = document.querySelector(`#barre-outils [data-outil="${o}"]`);
    b?.classList.add('conseille');
    if (e?.id === 'outil') b?.classList.add('guide');
  }
  const o = m.objectif;
  const jauge = [];
  if (s && s.valeur !== null && s.valeur !== undefined) {
    const part = o.tenirS ? Math.min(1, s.tenuS / o.tenirS) : Math.min(1, s.valeur / Math.max(1, s.cible));
    jauge.push(el('p', { className: 'mission-valeur', textContent: t(`mission.mesure.${o.type}`, { v: s.valeur, c: s.cible }) }));
    if (o.tenirS) jauge.push(el('p', { textContent: s.ok ? t('mission.tenu', { s: Math.floor(s.tenuS), c: o.tenirS }) : t('mission.pas-encore') }));
    const j = el('div', { className: 'mission-jauge', role: 'progressbar' }, el('span', { style: `width: ${Math.round(part * 100)}%` }));
    j.setAttribute('aria-valuenow', String(Math.round(part * 100))); j.setAttribute('aria-valuemin', '0'); j.setAttribute('aria-valuemax', '100');
    jauge.push(j);
  }
  if (pauseJoueur && !s?.reussie) jauge.push(el('p', { textContent: t('mission.en-pause') }));
  const prochaine = suivante(m.id);
  const boutons = s?.reussie
    ? [prochaine ? bouton('mission.suivante', () => demarrerMission(prochaine.id)) : bouton('mission.fin', () => demarrerMission(null))]
    : [...(e?.fin === 'compris' ? [bouton('mission.compris', avancerEtape)] : []), bouton('mission.voir', () => allerAuLieu(m)), bouton('mission.recommencer', () => demarrerMission(m.id, { recommencer: true }))];
  boite.className = `mission${s?.reussie ? ' reussie' : ''}`;
  boite.replaceChildren(
    el('p', { className: 'mission-num', textContent: t('mission.numero', { n, total: MISSIONS.length }) }),
    el('h2', { textContent: t(`mission.${m.id}.titre`) }),
    el('p', { textContent: s?.reussie ? t('mission.bravo', { texte: t(`mission.${m.id}.bravo`) }) : t(`mission.${m.id}.intro`) }),
    ...(!s?.reussie && e ? [el('p', { className: 'mission-etape', textContent: t(`mission.${m.id}.etape.${e.id}`) })] : []),
    ...(!s?.reussie && !e && !m.guidee ? [el('p', { className: 'mission-etape', textContent: t(`mission.${m.id}.indice`) })] : []),
    ...jauge,
    el('div', { className: 'mission-boutons' }, ...boutons),
    listeMissions(),
  );
}
const bouton = (cle, onclick) => el('button', { type: 'button', className: 'bouton', textContent: t(cle), onclick });
function listeMissions() {
  return el('ol', { className: 'mission-liste' }, ...MISSIONS.map((x, i) => el('li', {
    className: `${progression.reussies.includes(x.id) ? 'faite' : ''}${x.id === progression.enCours ? ' courante' : ''}`,
    textContent: `${i + 1}. ${t(`mission.${x.id}.titre`)}`,
  })));
}

// ─── Réglages ──────────────────────────────────────────────────────────────
$('langue').value = i18n.lang;
$('langue').onchange = e => {
  prefs.langue = e.target.value;
  store.save('prefs', prefs);
  i18n.setLang(prefs.langue);
  majStatut();
  editeur.langue(t, i18n.lang);
  editeurCarrefour.langue(t, i18n.lang);
  editeurFlux.langue(t, i18n.lang);
  construireBarre();
  appliquerExpert();
  majMission();
  if (etat) { construireCouches(); afficherInspecteur(objetChoisi()); majBascule(); if (edite) editeur.afficher(sectionDe(edite), infoEditeur(edite)); if (editeCarrefour) editeurCarrefour.afficher(infoCarrefour(editeCarrefour)); if (editeFlux) editeurFlux.afficher(infoFlux(editeFlux)); majCarrefours(); }
};
$('exporter').onclick = () => { sauvegarder(); downloadJSON(store.exportAll(), `${JEU}-sauvegarde.json`); };
$('importer').onclick = async () => {
  try {
    const n = store.importAll(await pickJSONFile());
    toast(t('toast.importe', { n }));
    setTimeout(() => location.reload(), 800);
  } catch (e) { toast(e.message); }
};
loadVersion().then(v => { $('version').textContent = v ? `v${v}` : ''; $('entete-version').textContent = v ? `v${v}` : ''; });
loadChangelog().then(entrees => {
  $('changelog').replaceChildren(...entrees.flatMap(e => [
    el('h3', { textContent: `v${e.version} — ${e.date}` }),
    el('ul', {}, ...e.changes.map(c => el('li', { textContent: c }))),
  ]));
});

function boutonCopier(l) {
  const b = el('button', { className: 'copier', type: 'button', textContent: t('inspecteur.copier'), onclick: () => copier(l.valeur) });
  b.setAttribute('aria-label', t('inspecteur.copier-champ', { champ: l.champ }));
  return b;
}

async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    toast(t('toast.copie'));
  } catch {
    // Presse-papiers refusé (contexte non sécurisé, permission) : on le dit, sans rien inventer.
    toast(t('toast.copie-echec'));
  }
}

function toast(texte) {
  const tt = $('toast');
  tt.textContent = texte;
  tt.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { tt.hidden = true; }, 2500);
}

// ─── Clavier (section 8) : tout ce que fait la souris ──────────────────────
const enCarte = () => !!etat && $('titre').hidden && !document.querySelector('dialog[open]');
createKeys({
  actions: {
    recentrer: 'r', troncon: 't', batiment: 'b', noeud: 'n', carrefour: 'c', vue: 'v', aide: 'i', editer: 'm', flux: 'f', pause: ' ', vitesse: 'x', expert: 'o', zoomPlus: ['+', '='], zoomMoins: ['-', '_'],
    ...Object.fromEntries(TOUCHES_COUCHES.map(([c, touche]) => [`couche:${c}`, touche])),
  },
  onAction: nom => {
    // I ouvre l'aide depuis la carte et la ferme quand elle est ouverte (les autres boîtes la laissent fermée)
    if (nom === 'aide') { if ($('dialogue-aide').open || enCarte()) basculerAide(); return; }
    if (!enCarte()) return;
    if (nom === 'recentrer') recentrer();
    else if (nom === 'vue') definirMode(mode === '3d' ? '2d' : '3d');
    else if (nom === 'editer') basculerEditeur();
    else if (nom === 'flux') basculerFlux();
    else if (nom === 'pause') basculerPause();
    else if (nom === 'vitesse') changerVitesse();
    else if (nom === 'expert') basculerExpert();
    else if (nom === 'batiment') choisirBatimentProche();
    else if (nom === 'noeud') selectionner(noeudPlusProche());
    else if (nom === 'carrefour') basculerCarrefour();
    else if (nom === 'troncon') selectionner(mode === '3d' ? scene?.tronconAuCentre() ?? null : tronconPlusProche(carte.project(carte.getCenter())));
    else if (mode === '3d') { if (nom === 'zoomPlus') scene?.zoomer(1 / R.scene.facteurZoom); else if (nom === 'zoomMoins') scene?.zoomer(R.scene.facteurZoom); }
    else if (nom === 'zoomPlus') carte.zoomIn({ duration: duree() });
    else if (nom === 'zoomMoins') carte.zoomOut({ duration: duree() });
    else if (nom.startsWith('couche:')) basculerCouche(nom.slice(7));
  },
});
// Échap : hors de keys.js, qui l'annulerait aussi quand une boîte de dialogue
// est ouverte (le <dialog> ne se fermerait plus au clavier).
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.repeat || !enCarte()) return;
  e.preventDefault();
  if (outil) choisirOutil(null); else if (edite) fermerEditeur(); else if (editeCarrefour) fermerCarrefour(); else if (editeFlux) fermerFlux(); else if (etat.selection) selectionner(null); else { $('dialogue-pause').showModal(); majBoucle(); }
});
// Annuler / rétablir : Ctrl+Z, Ctrl+Y ou Ctrl+Maj+Z (Cmd sur Mac) ; dans un champ, le champ garde son propre annuler
window.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || !enCarte() || e.target.closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); annuler(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); retablir(); }
});
// Déplacement : touche physique (ZQSD en AZERTY, WASD en QWERTY, flèches), répétition admise
const PAN = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
window.addEventListener('keydown', e => {
  const d = PAN[e.code];
  if (!d || !enCarte() || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, select, textarea, .editeur-limite')) return;
  e.preventDefault();
  if (mode === '3d') scene?.deplacerPx(-d[0] * R.carte.pasDeplacementPx, -d[1] * R.carte.pasDeplacementPx); // la vue avance : le sol recule
  else carte.panBy([d[0] * R.carte.pasDeplacementPx, d[1] * R.carte.pasDeplacementPx], { duration: reduit ? 0 : 150 });
});
// Vue 3D : tourner (touches physiques Q et E : A et E en AZERTY) et incliner (Page préc. / suiv.)
const ORBITE = { KeyQ: [-1, 0], KeyE: [1, 0], PageUp: [0, -1], PageDown: [0, 1] };
window.addEventListener('keydown', e => {
  const d = ORBITE[e.code];
  if (!d || mode !== '3d' || !scene || !enCarte() || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, select, textarea')) return;
  e.preventDefault();
  scene.tourner(d[0] * rad(R.scene.pasRotationDegres), d[1] * rad(R.scene.pasInclinaisonDegres));
});
// B : le bâtiment dont le centre de l'emprise est le plus proche du centre de la vue
let centresBatiments = null;
async function choisirBatimentProche() {
  if (!etat.couches.batiments) return;
  try {
    const g = await couche('batiments');
    await chargerBatiments();
    centresBatiments ??= g.features.map(f => {
      const b = boite(f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates.flatMap(p => p[0]));
      return [f.properties.id, ...repere.lonLatVersLocal([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2])];
    });
    if (!enCarte()) return;
    const c = mode === '3d' && scene ? scene.etat().cible : repere.lonLatVersLocal(carte.getCenter().toArray());
    let meilleur = null, dMin = Infinity;
    for (const [id, x, y] of centresBatiments) { const d = Math.hypot(x - c[0], y - c[1]); if (d < dMin) { dMin = d; meilleur = id; } }
    selectionner(meilleur);
  } catch (e) { toast(e.message); }
}
// N : le nœud le plus proche du centre de la vue (positions Lambert de network.json)
function noeudPlusProche() {
  if (mode === '3d' && scene) return scene.noeudAuCentre();
  if (!etat.couches.intersections) return null;
  const c = wgs84VersLambert(carte.getCenter().toArray());
  let meilleur = null, dMin = Infinity;
  for (const n of noeuds.values()) {
    const d = Math.hypot(n.positionLambert72[0] - c[0], n.positionLambert72[1] - c[1]);
    if (d < dMin) { dMin = d; meilleur = n.id; }
  }
  return meilleur;
}
// C : le carrefour de la sélection (un nœud, ou l'extrémité du tronçon choisi la plus proche du centre)
function basculerCarrefour() {
  if (editeCarrefour) return fermerCarrefour();
  const id = etat.selection;
  if (estNoeud(id)) return ouvrirCarrefour(id);
  const s = segments.get(id);
  if (!s) { toast(t('carrefour.choisir')); return; }
  const c = mode === '3d' && scene ? repere.depuisLocal(scene.etat().cible) : wgs84VersLambert(carte.getCenter().toArray());
  const distance = n => Math.hypot(noeuds.get(n).positionLambert72[0] - c[0], noeuds.get(n).positionLambert72[1] - c[1]);
  const bouts = [s.fromNode, s.toNode].filter(n => noeuds.has(n)).sort((a, b) => distance(a) - distance(b));
  if (!bouts.length) { toast(t('carrefour.choisir')); return; }
  ouvrirCarrefour(bouts.find(carrefourModifiable) ?? bouts[0]);
}
// T : le tronçon visible le plus proche du centre (sans tolérance)
function tronconPlusProche(point) {
  const { width, height } = carte.getCanvas().getBoundingClientRect();
  const visibles = carte.queryRenderedFeatures([[0, 0], [width, height]], { layers: COUCHES_SELECTIONNABLES.filter(l => carte.getLayoutProperty(l, 'visibility') !== 'none') });
  let meilleur = null, dMin = Infinity;
  for (const f of visibles) {
    const l = f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat();
    for (let i = 1; i < l.length; i++) {
      const d = distanceEcran(point, carte.project(l[i - 1]), carte.project(l[i]));
      if (d < dMin) { dMin = d; meilleur = f.properties.id; }
    }
  }
  return meilleur;
}

autosave(sauvegarder, { everyMs: 10000 });

// ─── Mise à jour automatique : la vue est sauvegardée avant (section 4) ────
startUpdateCheck({ isBusy: () => enCarte() && !pauseJoueur, beforeReload: sauvegarder, onUpdated: v => toast(t('toast.maj', { v })) });

// ─── Mode debug (section 18) : chargé seulement avec ?debug=1 ──────────────
if (DEBUG) {
  const { installDebug } = await import('./lib/debug.js?v=0.9.4');
  const stations = Object.fromEntries((await couche('infra')).features
    .filter(f => f.properties.famille === 'station').map(f => [f.properties.nom.toLowerCase(), { x: f.geometry.coordinates[0], y: f.geometry.coordinates[1] }]));
  installDebug({
    state: () => ({
      enCarte: enCarte(), selection: etat?.selection ?? null, edite, bandeChoisie: editeur.bandeChoisie, zoom: carte.getZoom(),
      editeCarrefour, voieChoisie: editeurCarrefour.voieChoisie,
      centre: carte.getCenter().toArray(), couches: etat?.couches, inspecteur: $('inspecteur-corps').dataset.segment ?? null,
      mode,
      // Ce que chaque vue met en évidence : doit toujours valoir la sélection
      surbrillance2d: [carte.getFilter('rues-selection')?.[2], carte.getFilter('batiments-selection')?.[2]].find(Boolean)
        ?? (estNoeud(etat?.selection) ? carte.getFilter('noeuds-selection')?.[2]?.[1]?.[0] ?? null : null),
      surbrillance3d: scene ? scene.surbrillance() : undefined,
      // Caméra 3D : état orbital (cible locale en m, distance, azimut, inclinaison en rad), cible en [lon, lat], position dans la scène
      camera: scene ? { ...scene.etat(), cibleLonLat: repere.localVersLonLat(scene.etat().cible), position: scene.pose().position, mpp: scene.mpp() } : null,
      scenePreteMs: sceneMs,
    }),
    places: stations,
    teleport: ({ x, y }) => { carte.jumpTo({ center: [x, y], zoom: 17 }); if (mode === '3d') scene?.definirEtat({ cible: repere.lonLatVersLocal([x, y]), distance: distancePourZoom(17, y, hauteurVue(), R.scene.fovDegres) }); },
    reset: () => { store.clear('partie'); etat = null; montrerTitre(); },
    extra: {
      jouer: () => jouer(nouvellePartie()),
      selectionner: id => selectionner(id),
      // Vue 3D : vue('3d') / vue('2d') bascule et rend le temps (ms) de la première ouverture de la scène
      vue: m => definirMode(m),
      // camera({ cible | cibleLonLat, distance, azimut, inclinaison }) : place la caméra 3D et dessine tout de suite
      camera: ({ cibleLonLat, ...e }) => { scene.definirEtat({ ...e, ...(cibleLonLat ? { cible: repere.lonLatVersLocal(cibleLonLat) } : {}) }); scene.dessinerMaintenant(); return scene.etat(); },
      // Le point de la page où la vue 3D dessine une position [lon, lat] à une hauteur donnée (m)
      versEcran3d: (lonlat, hauteur = 0) => {
        const p = scene.versEcran(repere.lonLatVersLocal(lonlat), hauteur), r = scene.canvas.getBoundingClientRect();
        return { x: p.x + r.left, y: p.y + r.top, visible: p.visible };
      },
      // Un point à l'intérieur d'un bâtiment ([lon, lat]) et sa hauteur (null si non renseignée)
      pointSurBatiment: id => { const p = scene.pointSurBatiment(id); return p && { lonLat: repere.localVersLonLat(p.local), hauteur: p.hauteur }; },
      sceneComptes: () => scene?.comptes ?? null,
      batiments: async () => [...(await chargerBatiments()).values()],
      // Pour le critère de validation : le point de l'écran (page) d'une position [lon, lat]
      versEcran: lonlat => {
        const p = carte.project(lonlat), r = carte.getCanvas().getBoundingClientRect();
        return { x: p.x + r.left, y: p.y + r.top };
      },
      allerA: (lonlat, zoom = 18) => new Promise(res => { carte.once('idle', res); carte.jumpTo({ center: lonlat, zoom }); }),
      pret: () => pret.then(() => Math.round(performance.now() - t0)),
      ids: () => [...segments.keys()],
      // Éditeur (v0.3) : les tronçons éditables, ouvrir l'éditeur, appliquer une opération de js/section.js
      editables: () => [...segments.values()].filter(s => s.emprise).map(s => s.id),
      editer: id => ouvrirEditeur(id),
      fermerEditeur: () => fermerEditeur(),
      section: id => sectionDe(id),
      operation: (nom, ...args) => { const r = operer(nom, args); return r?.refus ? { refus: r.refus } : r?.section ?? null; },
      choisirBande: id => editeur.choisir(id),
      annuler: () => annuler(), retablir: () => retablir(),
      scenario: () => JSON.parse(JSON.stringify(etat.scenario)),
      // Ce que dessine chaque vue : { "troncon:bande": { gauche, droite, type } }
      sections2d: () => Object.fromEntries(carte.querySourceFeatures('sections').filter(f => f.properties.gauche !== undefined)
        .map(f => [f.properties.id, { gauche: f.properties.gauche, droite: f.properties.droite, type: f.properties.type }])),
      sections3d: () => scene?.sections() ?? null,
      editeurOuvert: () => edite,
      // Carrefours (v0.4)
      carrefoursModifiables: () => [...noeuds.keys()].filter(carrefourModifiable),
      editerCarrefour: id => ouvrirCarrefour(id),
      fermerCarrefour: () => fermerCarrefour(),
      // L'état d'un carrefour : branches, voies (id, troncon, mode, entrante, sortante, cote, gauche, droite), raccords, alertes, choix
      carrefour: id => {
        const c = etatCarrefour(id);
        return JSON.parse(JSON.stringify({ ...c, voies: [...c.voies.values()], branches: c.branches.map(b => ({ troncon: b.troncon, sortant: b.sortant, angle: b.angle })) }));
      },
      operationCarrefour: (nom, ...args) => { const r = opererCarrefour(nom, args); return r?.refus ? { refus: r.refus } : r ? { ok: true } : null; },
      choisirVoie: id => editeurCarrefour.choisir(id),
      // Ce que chaque vue dessine des raccords du carrefour choisi : { "de>vers": { debut, fin ([lon, lat]), origine } }
      // (la source donnée à MapLibre : querySourceFeatures rend des morceaux découpés par tuile ; dessines : ceux que la carte a tuilés)
      raccords2d: () => ({
        raccords: Object.fromEntries((donneesCarrefours2d?.features ?? []).filter(f => f.properties.genre === 'raccord')
          .map(f => [f.properties.id, { debut: f.geometry.coordinates[0], fin: f.geometry.coordinates.at(-1), origine: f.properties.origine }])),
        dessines: [...new Set(carte.querySourceFeatures('carrefours').filter(f => f.properties.genre === 'raccord').map(f => f.properties.id))],
        traversees: [...new Set(carte.querySourceFeatures('carrefours').filter(f => f.properties.genre === 'traversee').map(f => f.properties.id))],
      }),
      raccords3d: () => scene ? Object.fromEntries(Object.entries(scene.raccords()).map(([k, r]) => [k, { debut: repere.localVersLonLat(r.debut), fin: repere.localVersLonLat(r.fin), origine: r.origine }])) : null,
      // Les points d'attache attendus (la géométrie calculée une fois pour les deux vues), en [lon, lat]
      ancres: id => { const g = geometriesDessinees.find(x => x.noeud === id); return g ? Object.fromEntries([...g.geometrie.ancres].map(([v, a]) => [v, lambertVersWgs84(a.point)])) : null; },
      editeurCarrefourOuvert: () => editeCarrefour,
      // Flux (v0.5) : l'état simulé d'un tronçon, le bandeau, les opérations, ce que dessine la carte
      sim: id => JSON.parse(JSON.stringify(etatSim(id), (k, v) => (v === Infinity ? 'Infinity' : v))),
      conflits: id => conflitsDe(id),
      bilanFlux: () => ({ ...bilanFlux }),
      editerFlux: id => ouvrirFlux(id),
      fermerFlux: () => fermerFlux(),
      fluxOuvert: () => editeFlux,
      operationFlux: (nom, ...args) => { const r = opererFlux(nom, args); return r?.refus ? { refus: r.refus } : r ? { ok: true } : null; },
      flux2d: () => Object.fromEntries((donneesFlux2d?.features ?? []).map(f => [f.properties.id, f.properties.niveau])),
      comptages: () => comptages.parTroncon,
      // Trafic (v0.6) : bilan, mesures d'un tronçon, avancer de n pas, pause, vitesse, blocs dessinés
      trafic: () => (trafic ? { temps: trafic.temps, ...trafic.bilan(), pause: pauseJoueur, enMarche: !boucle.paused, vitesse: SIMULATION.vitesses[rangVitesse] } : null),
      mesuresTrafic: id => trafic?.mesures(id) ?? null,
      avancerTrafic: n => { boucle.tick(n); return trafic.temps; },
      pauseTrafic: oui => { pauseJoueur = oui; majBoucle(); return pauseJoueur; },
      reconstruireTrafic: () => reconstruireTrafic(),
      // Repart de 8 h, en pause : le trafic ne dépend alors que de la graine et du nombre de pas
      // Outils et flèches (v0.7)
      outil: o => { choisirOutil(o ?? null); return outil; },
      poserOutil: lonlat => { trait = new Set(); const r = poserOutil(wgs84VersLambert(lonlat)); trait = null; return r?.refus ? { refus: r.refus } : r ? { ok: true, decoupee: r.decoupee ?? null } : null; },
      voieSous: lonlat => voieSous(wgs84VersLambert(lonlat)),
      fleches: () => { majFleches(); return fleches.map(f => ({ voie: f.voie, troncon: f.troncon, direction: f.direction, actif: f.actif, couleur: f.couleur, pointe: lambertVersWgs84(f.pointe), milieu: lambertVersWgs84(f.milieu) })); },
      etatFeux: id => { const c = etatCarrefour(id); return c.carrefour?.regulation === 'feux' ? etatFeux(phasesDe(c.branches, c.carrefour), trafic?.temps ?? 0) : null; },
      // Missions (v0.8)
      mission: () => ({ ...progression, etapeId: etapeCourante()?.id ?? null, suivi: suiviM && { valeur: suiviM.valeur, cible: suiviM.cible, ok: suiviM.ok, tenuS: suiviM.tenuS, reussie: suiviM.reussie } }),
      demarrerMission: (id, recommencer = false) => demarrerMission(id, { recommencer }),
      expert: oui => { if (!!prefs.expert !== !!oui) basculerExpert(); return prefs.expert; },
      relancerTrafic: () => { pauseJoueur = true; demarrerTrafic(); return trafic.temps; },
      entrees: () => reseauTrafic?.entrees.map(e => ({ troncon: e.troncon, sens: e.sens, hierarchie: e.hierarchie })) ?? [],
      vehicules: () => trafic?.vehicules().map(v => ({ id: v.id, mode: v.mode, chemin: v.chemin.cle, s: v.s, v: v.v })) ?? [],
      blocs3d: () => scene?.blocs() ?? null,
      cheminsTrafic: () => reseauTrafic ? Object.fromEntries([...reseauTrafic.chemins.values()].map(c => [c.cle, { debut: c.points[0], fin: c.points.at(-1), suivants: c.suivants.map(x => x.cle) }])) : null,
    },
  });
}

if (contenu.aPublier) toast(t('toast.atelier', { n: contenu.aPublier }));
// L'écran de chargement couvre tout jusqu'à ce que la carte soit dessinée (section 3)
await pret;
$('chargement').hidden = true;
montrerTitre();
