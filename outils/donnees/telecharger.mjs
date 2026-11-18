// Télécharge les données sources dans data/original/ (pitch §9 : jamais modifiées ensuite).
// Seule étape du pipeline qui touche le réseau ; le jeu, lui, n'appelle aucun service.
//
//   node outils/donnees/telecharger.mjs            → UrbIS puis OSM
//   node outils/donnees/telecharger.mjs urbis      → UrbIS seulement
//   node outils/donnees/telecharger.mjs osm        → OSM seulement (après UrbIS : l'emprise en dépend)
//   node outils/donnees/telecharger.mjs urbis3d    → hauteurs des bâtiments (après UrbIS : identifiants des bâtiments)
//   node outils/donnees/telecharger.mjs velos      → compteurs vélo de Bruxelles Mobilité (v0.5)
//
// Chaque fichier est consigné dans data/original/manifest.json (URL, date, nombre d'objets, empreinte).
// Ensuite : node outils/donnees/construire.mjs (sans réseau, reproductible).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { calculerEmprise } from './emprise.mjs';
import { boite, pointDansAnneau } from '../../js/geo/geometrie.js';
import { solidesDeLaTuile } from './urbis3d.mjs';

const WFS = 'https://geoservices-urbis.irisnet.be/geoserver/urbisvector/ows';
const OSM_API = 'https://api.openstreetmap.org/api/0.6/map';
const AGENT = 'urban-mobility-simulator-data-script/0.1';
const MANIFESTE = 'data/original/manifest.json';
const corridor = JSON.parse(readFileSync('data/corridor.json', 'utf8'));
const quoi = process.argv[2] || 'tout';

const manifeste = existsSync(MANIFESTE) ? JSON.parse(readFileSync(MANIFESTE, 'utf8')) : { fichiers: {} };
function consigner(chemin, info, contenu) {
  manifeste.fichiers[chemin] = {
    ...info,
    recupereLe: new Date().toISOString(),
    sha256: createHash('sha256').update(contenu).digest('hex'),
    octets: Buffer.byteLength(contenu),
  };
  writeFileSync(MANIFESTE, JSON.stringify(manifeste, null, 2) + '\n');
}

async function lire(url, essais = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': AGENT } });
      if (!r.ok) throw new Error(`HTTP ${r.status} pour ${url.slice(0, 160)}`);
      return await r.text();
    } catch (e) {
      if (i >= essais) throw e;
      await new Promise(res => setTimeout(res, 1000 * 2 ** i));
    }
  }
}

// ─── UrbIS (Paradigm) ─────────────────────────────────────────────────────
async function wfs(couche, cql) {
  const p = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeNames: `urbisvector:${couche}`, outputFormat: 'application/json',
  });
  if (cql) p.set('CQL_FILTER', cql);
  const url = `${WFS}?${p}`;
  const texte = await lire(url);
  const json = JSON.parse(texte);
  if (json.numberMatched !== undefined && json.numberReturned !== undefined && json.numberMatched !== json.numberReturned) {
    throw new Error(`${couche} : ${json.numberReturned} objets rendus sur ${json.numberMatched} (pagination à ajouter)`);
  }
  return { url, texte, n: json.features.length };
}

