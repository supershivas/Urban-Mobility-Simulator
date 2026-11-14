// Construit data/processed/ à partir de data/original/ — sans réseau, reproductible.
//
//   node outils/donnees/construire.mjs      (ou npm run donnees)
//
// originalData (data/original, Lambert 72, intouché)
//   → normalizedData (identifiants internes stables, attributs nommés, null si absent)
//   → GeoJSON WGS84 (RFC 7946) pour MapLibre + network.json (le modèle) + rapport de qualité.
// Les calculs métriques (longueurs, topologie, appariement) se font en Lambert 72.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { lambertVersWgs84, wgs84VersLambert, convertirGeometrie, arrondir } from '../../js/geo/coordonnees.js';
import { longueur } from '../../js/geo/geometrie.js';
import { controler } from '../../js/geo/topologie.js';
import { indexer, apparier, HIGHWAY_CHAUSSEE } from '../../js/geo/appariement.js';
import { calculerEmprise } from './emprise.mjs';
import { boite } from '../../js/geo/geometrie.js';
import { hauteurDepuisSolides, METHODE_HAUTEUR } from './urbis3d.mjs';

const O = 'data/original', P = 'data/processed', M = 'data/metadata';
mkdirSync(P, { recursive: true });
mkdirSync(M, { recursive: true });
const lire = f => JSON.parse(readFileSync(f, 'utf8'));
const features = f => lire(`${O}/urbis/${f}.wfs.json`).features;
const corridor = lire('data/corridor.json');
const manifeste = lire(`${O}/manifest.json`);

// Identifiant interne stable : préfixe + numéro de l'identifiant INSPIRE (stable selon Paradigm).
const numero = uri => uri?.split('/').pop() || null; // « …/streetnode/ » (vide dans la source) → null
const idInterne = (prefixe, uri) => `${prefixe}-u${numero(uri)}`;
const vers = (g, dec) => convertirGeometrie(g, p => arrondir(lambertVersWgs84(p), dec));
const nul = v => (v === undefined || v === '' ? null : v);
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ecrire = (nom, objet) => {
  const texte = JSON.stringify(objet);
  writeFileSync(nom, texte);
  return Buffer.byteLength(texte);
};
const collection = feats => ({ type: 'FeatureCollection', features: feats });
const tailles = {};

// ─── Emprise ──────────────────────────────────────────────────────────────
const stations = features('stations');
const emprise = calculerEmprise(corridor, stations);
const empriseGeo = collection([{
  type: 'Feature', id: 'corridor',
  properties: { id: corridor.id, tamponMetres: corridor.tamponMetres, methode: 'Tampon @turf/buffer autour de la polyligne des stations UrbIS (data/corridor.json)' },
  geometry: { type: 'Polygon', coordinates: [emprise.wgs84.map(p => arrondir(p, 7))] },
}]);
ecrire(`${M}/corridor.geojson`, empriseGeo);

// ─── Nœuds ────────────────────────────────────────────────────────────────
const sourcesNoeuds = [...features('noeuds'), ...(existsSync(`${O}/urbis/noeuds-bord.wfs.json`) ? features('noeuds-bord') : [])];
const noeuds = new Map();
const nDansEmprise = features('noeuds').length;
for (const [i, f] of sourcesNoeuds.entries()) {
  const id = idInterne('node', f.properties.INSPIRE_ID);
  if (noeuds.has(id)) continue;
  noeuds.set(id, {
    id,
    sourceIds: { urbis: f.properties.INSPIRE_ID },
    position: f.geometry.coordinates,
    typeCode: nul(f.properties.TYPE),
    niveau: nul(f.properties.LVL),
    connectedSegmentIds: [],
    horsEmprise: i >= nDansEmprise,
  });
}

