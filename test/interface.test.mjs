// L'interface : langues, palette, inspecteur, sauvegarde. Sans navigateur.
import { readFileSync } from 'node:fs';
import { createI18n } from '../js/lib/i18n.js';
import { createStore, memoryBackend } from '../js/lib/save.js';
import { TEXTES } from '../js/data/textes.js';
import { PALETTE } from '../js/palette.js';
import { REGLAGES } from '../js/data/reglages.js';
import { styleCarte, couleursDuStyle, COUCHES } from '../js/carte/style.js';
import { COMMANDES_AIDE } from '../js/data/aide.js';
import { lignesInspecteur } from '../js/inspecteur.js';

const codes = JSON.parse(readFileSync(new URL('../data/urbis-codes.json', import.meta.url), 'utf8'));
const i18n = createI18n(TEXTES, { lang: 'fr' });
const t = (k, v) => i18n.t(k, v);

const segment = (plus = {}) => ({
  id: 'seg-u1', sourceIds: { urbis: 'https://databrussels.be/id/streetaxe/1', osm: [] }, streetId: null,
  nom: { fr: null, nl: null }, fromNode: null, toNode: 'node-u9', lengthMeters: 12.5, longueurSource: null,
  typeCode: 'S', hierarchieCode: 'T', niveau: -1, penteDegres: null,
  sourceAttributes: { oneway: null, lanes: null, speedLimit: null, roadOwner: null, roadManager: null },
  complementOsm: null, anomalies: [], ...plus,
});
const ctx = { t, lang: 'fr', codes, noeuds: new Map([['node-u9', { id: 'node-u9', typeCode: 'I', connectedSegmentIds: ['a', 'b', 'c'] }]]), rues: new Map() };
const valeur = (sections, champ) => sections.flatMap(s => s.lignes).find(l => l.champ === t(champ));

group('langues');
test('chaque clé existe en français et en anglais', () => assert.deepEqual(i18n.missing(), {}));
test('chaque libellé de code UrbIS a sa traduction', () => {
  for (const [table, valeurs] of Object.entries(codes)) if (typeof valeurs === 'object' && !Array.isArray(valeurs)) {
    for (const [code, l] of Object.entries(valeurs)) assert.ok(l.fr && l.en, `${table}.${code}`);
  }
});

group('palette et carte');
test('le style de la carte n\'utilise que la palette', () => {
  const permises = new Set(Object.values(PALETTE).map(c => c.toUpperCase()));
  for (const c of couleursDuStyle(styleCarte(PALETTE, REGLAGES))) assert.ok(permises.has(c), c);
});
test('aucune source distante dans le style', () => {
  const style = styleCarte(PALETTE, REGLAGES);
  assert.ok(!style.glyphs && !style.sprite);
  for (const s of Object.values(style.sources)) assert.match(s.data, /^data\//);
});
test('chaque couche activable commande des couches qui existent', () => {
  const ids = new Set(styleCarte(PALETTE, REGLAGES).layers.map(l => l.id));
  for (const liste of Object.values(COUCHES)) for (const id of liste) assert.ok(ids.has(id), id);
});
test('aucune couleur en dur dans le CSS du jeu', () => {
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.ok(!/#[0-9a-f]{3,6}\b|rgb\(/i.test(css));
});

group('aide clavier');
test('chaque commande de l\'aide a ses textes en français et en anglais', () => {
  for (const lang of ['fr', 'en']) for (const id of COMMANDES_AIDE) for (const k of ['action', 'clavier', 'souris']) {
    assert.ok(TEXTES[lang][`aide.${id}.${k}`], `${lang} aide.${id}.${k}`);
  }
});

group('inspecteur');
test('seuls les identifiants présents se copient', () => {
  const s = lignesInspecteur(segment(), ctx);
  assert.equal(valeur(s, 'champ.id').copiable, true);
  assert.equal(valeur(s, 'champ.id-source').copiable, true);
  assert.ok(!valeur(s, 'champ.rue').copiable);
  const sans = valeur(lignesInspecteur(segment({ sourceIds: { urbis: null, osm: [] } }), ctx), 'champ.id-source');
  assert.ok(sans.inconnu && !sans.copiable);
});
test('les valeurs absentes restent « Non renseigné »', () => {
  const s = lignesInspecteur(segment(), ctx);
  for (const champ of ['champ.nom', 'champ.sens', 'champ.voies', 'champ.vitesse', 'champ.pente', 'champ.gestionnaire', 'champ.longueur-source']) {
    const l = valeur(s, champ);
    assert.ok(l.inconnu, champ);
    assert.match(l.valeur, /^Non renseigné/);
  }
  assert.equal(valeur(s, 'champ.depart').valeur, 'Non renseigné (absent de la source)');
  assert.ok(valeur(s, 'champ.largeur').inconnu, 'la largeur n\'est jamais connue en v0.1');
});
test('un code hors spécification est montré tel quel', () => {
  assert.equal(valeur(lignesInspecteur(segment(), ctx), 'champ.hierarchie').valeur, 'Code « T » (hors spécification)');
});
test('une valeur OSM porte sa méthode et sa confiance', () => {
  const s = lignesInspecteur(segment({
    sourceIds: { urbis: 'x', osm: [42] },
    sourceAttributes: { oneway: 'unique-inverse', lanes: 2, speedLimit: 30, roadOwner: null, roadManager: null },
    complementOsm: { confiance: 'moyenne', tags: { oneway: 'yes' } },
  }), ctx);
  const sens = valeur(s, 'champ.sens');
  assert.equal(sens.valeur, 'Sens unique, de l\'arrivée vers le départ');
  assert.match(sens.source, /OSM · appariement géométrique · confiance moyenne/);
  assert.equal(valeur(s, 'champ.vitesse').valeur, '30 km/h');
});
test('le nœud affiche son type et son nombre de tronçons', () => {
  assert.equal(valeur(lignesInspecteur(segment(), ctx), 'champ.arrivee').valeur, 'node-u9 · Carrefour (I) · 3 tronçon(s)');
});

group('sauvegarde');
test('une vue relue est la même', () => {
  const store = createStore({ game: 'test', entries: { partie: { version: 1 } }, backend: memoryBackend() });
  const partie = { vue: { centre: [4.4, 50.84], zoom: 16.5 }, selection: 'seg-u86475', couches: { batiments: false, rues: true } };
  store.save('partie', partie);
  assert.deepEqual(store.load('partie'), partie);
});
