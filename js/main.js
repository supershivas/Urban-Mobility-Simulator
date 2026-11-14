// Le cycle de vie : écran titre → carte du corridor → menu ; réglages,
// sauvegarde de la vue, mise à jour, debug. La carte lit les données locales
// de data/ (aucun service distant). Le style est dans carte/style.js,
// l'inspecteur dans inspecteur.js (purs, testés).
import * as maplibregl from '../vendor/maplibre-gl/maplibre-gl.mjs?v=0.1.1';
import { createKeys, stopTypeahead } from './lib/keys.js?v=0.1.1';
import { lockBrowserGestures } from './lib/pointer.js?v=0.1.1';
import { createStore, autosave, pickJSONFile } from './lib/save.js?v=0.1.1';
import { createI18n } from './lib/i18n.js?v=0.1.1';
import { startUpdateCheck, loadVersion, loadChangelog, downloadJSON } from './lib/app-update.js?v=0.1.1';
import { PALETTE, ROLES } from './palette.js?v=0.1.1';
import { TEXTES } from './data/textes.js?v=0.1.1';
import { styleCarte, COUCHES, COUCHES_ACTIVES, COUCHES_SELECTIONNABLES } from './carte/style.js?v=0.1.1';
import { lignesInspecteur } from './inspecteur.js?v=0.1.1';
import { chargerContenu } from './design-store.js?v=0.1.1';

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
const lireJSON = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`); return r.json(); };
let reseau, codes, meta, emprise;
try {
  [reseau, codes, meta, emprise] = await Promise.all([
    lireJSON('data/processed/network.json'), lireJSON('data/urbis-codes.json'),
    lireJSON('data/processed/metadata.json'), lireJSON('data/metadata/corridor.geojson'),
  ]);
} catch (e) {
  $('chargement').textContent = t('chargement.erreur', { raison: e.message });
  throw e;
}
const segments = new Map(reseau.streetSegments.map(s => [s.id, s]));
const noeuds = new Map(reseau.intersections.map(n => [n.id, n]));
const rues = new Map(reseau.streets.map(r => [r.id, r]));
const limitesEmprise = emprise.features[0].geometry.coordinates[0].reduce(
  (b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);

function majStatut() {
  $('statut-emprise').textContent = t('statut.emprise', { n: meta.emprise.tamponMetres });
  const anomalies = Object.values(meta.topologie.anomalies).reduce((a, b) => a + b, 0);
  $('statut-donnees').textContent = t('statut.donnees', {
    segments: meta.comptes.streetSegments, noeuds: meta.comptes.intersections, batiments: meta.comptes.buildings, anomalies,
  });
}
majStatut();

// ─── La partie : la vue, la sélection et les couches (sauvegardées) ───────
const nouvellePartie = () => ({ vue: null, selection: null, couches: { ...COUCHES_ACTIVES } });
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
  $('chargement').hidden = true;
  window.__jeu?.log('carte-prete', { ms: Math.round(performance.now() - t0) });
});

// Étiquettes des stations (DOM : pas de glyphes à charger)
lireJSON('data/processed/mobility-infrastructure.geojson').then(infra => {
  for (const f of infra.features.filter(f => f.properties.famille === 'station')) {
    const m = new maplibregl.Marker({ element: el('div', { className: 'etiquette-station', textContent: f.properties.nom }), anchor: 'bottom' })
      .setLngLat(f.geometry.coordinates).addTo(carte);
    m.getElement().dataset.couche = 'stations';
  }
  appliquerCouches();
});

function recentrer() {
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
  if (!etat || !carte.isStyleLoaded()) return;
  for (const [c, ids] of Object.entries(COUCHES)) {
    for (const id of ids) carte.setLayoutProperty(id, 'visibility', etat.couches[c] ? 'visible' : 'none');
  }
  const lisibles = carte.getZoom() >= R.carte.zoomEtiquettes; // en dessous, les étiquettes se chevauchent
  document.querySelectorAll('[data-couche="stations"]').forEach(e => { e.style.display = etat.couches.stations && lisibles ? '' : 'none'; });
}
carte.on('zoomend', appliquerCouches);

// ─── Sélection d'un tronçon ────────────────────────────────────────────────
function selectionner(id, { centrer = false } = {}) {
  const s = id ? segments.get(id) : null;
  etat.selection = s ? s.id : null;
  carte.setFilter('rues-selection', ['==', ['get', 'id'], s ? s.id : '']);
  carte.setFilter('noeuds-selection', ['in', ['get', 'id'], ['literal', s ? [s.fromNode, s.toNode].filter(Boolean) : []]]);
  afficherInspecteur(s);
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
carte.on('click', e => selectionner(tronconPres(e.point)));

function afficherInspecteur(s) {
  $('deselectionner').hidden = !s;
  if (!s) { $('inspecteur-corps').replaceChildren(el('p', { className: 'vide', textContent: t('inspecteur.vide') })); return; }
  const sections = lignesInspecteur(s, { t, lang: i18n.lang, codes, noeuds, rues });
  const nom = [s.nom.fr, s.nom.nl].filter(Boolean)[0];
  $('inspecteur-corps').replaceChildren(
    el('p', { className: `nom-troncon${nom ? '' : ' inconnu'}`, textContent: nom ?? t('valeur.inconnu') }),
    ...sections.flatMap(sec => [
      el('h3', { textContent: sec.titre }),
      el('dl', {}, ...sec.lignes.flatMap(l => [
        el('dt', { textContent: l.champ }),
        el('dd', { className: l.inconnu ? 'inconnu' : '' }, l.valeur, ...(l.source ? [el('small', { textContent: l.source })] : [])),
      ])),
    ]),
  );
  $('inspecteur-corps').dataset.segment = s.id;
}

// ─── Écrans ────────────────────────────────────────────────────────────────
function montrerTitre() {
  // Désactivés dans le HTML tant que les données ne sont pas chargées : un clic
  // trop tôt ne faisait rien (vu en ligne, ~2 Mo de network.json).
  $('continuer').disabled = false;
  $('nouvelle').disabled = false;
  $('titre').hidden = false;
  $('continuer').hidden = !store.has('partie');
  ($('continuer').hidden ? $('nouvelle') : $('continuer')).focus();
}
async function jouer(partie) {
  etat = partie;
  $('titre').hidden = true;
  construireCouches();
  if (!carte.isStyleLoaded()) await new Promise(res => carte.once('load', res));
  appliquerCouches();
  if (etat.vue) carte.jumpTo({ center: etat.vue.centre, zoom: etat.vue.zoom });
  else recentrer();
  selectionner(etat.selection);
}
function sauvegarder() {
  if (!etat) return;
  const c = carte.getCenter();
  etat.vue = { centre: [c.lng, c.lat], zoom: carte.getZoom() };
  store.save('partie', etat);
}
carte.on('moveend', () => { if (etat && $('titre').hidden) sauvegarder(); });

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
  if (etat) { construireCouches(); afficherInspecteur(etat.selection ? segments.get(etat.selection) : null); }
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
    recentrer: 'r', troncon: 't', zoomPlus: ['+', '='], zoomMoins: ['-', '_'],
    ...Object.fromEntries(TOUCHES_COUCHES.map(([c, touche]) => [`couche:${c}`, touche])),
  },
  onAction: nom => {
    if (!enCarte()) return;
    if (nom === 'recentrer') recentrer();
    else if (nom === 'troncon') { const c = carte.project(carte.getCenter()); selectionner(tronconPlusProche(c)); }
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
  carte.panBy([d[0] * R.carte.pasDeplacementPx, d[1] * R.carte.pasDeplacementPx], { duration: reduit ? 0 : 150 });
});
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
  const { installDebug } = await import('./lib/debug.js?v=0.1.1');
  const stations = Object.fromEntries((await lireJSON('data/processed/mobility-infrastructure.geojson')).features
    .filter(f => f.properties.famille === 'station').map(f => [f.properties.nom.toLowerCase(), { x: f.geometry.coordinates[0], y: f.geometry.coordinates[1] }]));
  installDebug({
    state: () => ({
      enCarte: enCarte(), selection: etat?.selection ?? null, zoom: carte.getZoom(),
      centre: carte.getCenter().toArray(), couches: etat?.couches, inspecteur: $('inspecteur-corps').dataset.segment ?? null,
    }),
    places: stations,
    teleport: ({ x, y }) => carte.jumpTo({ center: [x, y], zoom: 17 }),
    reset: () => { store.clear('partie'); etat = null; montrerTitre(); },
    extra: {
      jouer: () => jouer(nouvellePartie()),
      selectionner: id => selectionner(id),
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
montrerTitre();