// ─── Tronçons (axes) ──────────────────────────────────────────────────────
const axes = features('axes');
const segments = axes.map(f => {
  const p = f.properties;
  const id = idInterne('seg', p.INSPIRE_ID);
  const ligne = f.geometry.coordinates;
  return {
    id,
    sourceIds: { urbis: p.INSPIRE_ID, osm: [] },
    streetId: p.STRNAMEFRE || p.STRNAMEDUT ? `street-${slug(`${p.STRNAMEFRE ?? ''} ${p.STRNAMEDUT ?? ''}`)}` : null,
    nom: { fr: nul(p.STRNAMEFRE), nl: nul(p.STRNAMEDUT) },
    fromNode: numero(p.STARTSN_ID) ? idInterne('node', p.STARTSN_ID) : null,
    toNode: numero(p.ENDSN_ID) ? idInterne('node', p.ENDSN_ID) : null,
    ligne,
    lengthMeters: Math.round(longueur(ligne) * 100) / 100,
    longueurSource: nul(p.LENGTH),
    typeCode: nul(p.TYPE),
    hierarchieCode: nul(p.HIERARCHY),
    niveau: nul(p.LVL),
    penteDegres: nul(p.SLOPE),
    sourceAttributes: { oneway: null, lanes: null, speedLimit: null, roadOwner: null, roadManager: null },
    complementOsm: null,
    dataQuality: { geometry: 'source', attributes: 'urbis', confidence: 'unverified' },
    editable: false,
  };
});
for (const s of segments) for (const n of [s.fromNode, s.toNode]) noeuds.get(n)?.connectedSegmentIds.push(s.id);

// ─── Complément OSM : sens, voies, vitesse (appariement géométrique) ─────
let osmInfo = null;
if (existsSync(`${O}/osm/highways.json`)) {
  const osm = lire(`${O}/osm/highways.json`);
  const chemins = osm.chemins
    .filter(c => HIGHWAY_CHAUSSEE.has(c.tags.highway) && c.geometrie.every(Boolean))
    .map(c => ({ id: c.id, tags: c.tags, ligne: c.geometrie.map(p => wgs84VersLambert(p)) }));
  const index = indexer(chemins);
  const bilan = { moyenne: 0, ambigue: 0, aucun: 0 };
  for (const s of segments) {
    if (s.niveau !== 0) { bilan.aucun++; continue; } // tunnels et ponts : OSM les modélise autrement
    const r = apparier(s.ligne, index);
    if (!r) { bilan.aucun++; continue; }
    bilan[r.confiance]++;
    s.sourceIds.osm = r.osmIds;
    s.complementOsm = {
      methode: 'Appariement géométrique : 3 points de l\'axe UrbIS à moins de 7 m d\'un même chemin OSM de chaussée, direction à 25° près.',
      confiance: r.confiance,
      distanceMoyenneMetres: r.distanceMoyenne,
      tags: r.tags,
    };
    s.sourceAttributes.oneway = r.attributs.sens;
    s.sourceAttributes.lanes = r.attributs.voies ?? r.attributs.voiesTexte;
    s.sourceAttributes.speedLimit = r.attributs.vitesseKmh ?? r.attributs.vitesseTexte;
  }
  osmInfo = { extraitLe: osm.extraitLe, chemins: osm.chemins.length, cheminsChaussee: chemins.length, bilan };
}

// ─── Rues : une référence par nom, jamais une fusion de tronçons ─────────
const rues = new Map();
for (const s of segments) {
  if (!s.streetId) continue;
  if (!rues.has(s.streetId)) rues.set(s.streetId, { id: s.streetId, nom: s.nom, sourceIds: { urbis: null, osm: null }, segmentIds: [] });
  rues.get(s.streetId).segmentIds.push(s.id);
}

// ─── Topologie ────────────────────────────────────────────────────────────
const topo = controler(segments, [...noeuds.values()].map(n => ({ id: n.id, position: n.position, niveau: n.niveau })));
const segParId = new Map(segments.map(s => [s.id, s]));
for (const s of segments) s.anomalies = [];
for (const a of topo.anomalies) for (const id of a.ids) {
  const s = segParId.get(id);
  if (s && !s.anomalies.includes(a.type)) s.anomalies.push(a.type);
}