async function urbis() {
  mkdirSync('data/original/urbis', { recursive: true });
  // 1. Les stations de métro (ancres du corridor)
  const st = await wfs('PointsOfInterest', "TYPE='TS'");
  writeFileSync('data/original/urbis/stations.wfs.json', st.texte);
  consigner('data/original/urbis/stations.wfs.json', { source: 'urbis', couche: 'PointsOfInterest', filtre: "TYPE='TS'", url: st.url, objets: st.n, crs: 'EPSG:31370' }, st.texte);

  // 2. L'emprise, puis toutes les couches qui la touchent (objets entiers, jamais découpés)
  const emprise = calculerEmprise(corridor, JSON.parse(st.texte).features);
  const wkt = `POLYGON((${emprise.lambert.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(', ')}))`;
  const couches = {
    StreetAxes: 'axes', StreetNodes: 'noeuds', StreetSurfaces: 'surfaces', Buildings: 'batiments',
    Bridges: 'ponts', Tunnels: 'tunnels', TramNetwork: 'tram',
  };
  // StreetAxes_Underground et StreetNodes_Underground ne sont pas téléchargées : en WFS,
  // elles rendent exactement les mêmes objets que StreetAxes et StreetNodes (vérifié le
  // 2026-11-14) ; le niveau LVL distingue déjà ce qui passe en tunnel (-1) ou en pont (+1).
  for (const [couche, nom] of Object.entries(couches)) {
    const r = await wfs(couche, `INTERSECTS(GEOM, ${wkt})`);
    const chemin = `data/original/urbis/${nom}.wfs.json`;
    writeFileSync(chemin, r.texte);
    consigner(chemin, { source: 'urbis', couche, filtre: 'INTERSECTS(GEOM, emprise du corridor)', url: WFS, objets: r.n, crs: 'EPSG:31370' }, r.texte);
    console.log(`UrbIS ${couche} : ${r.n} objets`);
  }

  // 3. Les nœuds cités par un axe mais situés hors de l'emprise (axe à cheval sur le bord)
  const axes = JSON.parse(readFileSync('data/original/urbis/axes.wfs.json', 'utf8')).features;
  const noeuds = new Set(JSON.parse(readFileSync('data/original/urbis/noeuds.wfs.json', 'utf8')).features.map(f => f.properties.INSPIRE_ID));
  const manquants = [...new Set(axes.flatMap(a => [a.properties.STARTSN_ID, a.properties.ENDSN_ID]))].filter(id => id && !noeuds.has(id));
  if (manquants.length) {
    const r = await wfs('StreetNodes', `INSPIRE_ID IN (${manquants.map(id => `'${id}'`).join(',')})`);
    writeFileSync('data/original/urbis/noeuds-bord.wfs.json', r.texte);
    consigner('data/original/urbis/noeuds-bord.wfs.json', { source: 'urbis', couche: 'StreetNodes', filtre: 'INSPIRE_ID cités par un axe de l\'emprise', url: WFS, objets: r.n, crs: 'EPSG:31370' }, r.texte);
    console.log(`UrbIS StreetNodes (bord) : ${r.n} / ${manquants.length} nœuds`);
  }
}

// ─── OpenStreetMap (complément, ODbL) ─────────────────────────────────────
// L'API /map rend tout (nœuds, chemins, relations) : on n'en garde que les
// chemins `highway` et leurs nœuds, tags inchangés. Méthode consignée.
async function osm() {
  const st = JSON.parse(readFileSync('data/original/urbis/stations.wfs.json', 'utf8')).features;
  const emprise = calculerEmprise(corridor, st);
  const [minLon, minLat, maxLon, maxLat] = boite(emprise.wgs84);
  const PAS = 0.01;
  const noeuds = new Map(), chemins = new Map();
  let appels = 0;
  for (let lon = minLon; lon < maxLon; lon += PAS) {
    for (let lat = minLat; lat < maxLat; lat += PAS) {
      const bbox = [lon, lat, Math.min(lon + PAS, maxLon), Math.min(lat + PAS, maxLat)].map(v => v.toFixed(5)).join(',');
      const json = JSON.parse(await lire(`${OSM_API}.json?bbox=${bbox}`));
      appels++;
      for (const e of json.elements) {
        if (e.type === 'node') noeuds.set(e.id, [e.lon, e.lat]);
        else if (e.type === 'way' && e.tags?.highway) chemins.set(e.id, { id: e.id, version: e.version, timestamp: e.timestamp, nodes: e.nodes, tags: e.tags });
      }
      process.stdout.write(`\rOSM : ${appels} tuiles, ${chemins.size} chemins`);
      await new Promise(r => setTimeout(r, 1000)); // une requête par seconde : usage modéré de l'API
    }
  }
  console.log();
  const sortie = {
    licence: 'ODbL 1.0 — © les contributeurs OpenStreetMap',
    methode: `API OSM 0.6 /map par tuiles de ${PAS}° couvrant la boîte de l'emprise ; seuls les chemins portant highway=* et leurs nœuds sont conservés, tags inchangés. Les nœuds hors tuiles restent absents.`,
    extraitLe: new Date().toISOString(),
    chemins: [...chemins.values()].map(w => ({ ...w, geometrie: w.nodes.map(n => noeuds.get(n) ?? null) })),
  };
  const texte = JSON.stringify(sortie);
  writeFileSync('data/original/osm/highways.json', texte);
  consigner('data/original/osm/highways.json', { source: 'osm', url: OSM_API, objets: sortie.chemins.length, crs: 'EPSG:4326', filtre: 'highway=*' }, texte);
}

