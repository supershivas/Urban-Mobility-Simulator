// Le cycle de vie : écran titre → carte du corridor (2D MapLibre ou 3D three.js)
// → menu ; réglages, sauvegarde de la vue, mise à jour, debug. Les deux vues
// lisent les mêmes données locales de data/ (aucun service distant) et partagent
// la sélection et l'inspecteur. Le style est dans carte/style.js, la scène dans
// scene/scene3d.js (chargée à la première bascule), l'inspecteur dans inspecteur.js.
import * as maplibregl from '../vendor/maplibre-gl/maplibre-gl.mjs?v=0.2.0';
import { createKeys, stopTypeahead } from './lib/keys.js?v=0.2.0';
import { lockBrowserGestures } from './lib/pointer.js?v=0.2.0';
import { createStore, autosave, pickJSONFile } from './lib/save.js?v=0.2.0';
import { createI18n } from './lib/i18n.js?v=0.2.0';
import { startUpdateCheck, loadVersion, loadChangelog, downloadJSON } from './lib/app-update.js?v=0.2.0';
import { PALETTE, ROLES } from './palette.js?v=0.2.0';
import { TEXTES } from './data/textes.js?v=0.2.0';
import { COMMANDES_AIDE } from './data/aide.js?v=0.2.0';
import { styleCarte, COUCHES, COUCHES_ACTIVES, COUCHES_SELECTIONNABLES } from './carte/style.js?v=0.2.0';
import { lignesInspecteur, lignesInspecteurBatiment } from './inspecteur.js?v=0.2.0';
import { creerRepere } from './geo/repere.js?v=0.2.0';
import { boite } from './geo/geometrie.js?v=0.2.0';
import { distancePourZoom, zoomPourDistance } from './scene/camera.js?v=0.2.0';
import { lireJSON, couche, couchesScene } from './donnees.js?v=0.2.0';
import { chargerContenu } from './design-store.js?v=0.2.0';

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
    partie: { version: 1 }, // { vue: { centre, zoom, cap }, selection, couches }
    prefs: { version: 1, debugWrites: false, defaults: { langue: (navigator.language || 'fr').startsWith('fr') ? 'fr' : 'en' } },
  },
  secret: ['gh-token'],
});
const prefs = store.load('prefs');
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
let reseau, codes, meta, emprise;
try {
  [reseau, codes, meta, emprise] = await Promise.all([
    lireJSON('data/processed/network.json'), lireJSON('data/urbis-codes.json'),
    lireJSON('data/processed/metadata.json'), lireJSON('data/metadata/corridor.geojson'),
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
  const anomalies = Object.values(meta.topologie.anomalies).reduce((a, b) => a + b, 0);
  $('statut-donnees').textContent = t('statut.donnees', {
    segments: meta.comptes.streetSegments, noeuds: meta.comptes.intersections, batiments: meta.comptes.buildings,
  });
  $('statut-anomalies').textContent = t('statut.anomalies', { anomalies });
  $('statut-anomalies').title = t('statut.rapport');
}
majStatut();

// ─── La partie : la vue, la sélection et les couches (sauvegardées) ───────
// { vue: { centre, zoom }, vue3d: { cible, distance, azimut, inclinaison }, mode: '2d' | '3d', selection, couches }
const nouvellePartie = () => ({ vue: null, vue3d: null, mode: '2d', selection: null, couches: { ...COUCHES_ACTIVES } });
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
carte.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
const pret = new Promise(res => carte.once('idle', res));
pret.then(() => {
  window.__jeu?.log('carte-prete', { ms: Math.round(performance.now() - t0) });
});

// Étiquettes des stations (DOM : pas de glyphes à charger)
couche('infra').then(infra => {
  for (const f of infra.features.filter(f => f.properties.famille === 'station')) {
    const m = new maplibregl.Marker({ element: el('div', { className: 'etiquette-station', textContent: f.properties.nom }), anchor: 'bottom' })
      .setLngLat(f.geometry.coordinates).addTo(carte);
    m.getElement().dataset.couche = 'stations';
  }
  appliquerCouches();
});

function recentrer() {
  if (mode === '3d') { scene?.recentrer(); return; }
  carte.fitBounds(limitesEmprise, { padding: R.carte.margeEmprisePx, duration: duree() });
}

// ─── Couches activables ────────────────────────────────────────────────────
const TOUCHES_COUCHES = Object.keys(COUCHES).map((c, i) => [c, String(i + 1)]);
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
}
carte.on('zoomend', appliquerCouches);

// ─── Sélection d'un tronçon ou d'un bâtiment : une seule, pour les deux vues ─
const estBatiment = id => typeof id === 'string' && id.startsWith('bld-');
let batiments = null; // Map(id → { id, hauteur, solides }), une fois buildings.geojson lu
const chargerBatiments = async () => (batiments ??= new Map((await couche('batiments')).features.map(f => [f.properties.id, f.properties])));
const SURBRILLANCE_BATIMENT = ['batiments-selection', 'batiments-selection-contour'];

// batiment : ses propriétés quand on les a déjà (clic sur la carte), sinon elles sont lues dans buildings.geojson
function selectionner(id, { centrer = false, batiment = null } = {}) {
  const s = id && !estBatiment(id) ? segments.get(id) : null;
  const idBatiment = estBatiment(id) ? id : null;
  const b = idBatiment ? (batiment ?? batiments?.get(id) ?? null) : null;
  etat.selection = s ? s.id : idBatiment;
  carte.setFilter('rues-selection', ['==', ['get', 'id'], s ? s.id : '']);
  carte.setFilter('noeuds-selection', ['in', ['get', 'id'], ['literal', s ? [s.fromNode, s.toNode].filter(Boolean) : []]]);
  for (const l of SURBRILLANCE_BATIMENT) carte.setFilter(l, ['==', ['get', 'id'], idBatiment ?? '']);
  scene?.selectionner(s ? { type: 'troncon', id: s.id, noeuds: [s.fromNode, s.toNode].filter(Boolean) } : idBatiment ? { type: 'batiment', id: idBatiment } : null);
  if (idBatiment && !b) {
    // Sélection restaurée avant la lecture des bâtiments : on les lit, puis on affiche (ou on oublie un identifiant disparu)
    afficherInspecteur(null, t('inspecteur.lecture'));
    chargerBatiments().then(m => { if (etat?.selection === id) selectionner(m.has(id) ? id : null); }, e => toast(e.message));
  } else afficherInspecteur(s ?? (b && { id: idBatiment, hauteur: b.hauteur ?? null, solides: b.solides ?? 0 }));
  if (s && centrer) {
    const n = [s.fromNode, s.toNode].map(x => noeuds.get(x)).filter(Boolean);
    const f = carte.querySourceFeatures('rues', { filter: ['==', ['get', 'id'], s.id] })[0];
    if (f) {
      const c = f.geometry.coordinates;
      carte.easeTo({ center: c[Math.floor(c.length / 2)], duration: duree() });
    } else if (n.length) window.__jeu?.log('centrage-impossible', { id });
  }
  sauvegarder();
  window.__jeu?.log('selection', { id: etat.selection });
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
carte.on('click', e => {
  const troncon = tronconPres(e.point), b = troncon ? null : batimentSous(e.point);
  selectionner(troncon ?? b?.id ?? null, { batiment: b });
});

function afficherInspecteur(s, vide = t('inspecteur.vide')) {
  $('deselectionner').hidden = !s;
  if (!s) { delete $('inspecteur-corps').dataset.segment; $('inspecteur-corps').replaceChildren(el('p', { className: 'vide', textContent: vide })); return; }
  const batiment = estBatiment(s.id);
  const sections = batiment ? lignesInspecteurBatiment(s, { t, lang: i18n.lang, infos: meta.batiments })
    : lignesInspecteur(s, { t, lang: i18n.lang, codes, noeuds, rues });
  const nom = batiment ? t('inspecteur.batiment') : [s.nom.fr, s.nom.nl].filter(Boolean)[0];
  $('inspecteur-corps').replaceChildren(
    el('p', { className: `nom-troncon${nom ? '' : ' inconnu'}`, textContent: nom ?? t('valeur.inconnu') }),
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
const objetChoisi = () => (!etat?.selection ? null : estBatiment(etat.selection) ? batiments?.get(etat.selection) ?? null : segments.get(etat.selection));

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
    const [{ creerScene }, couches] = await Promise.all([import('./scene/scene3d.js?v=0.2.0'), couchesScene(), chargerBatiments()]);
    scene = creerScene({
      conteneur: $('scene'), repere, P: PALETTE, R, donnees: { ...couches, emprise }, mouvementReduit: reduit,
      surChoix: c => { if (enCarte()) selectionner(c?.id ?? null); },
      surRendu: habillerScene,
    });
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
    etiquettes3d[i].style.display = lisibles && p.visible ? '' : 'none';
    etiquettes3d[i].style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) translateY(-12px)`;
  });
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
    const s = objetChoisi();
    scene.selectionner(!s ? null : estBatiment(s.id) ? { type: 'batiment', id: s.id } : { type: 'troncon', id: s.id, noeuds: [s.fromNode, s.toNode].filter(Boolean) });
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
  $('continuer').hidden = !store.has('partie');
  ($('continuer').hidden ? $('nouvelle') : $('continuer')).focus();
}
async function jouer(partie) {
  etat = { ...nouvellePartie(), ...partie };
  // Toujours repartir de la carte : la vue 3D se rouvre ensuite si la partie y était
  mode = '2d'; scene?.activer(false); $('scene').hidden = true; $('carte').inert = false; majBascule();
  $('titre').hidden = true;
  construireCouches();
  if (!carte.isStyleLoaded()) await new Promise(res => carte.once('load', res));
  appliquerCouches();
  if (etat.vue) carte.jumpTo({ center: etat.vue.centre, zoom: etat.vue.zoom });
  else recentrer();
  selectionner(etat.selection);
  if (partie.mode === '3d') await definirMode('3d', { reprise: true });
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
$('ouvrir-menu').onclick = () => $('dialogue-pause').showModal();
$('reprendre').onclick = () => $('dialogue-pause').close();
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

// ─── Réglages ──────────────────────────────────────────────────────────────
$('langue').value = i18n.lang;
$('langue').onchange = e => {
  prefs.langue = e.target.value;
  store.save('prefs', prefs);
  i18n.setLang(prefs.langue);
  majStatut();
  if (etat) { construireCouches(); afficherInspecteur(objetChoisi()); majBascule(); }
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
    recentrer: 'r', troncon: 't', batiment: 'b', vue: 'v', aide: 'i', zoomPlus: ['+', '='], zoomMoins: ['-', '_'],
    ...Object.fromEntries(TOUCHES_COUCHES.map(([c, touche]) => [`couche:${c}`, touche])),
  },
  onAction: nom => {
    // I ouvre l'aide depuis la carte et la ferme quand elle est ouverte (les autres boîtes la laissent fermée)
    if (nom === 'aide') { if ($('dialogue-aide').open || enCarte()) basculerAide(); return; }
    if (!enCarte()) return;
    if (nom === 'recentrer') recentrer();
    else if (nom === 'vue') definirMode(mode === '3d' ? '2d' : '3d');
    else if (nom === 'batiment') choisirBatimentProche();
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
  if (etat.selection) selectionner(null); else $('dialogue-pause').showModal();
});
// Déplacement : touche physique (ZQSD en AZERTY, WASD en QWERTY, flèches), répétition admise
const PAN = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
window.addEventListener('keydown', e => {
  const d = PAN[e.code];
  if (!d || !enCarte() || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, select, textarea')) return;
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
startUpdateCheck({ beforeReload: sauvegarder, onUpdated: v => toast(t('toast.maj', { v })) });

// ─── Mode debug (section 18) : chargé seulement avec ?debug=1 ──────────────
if (DEBUG) {
  const { installDebug } = await import('./lib/debug.js?v=0.2.0');
  const stations = Object.fromEntries((await couche('infra')).features
    .filter(f => f.properties.famille === 'station').map(f => [f.properties.nom.toLowerCase(), { x: f.geometry.coordinates[0], y: f.geometry.coordinates[1] }]));
  installDebug({
    state: () => ({
      enCarte: enCarte(), selection: etat?.selection ?? null, zoom: carte.getZoom(),
      centre: carte.getCenter().toArray(), couches: etat?.couches, inspecteur: $('inspecteur-corps').dataset.segment ?? null,
      mode,
      // Ce que chaque vue met en évidence : doit toujours valoir la sélection
      surbrillance2d: [carte.getFilter('rues-selection')?.[2], carte.getFilter('batiments-selection')?.[2]].find(Boolean) ?? null,
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
    },
  });
}

if (contenu.aPublier) toast(t('toast.atelier', { n: contenu.aPublier }));
// L'écran de chargement couvre tout jusqu'à ce que la carte soit dessinée (section 3)
await pret;
$('chargement').hidden = true;
montrerTitre();