// ─── Sorties GeoJSON WGS84 pour la carte ─────────────────────────────────
tailles.streets = ecrire(`${P}/streets.geojson`, collection(segments.map(s => ({
  type: 'Feature', id: Number(numero(s.sourceIds.urbis)),
  properties: { id: s.id, niveau: s.niveau, type: s.typeCode, hierarchie: s.hierarchieCode, nom: s.nom.fr ?? s.nom.nl },
  geometry: vers({ type: 'LineString', coordinates: s.ligne }, 7),
}))));
tailles.intersections = ecrire(`${P}/intersections.geojson`, collection([...noeuds.values()].map(n => ({
  type: 'Feature',
  properties: { id: n.id, type: n.typeCode, niveau: n.niveau, degre: n.connectedSegmentIds.length },
  geometry: vers({ type: 'Point', coordinates: n.position }, 7),
}))));
tailles.surfaces = ecrire(`${P}/street-surfaces.geojson`, collection(features('surfaces').map(f => ({
  type: 'Feature',
  properties: { id: idInterne('surf', f.properties.INSPIRE_ID), type: nul(f.properties.TYPE), niveau: nul(f.properties.LVL) },
  geometry: vers(f.geometry, 6),
}))));
// Hauteurs : seulement depuis UrbIS 3D, par l'identifiant du bâtiment. Sans solide associé : null.
const urbis3d = existsSync(`${O}/urbis3d/solides.json`) ? lire(`${O}/urbis3d/solides.json`) : null;
const solidesParBatiment = new Map();
for (const [, bat, zmin, zmax] of urbis3d?.solides ?? []) {
  if (!solidesParBatiment.has(bat)) solidesParBatiment.set(bat, []);
  solidesParBatiment.get(bat).push([zmin, zmax]);
}
const batiments = features('batiments').map(f => {
  const h = hauteurDepuisSolides(solidesParBatiment.get(Number(numero(f.properties.INSPIRE_ID))));
  return {
    type: 'Feature',
    properties: { id: idInterne('bld', f.properties.INSPIRE_ID), hauteur: h ? h.hauteur : null, solides: h ? h.solides : 0 },
    geometry: vers(f.geometry, 6),
  };
});
tailles.buildings = ecrire(`${P}/buildings.geojson`, collection(batiments));
const hauteurs = batiments.map(b => b.properties.hauteur).filter(h => h !== null).sort((a, b) => a - b);
const infoHauteurs = {
  source: urbis3d ? 'urbis3d' : null,
  dateSource: urbis3d?.dateTuiles ?? null,
  methode: urbis3d ? METHODE_HAUTEUR : null,
  confiance: urbis3d ? 'mesure photogrammétrique de la source, non vérifiée sur le terrain' : null,
  renseignees: hauteurs.length,
  nonRenseignees: batiments.length - hauteurs.length,
  minMetres: hauteurs[0] ?? null,
  medianeMetres: hauteurs.length ? hauteurs[Math.floor(hauteurs.length / 2)] : null,
  maxMetres: hauteurs.at(-1) ?? null,
};
const infra = [
  ...features('tram').map(f => ({ type: 'Feature', properties: { id: idInterne('rail', f.properties.INSPIRE_ID), famille: 'rail', type: nul(f.properties.TYPE), niveau: nul(f.properties.LVL) }, geometry: vers(f.geometry, 7) })),
  ...features('tunnels').map(f => ({ type: 'Feature', properties: { id: idInterne('tun', f.properties.INSPIRE_ID), famille: 'tunnel', type: nul(f.properties.TYPE), niveau: nul(f.properties.LVL) }, geometry: vers(f.geometry, 6) })),
  ...features('ponts').map(f => ({ type: 'Feature', properties: { id: idInterne('brg', f.properties.INSPIRE_ID), famille: 'pont', type: nul(f.properties.TYPE), niveau: nul(f.properties.LVL) }, geometry: vers(f.geometry, 6) })),
  ...emprise.stations.map(f => ({ type: 'Feature', properties: { id: idInterne('sta', f.properties.INSPIRE_ID), famille: 'station', nom: f.properties.NAMEFRE.replace(/^STATION /, ''), type: 'TS' }, geometry: vers(f.geometry, 7) })),
];
tailles.infrastructure = ecrire(`${P}/mobility-infrastructure.geojson`, collection(infra));

// ─── Le modèle (network.json) : le même pour MapLibre et, plus tard, three.js ─
const reseau = {
  project: {
    id: corridor.id, name: 'Urban Mobility Simulator', workingCrs: 'EPSG:31370', displayCrs: 'EPSG:4326',
    dataSources: ['urbis', ...(osmInfo ? ['osm'] : [])],
  },
  streets: [...rues.values()],
  streetSegments: segments.map(({ ligne, ...s }) => ({ ...s, geometryRef: 'streets.geojson' })),
  intersections: [...noeuds.values()].map(({ position, ...n }) => ({ ...n, positionLambert72: position.map(v => Math.round(v * 100) / 100), intersectionType: null })),
  carriageways: [], roadBoundaries: [], buildings: [], infrastructures: [],
};
tailles.network = ecrire(`${P}/network.json`, reseau);