// ─── UrbIS – Constructions 3D (hauteurs des bâtiments) ────────────────────
// Les tuiles Shapefile (~1 km, ~5 Mo zippées, ~45 Mo chacune une fois ouvertes) ne sont
// pas conservées dans le dépôt : seul l'extrait utile l'est (un solide par ligne :
// identifiants, Zmin, Zmax), avec l'URL et l'empreinte de chaque tuile lue.
const FLUX_3D = 'https://urbisdownload.datastore.brussels/atomfeed/e9ec2aa4-cffd-11ee-bccc-00090ffe0001-fr.xml';
async function urbis3d() {
  const st = JSON.parse(readFileSync('data/original/urbis/stations.wfs.json', 'utf8')).features;
  const [minLon, minLat, maxLon, maxLat] = boite(calculerEmprise(corridor, st).wgs84);
  const batiments = new Set(JSON.parse(readFileSync('data/original/urbis/batiments.wfs.json', 'utf8')).features.map(f => f.properties.INSPIRE_ID));
  const flux = await lire(FLUX_3D);
  const tuiles = [...flux.matchAll(/href="([^"]*_SHP_(\d+)_(\d{8})\.zip)"[^>]*bbox="([\d. ]+)"/g)]
    .map(m => ({ url: m[1], tuile: m[2], date: m[3], bbox: m[4].split(' ').map(Number) })) // bbox : sud ouest nord est
    .filter(t => !(t.bbox[3] < minLon || t.bbox[1] > maxLon || t.bbox[2] < minLat || t.bbox[0] > maxLat));
  const date = tuiles.map(t => t.date).sort().pop();
  const retenues = tuiles.filter(t => t.date === date).sort((a, b) => a.tuile.localeCompare(b.tuile));
  if (!retenues.length) throw new Error('UrbIS 3D : aucune tuile ne touche l\'emprise');
  const solides = new Map();
  let lus = 0, sansBatiment = 0;
  const consignees = [];
  for (const t of retenues) {
    let zip;
    for (let i = 1; ; i++) {
      try {
        const r = await fetch(t.url, { headers: { 'User-Agent': AGENT } });
        if (!r.ok) throw new Error(`HTTP ${r.status} pour ${t.url}`);
        zip = Buffer.from(await r.arrayBuffer());
        break;
      } catch (e) { if (i >= 4) throw e; await new Promise(res => setTimeout(res, 1000 * 2 ** i)); }
    }
    consignees.push({ url: t.url, sha256: createHash('sha256').update(zip).digest('hex'), octets: zip.length });
    for (const s of solidesDeLaTuile(zip)) {
      lus++;
      if (!s.batiment) { sansBatiment++; continue; }
      if (!batiments.has(s.batiment)) continue; // bâtiment de la tuile hors de l'emprise
      solides.set(s.solide, s); // un solide à cheval sur deux tuiles n'est gardé qu'une fois
    }
    process.stdout.write(`\rUrbIS 3D : ${consignees.length}/${retenues.length} tuiles, ${solides.size} solides retenus`);
  }
  console.log();
  const num = uri => Number(uri.split('/').pop());
  const sortie = {
    licence: 'CC0 1.0 — UrbIS © Paradigm',
    methode: `Tuiles Shapefile du ${date} qui touchent la boîte de l'emprise ; pour chaque solide (BuildingSolids) associé par BU_ID à un bâtiment de data/original/urbis/batiments.wfs.json : identifiant du solide, identifiant du bâtiment, Zmin et Zmax de sa forme MultiPatch (mètres, tels que lus). Les géométries 3D ne sont pas conservées.`,
    extraitLe: new Date().toISOString(),
    dateTuiles: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`,
    prefixes: { solide: 'https://databrussels.be/id/buildingsolid/', batiment: 'https://databrussels.be/id/building/' },
    bilan: { solidesLus: lus, solidesSansBatiment: sansBatiment, solidesRetenus: solides.size },
    colonnes: ['solide', 'batiment', 'zmin', 'zmax'],
    solides: [...solides.values()].map(s => [num(s.solide), num(s.batiment), s.zmin, s.zmax]).sort((a, b) => a[0] - b[0]),
  };
  mkdirSync('data/original/urbis3d', { recursive: true });
  const texte = JSON.stringify(sortie);
  writeFileSync('data/original/urbis3d/solides.json', texte);
  consigner('data/original/urbis3d/solides.json', { source: 'urbis3d', url: FLUX_3D, objets: sortie.solides.length, crs: 'EPSG:31370', filtre: 'BuildingSolids des tuiles de l\'emprise, associés à un bâtiment chargé', tuiles: consignees }, texte);
  console.log(`UrbIS 3D : ${JSON.stringify(sortie.bilan)}`);
}

// ─── Brussels Mobility – compteurs vélo (v0.5) ────────────────────────────
// Seuls les vélos ont un historique : l'API des comptages automobiles ne rend
// que le direct (vérifié le 2026-11-18), qui n'est pas une référence.
// Période de référence : 4 semaines de jours ouvrables avant le congé d'automne
// (FWB 2026 : 19 au 30 octobre), comptes par quart d'heure en UTC, inchangés.
const VELOS = 'https://data.mobility.brussels/bike/api/counts/';
export const PERIODE_VELOS = { debut: '20260921', fin: '20261016' };
async function velos() {
  const st = JSON.parse(readFileSync('data/original/urbis/stations.wfs.json', 'utf8')).features;
  const anneau = calculerEmprise(corridor, st).wgs84;
  const devices = JSON.parse(await lire(`${VELOS}?request=devices`));
  const retenus = devices.features.filter(f => f.geometry && pointDansAnneau(f.geometry.coordinates, anneau));
  const compteurs = [];
  for (const f of retenus) {
    const nom = f.properties.device_name;
    const h = JSON.parse(await lire(`${VELOS}?request=history&featureID=${nom}&startDate=${PERIODE_VELOS.debut}&endDate=${PERIODE_VELOS.fin}`));
    compteurs.push({ ...f, historique: { startDate: h.startDate, endDate: h.endDate, timeGaps: h.timeGaps, data: h.data } });
    console.log(`Vélos ${nom} : ${h.data?.length ?? 0} quarts d'heure`);
    await new Promise(r => setTimeout(r, 500));
  }
  const sortie = {
    licence: 'CC0 1.0 — Bruxelles Mobilité (republié par la Ville de Bruxelles sur opendata.brussels.be)',
    methode: `API bike/api/counts : request=devices, puis request=history du ${PERIODE_VELOS.debut} au ${PERIODE_VELOS.fin} pour chaque compteur situé dans l'emprise ; réponses inchangées (quarts d'heure en UTC).`,
    extraitLe: new Date().toISOString(),
    compteurs,
  };
  mkdirSync('data/original/brussels-mobility', { recursive: true });
  const texte = JSON.stringify(sortie);
  writeFileSync('data/original/brussels-mobility/velos.json', texte);
  consigner('data/original/brussels-mobility/velos.json', { source: 'brussels-mobility', url: VELOS, objets: compteurs.length, crs: 'EPSG:4326', filtre: `compteurs vélo dans l'emprise, ${PERIODE_VELOS.debut}–${PERIODE_VELOS.fin}` }, texte);
}

if (quoi === 'tout' || quoi === 'urbis') await urbis();
if (quoi === 'tout' || quoi === 'osm') await osm();
if (quoi === 'tout' || quoi === 'urbis3d') await urbis3d();
if (quoi === 'tout' || quoi === 'velos') await velos();
