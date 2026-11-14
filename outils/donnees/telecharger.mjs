// Télécharge les données sources dans data/original/ (pitch §9 : jamais modifiées ensuite).
// Seule étape du pipeline qui touche le réseau ; le jeu, lui, n'appelle aucun service.
//
//   node outils/donnees/telecharger.mjs            → UrbIS puis OSM
//   node outils/donnees/telecharger.mjs urbis      → UrbIS seulement
//   node outils/donnees/telecharger.mjs osm        → OSM seulement (après UrbIS : l'emprise en dépend)
//
// Chaque fichier est consigné dans data/original/manifest.json (URL, date, nombre d'objets, empreinte).
// Ensuite : node outils/donnees/construire.mjs (sans réseau, reproductible).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { calculerEmprise } from './emprise.mjs';
import { boite } from '../../js/geo/geometrie.js';

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

if (quoi === 'tout' || quoi === 'urbis') await urbis();
if (quoi === 'tout' || quoi === 'osm') await osm();