const anomaliesParType = {};
for (const a of topo.anomalies) (anomaliesParType[a.type] ??= []).push(a);
// Origine du repère local de la scène 3D : le centre de la boîte de l'emprise, en
// Lambert 72, arrondi à 100 m (une convention d'affichage, pas une donnée).
const be = boite(emprise.lambert);
const origineLocale = [Math.round((be[0] + be[2]) / 200) * 100, Math.round((be[1] + be[3]) / 200) * 100];
const metadonnees = {
  construitLe: manifeste.fichiers['data/original/urbis/axes.wfs.json']?.recupereLe ?? null,
  emprise: { tamponMetres: corridor.tamponMetres, stations: emprise.stations.map(f => f.properties.NAMEFRE) },
  repereLocal: { crs: 'EPSG:31370', origine: origineLocale, methode: 'Centre de la boîte de l\'emprise, arrondi à 100 m ; x local = Est − origine, y local = Nord − origine (mètres).' },
  batiments: { prefixeUrbis: 'https://databrussels.be/id/building/', hauteurs: infoHauteurs },
  comptes: {
    streetSegments: segments.length, intersections: noeuds.size, streets: rues.size,
    surfaces: features('surfaces').length, buildings: features('batiments').length, infrastructure: infra.length,
  },
  topologie: { croisementsDenivele: topo.croisementsDenivele, anomalies: Object.fromEntries(Object.entries(anomaliesParType).map(([k, v]) => [k, v.length])) },
  osm: osmInfo,
  octets: tailles,
};
writeFileSync(`${P}/metadata.json`, JSON.stringify(metadonnees, null, 2) + '\n');

// ─── Rapport de qualité ───────────────────────────────────────────────────
const ecarts = segments.filter(s => s.longueurSource !== null && Math.abs(s.longueurSource - s.lengthMeters) > 1);
const compte = (liste, cle) => liste.reduce((m, x) => ((m[x[cle] ?? 'null'] = (m[x[cle] ?? 'null'] || 0) + 1), m), {});
const tableau = obj => Object.entries(obj).map(([k, v]) => `| \`${k}\` | ${v} |`).join('\n');
const champsAbsents = ['sens (oneway)', 'nombre de voies (lanes)', 'vitesse (maxspeed)'].map((nom, i) => {
  const cle = ['oneway', 'lanes', 'speedLimit'][i];
  const n = segments.filter(s => s.sourceAttributes[cle] === null).length;
  return `| ${nom} | ${segments.length - n} | ${n} |`;
}).join('\n');
const rapport = `# Rapport de qualité des données

Produit par \`node outils/donnees/construire.mjs\` à partir de \`data/original/\` (récupéré le ${metadonnees.construitLe ?? 'inconnu'}).
Ne pas modifier à la main : relancer le script.

## Emprise

Tampon de ${corridor.tamponMetres} m autour de la polyligne des stations ${corridor.ligne.map(s => s.replace('STATION ', '')).join(' → ')}, plus ${corridor.ancresSupplementaires.map(s => s.replace('STATION ', '')).join(', ')}.
Les objets qui touchent l'emprise sont gardés entiers (pas de découpe au bord).

## Comptes

| Objet | Nombre |
|---|---|
${tableau(metadonnees.comptes)}

## Attributs des tronçons

| Attribut | Renseigné | Non renseigné |
|---|---|---|
| nom (UrbIS) | ${segments.filter(s => s.nom.fr || s.nom.nl).length} | ${segments.filter(s => !s.nom.fr && !s.nom.nl).length} |
| hiérarchie (UrbIS) | ${segments.filter(s => s.hierarchieCode).length} | ${segments.filter(s => !s.hierarchieCode).length} |
| pente (UrbIS) | ${segments.filter(s => s.penteDegres !== null).length} | ${segments.filter(s => s.penteDegres === null).length} |
${champsAbsents}
| largeur de chaussée | 0 | ${segments.length} |
| gestionnaire (axe) | 0 | ${segments.length} |

## Hauteur des bâtiments

${urbis3d ? `Source : UrbIS – Constructions 3D (tuiles du ${urbis3d.dateTuiles}), ${urbis3d.bilan.solidesRetenus} solides associés par identifiant (\`BU_ID\`) à un bâtiment chargé.
${METHODE_HAUTEUR}

| Bâtiments | Nombre |
|---|---|
| hauteur renseignée | ${infoHauteurs.renseignees} |
| hauteur non renseignée (aucun solide associé) | ${infoHauteurs.nonRenseignees} |

Hauteurs renseignées : de ${infoHauteurs.minMetres} m à ${infoHauteurs.maxMetres} m, médiane ${infoHauteurs.medianeMetres} m. Une hauteur absente reste \`null\` : le bâtiment est dessiné à plat et l'inspecteur affiche « Non renseigné ».
${urbis3d.bilan.solidesSansBatiment} solides des tuiles lues n'ont pas d'identifiant de bâtiment (\`BU_ID\` vide) : ils ne sont rattachés à rien, aucune correspondance géométrique n'est tentée.` : 'Aucune source de hauteur : toutes les hauteurs sont `null`.'}

## Attributs des axes : ce qui manque

UrbIS ne donne ni largeur, ni nombre de voies, ni sens, ni vitesse sur les axes. Sens, voies et vitesse viennent seulement
d'OSM, par appariement géométrique (confiance « moyenne », jamais « vérifiée »). La largeur reste inconnue : les surfaces de
voirie (chaussée, trottoir, terre-plein…) existent dans UrbIS, mais aucune largeur n'en est encore tirée.

Codes hors spécification rencontrés (affichés tels quels, sans libellé inventé) :
hiérarchie ${JSON.stringify(Object.keys(compte(segments, 'hierarchieCode')).filter(k => !['H', 'MER', 'MAR', 'IDR', 'DC', 'DR', 'UN', 'null'].includes(k)))},
type de tunnel ${JSON.stringify([...new Set(features('tunnels').map(f => f.properties.TYPE))].filter(k => !['RAT', 'MT', 'ROT', 'PT'].includes(k)))}.

Répartition par type d'axe :

| Code | Nombre |
|---|---|
${tableau(compte(segments, 'typeCode'))}

Répartition par niveau (LVL) : ${JSON.stringify(compte(segments, 'niveau'))}.

## Complément OpenStreetMap

${osmInfo ? `Extrait le ${osmInfo.extraitLe} : ${osmInfo.chemins} chemins \`highway\`, dont ${osmInfo.cheminsChaussee} de chaussée.
Tronçons appariés : ${osmInfo.bilan.moyenne} (confiance moyenne), ${osmInfo.bilan.ambigue} ambigus (candidats contradictoires : aucun attribut retenu), ${osmInfo.bilan.aucun} sans correspondance (dont tunnels et ponts, non appariés).` : 'Absent.'}

## Contrôles

- Longueur recalculée en Lambert 72 contre l'attribut \`LENGTH\` : ${ecarts.length} écart(s) de plus de 1 m${ecarts.length ? ` (${ecarts.slice(0, 10).map(s => `${s.id} : ${s.longueurSource.toFixed(1)} / ${s.lengthMeters.toFixed(1)} m`).join(' ; ')}${ecarts.length > 10 ? ' ; …' : ''})` : ''}.
- Croisements géométriques entre axes de niveaux différents (ponts, tunnels, normaux) : ${topo.croisementsDenivele}.
- Anomalies :

| Type | Nombre | Exemples |
|---|---|---|
${Object.entries(anomaliesParType).map(([k, v]) => `| ${k} | ${v.length} | ${v.slice(0, 4).map(a => a.ids.join(' / ') + (a.detail ? ` (${a.detail})` : '')).join(' ; ')} |`).join('\n') || '| — | 0 | |'}

Les nœuds hors emprise sont ceux d'axes à cheval sur le bord ; un nœud « isolé » est un nœud chargé dont aucun axe chargé ne part
(normal au bord de l'emprise). Rien n'est corrigé automatiquement.

## Tailles servies au navigateur

| Fichier | Octets |
|---|---|
${tableau(tailles)}
`;
writeFileSync(`${M}/quality-report.md`, rapport);
console.log(JSON.stringify({ comptes: metadonnees.comptes, topologie: metadonnees.topologie, osm: osmInfo?.bilan, tailles }, null, 1));
