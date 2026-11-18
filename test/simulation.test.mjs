// v0.5 : la simulation simplifiée — capacité depuis la section, demande (joueur, comptage),
// saturation, personnes, temps (BPR), délai (Webster), conflits d'un carrefour, opérations.
// Règle centrale (pilier 6) : sans donnée, null et une raison ; jamais une valeur inventée.
import { readFileSync } from 'node:fs';
import {
  etatTroncon, voiesParMode, voiesOsm, demandeDe, partDeVert, delaiWebster, tempsBpr, niveau, bilan, conflits,
  definirDemande, definirHypothese,
} from '../js/simulation.js';
import { REFERENCES as R } from '../js/data/simulation.js';
import { sectionMesuree } from '../js/section.js';
import { branchesDe, raccordsDe, toutesLesVoies } from '../js/carrefour.js';
import { geometrieCarrefour } from '../js/geo/raccords.js';
import { DESSIN_CARREFOUR as D } from '../js/data/carrefours.js';

const lire = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const reseau = lire('data/processed/network.json');
const comptages = lire('data/processed/comptages.json');

const bande = (id, type, largeur, sens = null) => ({ id, type, largeur, sens });
const section = bandes => ({ troncon: 't', emprise: bandes.reduce((a, b) => a + b.largeur, 0), axe: 0, bandes, prochain: 9 });
const rue = section([
  bande('b1', 'trottoir', 3), bande('b2', 'cyclable', 2, 'retour'), bande('b3', 'voiture', 3, 'retour'),
  bande('b4', 'voiture', 3, 'aller'), bande('b5', 'cyclable', 2, 'aller'), bande('b6', 'trottoir', 2.5),
]);
const seg = (attr = {}) => ({ id: 't', lengthMeters: 500, sourceAttributes: { oneway: null, lanes: null, speedLimit: 50, ...attr } });
const etat = (plus = {}) => etatTroncon({ segment: seg(), section: rue, choix: null, comptage: null, hypotheses: {}, regulation: {}, vitesseVeloKmh: 18, ...plus });

group('simulation — offre');
test('voies par mode et par sens ; une bande « double » compte une demi-voie par sens', () => {
  const v = voiesParMode(rue);
  assert.deepEqual(v.voiture, { aller: 1, retour: 1 });
  assert.deepEqual(v.cyclable, { aller: 1, retour: 1 });
  assert.equal(v.pieton.largeur, 5.5);
  assert.deepEqual(voiesParMode(section([bande('b1', 'voiture', 4, 'double')])).voiture, { aller: 0.5, retour: 0.5 });
});
test('capacité = voies × débit de saturation cité ; trottoirs = largeur × débit piéton par mètre', () => {
  const m = etat().modes;
  assert.equal(m.voiture.capacite.aller, R.saturationVoie.valeur);
  assert.equal(m.cyclable.capacite.total, 2 * R.saturationPiste.valeur);
  assert.equal(m.pieton.capacite.total, Math.round(5.5 * R.pietonParMetre.valeur));
  assert.equal(m.voiture.capacite.source, 'hcm-saturation');
});
test('un carrefour d\'aval à feux réduit la capacité à la part de vert', () => {
  const m = etat({ regulation: { aller: 'feux', retour: null } }).modes.voiture;
  assert.equal(m.capacite.aller, Math.round(R.saturationVoie.valeur * partDeVert()));
  assert.equal(m.capacite.retour, R.saturationVoie.valeur);
});
test('chaussée non découpée : voies d\'OSM si elles se répartissent, sinon « Non renseigné »', () => {
  const ch = section([bande('b1', 'trottoir', 2), bande('b2', 'chaussee', 7), bande('b3', 'trottoir', 2)]);
  const inconnu = etat({ section: ch }).modes.voiture.capacite;
  assert.equal(inconnu.aller, null);
  assert.equal(inconnu.raison, 'voies-inconnues');
  const osm = etat({ section: ch, segment: seg({ lanes: 2, oneway: 'double' }) }).modes.voiture.capacite;
  assert.equal(osm.aller, R.saturationVoie.valeur);
  assert.equal(osm.methode, 'voies-osm');
  assert.equal(voiesOsm({ lanes: 3, oneway: 'double' }), null); // 3 voies à double sens : répartition inconnue
  assert.deepEqual(voiesOsm({ lanes: 2, oneway: 'unique-inverse' }), { aller: 0, retour: 2 });
});
test('sans section mesurée, aucune capacité', () => {
  const m = etat({ section: null }).modes;
  for (const k of ['voiture', 'cyclable', 'pieton']) assert.equal(m[k].capacite.raison, 'section-inconnue');
});
test('vélos sans piste, dans la circulation générale : capacité non modélisée', () => {
  const s = section([bande('b1', 'trottoir', 2), bande('b2', 'voiture', 3, 'aller'), bande('b3', 'trottoir', 2)]);
  assert.equal(etat({ section: s }).modes.cyclable.capacite.raison, 'circulation-melee');
});

group('simulation — demande et indicateurs');
test('sans demande : aucun indicateur, raison « sans-demande »', () => {
  const e = etat();
  assert.equal(e.renseigne, false);
  assert.equal(e.saturationMax, null);
  assert.equal(e.modes.voiture.personnes.raison, 'sans-demande');
  assert.equal(e.personnes.demande, null);
});
test('le comptage sert de demande (deux sens ensemble) ; le choix du joueur prime', () => {
  const c = { mode: 'cyclable', sens: 'total', parHeure: 1500, compteurs: ['X'] };
  assert.deepEqual(demandeDe('cyclable', null, c), { aller: null, retour: null, total: 1500, origine: 'comptage', compteurs: ['X'] });
  assert.equal(demandeDe('cyclable', { cyclable: { aller: 10 } }, c).origine, 'joueur');
  const e = etat({ comptage: c });
  assert.equal(e.modes.cyclable.saturation.total, 1500 / 4000);
  assert.equal(e.modes.cyclable.personnes.transportees, 1500);
});
test('voitures : saturation par sens, personnes = débit écoulé × occupation (hypothèse du joueur)', () => {
  const choix = { voiture: { aller: 2500, retour: 600 } };
  const sansOcc = etat({ choix });
  assert.equal(sansOcc.modes.voiture.saturation.aller, 2500 / 1900);
  assert.equal(sansOcc.modes.voiture.personnes.raison, 'occupation-inconnue');
  assert.equal(niveau(sansOcc.saturationMax), 'sature');
  const e = etat({ choix, hypotheses: { occupationVoiture: 1.5 } });
  assert.equal(e.modes.voiture.personnes.demande, Math.round(3100 * 1.5));
  assert.equal(e.modes.voiture.personnes.transportees, Math.round((1900 + 600) * 1.5)); // borné par la capacité
});
test('retirer une voie automobile fait baisser les voitures écoulées (pilier 4 : on compte les personnes)', () => {
  const choix = { voiture: { aller: 1500 }, cyclable: { aller: 800 } };
  const h = { occupationVoiture: 1.2 };
  const avant = etat({ choix, hypotheses: h });
  const sansVoie = section(rue.bandes.filter(b => b.id !== 'b4'));
  const apres = etat({ choix, hypotheses: h, section: sansVoie });
  assert.equal(apres.modes.voiture.capacite.aller, 0);
  assert.equal(apres.modes.voiture.saturation.aller, Infinity);
  assert.equal(apres.modes.voiture.temps.aller, null);
  assert.ok(apres.personnes.transportees < avant.personnes.transportees);
});
test('temps : BPR sur la limite de vitesse ; délai de Webster seulement au feu', () => {
  const e = etat({ choix: { voiture: { aller: 1900 } }, regulation: { aller: 'feux', retour: 'priorite-droite' } });
  const t0 = 500 / (50 / 3.6);
  const x = 1900 / Math.round(1900 * partDeVert());
  assert.equal(e.modes.voiture.temps.aller, Math.round(tempsBpr(t0, x)));
  assert.equal(e.modes.voiture.delai.aller, Math.round(delaiWebster(x)));
  assert.equal(e.modes.voiture.delai.retour, null);
  assert.equal(e.modes.voiture.raisonDelai.retour, 'regulation-non-modelisee');
  assert.equal(etat({ segment: seg({ speedLimit: null }) }).modes.voiture.raisonTemps, 'vitesse-inconnue');
  assert.equal(etat().modes.pieton.temps.total, Math.round(500 / R.marche.valeur));
});
test('Webster : délai borné à saturation, plus long quand le vert est court', () => {
  assert.ok(delaiWebster(0.5) < delaiWebster(1));
  assert.equal(delaiWebster(2), delaiWebster(1));
  assert.equal(Math.round(delaiWebster(0) * 10) / 10, Math.round(((90 * (1 - partDeVert()) ** 2) / 2) * 10) / 10);
});
test('bilan : renseignés, saturés, proches', () => {
  const b = bilan([etat(), etat({ choix: { voiture: { aller: 2500 } } }), etat({ choix: { voiture: { aller: 1600 } } }), etat({ choix: { pieton: { total: 10 } } })]);
  assert.deepEqual(b, { renseignes: 3, satures: 1, proches: 1, inconnus: 0 });
});

test('comptage à deux sens, piste dans un seul : capacité inconnue, personnes du tronçon non renseignées', () => {
  const s = section([bande('b1', 'trottoir', 2), bande('b2', 'voiture', 3, 'aller'), bande('b3', 'cyclable', 2, 'aller'), bande('b4', 'trottoir', 2)]);
  const e = etat({ section: s, comptage: { mode: 'cyclable', sens: 'total', parHeure: 900, compteurs: ['X'] }, choix: { voiture: { aller: 500 } }, hypotheses: { occupationVoiture: 1.2 } });
  assert.equal(e.modes.cyclable.capacite.retour, null);
  assert.equal(e.modes.cyclable.personnes.transportees, null);
  assert.equal(e.modes.voiture.personnes.transportees, 600);
  assert.equal(e.personnes.transportees, null); // la somme mentirait
});

group('simulation — opérations');
test('définir et effacer une demande ; refus motivés', () => {
  const a = definirDemande(null, 'voiture', 'aller', 1200);
  assert.deepEqual(a.demande, { voiture: { aller: 1200 } });
  assert.equal(definirDemande(a.demande, 'voiture', 'aller', null).demande, null);
  assert.equal(definirDemande(null, 'pieton', 'aller', 5).refus, 'sens-demande');
  assert.equal(definirDemande(null, 'voiture', 'aller', -3).refus, 'debit');
  assert.equal(definirDemande(null, 'voiture', 'aller', 1.5).refus, 'debit');
  assert.equal(definirDemande(null, 'voiture', 'aller', 1e6).refus, 'debit-max');
  assert.equal(definirDemande(null, 'avion', 'aller', 1).refus, 'mode-demande');
});
test('hypothèses d\'occupation : bornées, arrondies au dixième', () => {
  assert.deepEqual(definirHypothese({}, 'occupationVoiture', 1.33).hypotheses, { occupationVoiture: 1.3 });
  assert.equal(definirHypothese({}, 'occupationVoiture', 0.5).refus, 'occupation');
  assert.equal(definirHypothese({}, 'inconnue', 2).refus, 'hypothese');
});

group('simulation — données réelles');
test('chaque comptage est rattaché à un tronçon de surface existant', () => {
  const ids = new Map(reseau.streetSegments.map(s => [s.id, s]));
  assert.ok(Object.keys(comptages.parTroncon).length >= 1);
  for (const [id, c] of Object.entries(comptages.parTroncon)) {
    assert.equal(ids.get(id)?.niveau, 0, id);
    assert.ok(c.parHeure > 0 && c.compteurs.length >= 1);
  }
  assert.ok(comptages.vitesseVeloKmh > 5 && comptages.vitesseVeloKmh < 40);
});
test('tout le réseau, sections mesurées : aucune valeur inventée sans demande', () => {
  let n = 0;
  for (const s of reseau.streetSegments) {
    const e = etatTroncon({ segment: s, section: sectionMesuree(s), choix: null, comptage: comptages.parTroncon[s.id] ?? null, hypotheses: {}, regulation: {}, vitesseVeloKmh: comptages.vitesseVeloKmh });
    if (!comptages.parTroncon[s.id]) { assert.equal(e.renseigne, false); assert.equal(e.saturationMax, null); }
    n++;
  }
  assert.equal(n, reseau.streetSegments.length);
});

group('simulation — conflits d\'un carrefour');
test('croix à deux voies par branche : les tourne-à-gauche croisent ; traversées comptées', () => {
  const sec = id => ({ troncon: id, emprise: 12, axe: 6, prochain: 5, bandes: [
    bande('b1', 'trottoir', 2), bande('b2', 'voiture', 4, 'retour'), bande('b3', 'cyclable', 2, 'aller'), bande('b4', 'trottoir', 4),
  ] });
  const lignes = { est: [[0, 0], [100, 0]], nord: [[0, 0], [0, 100]], ouest: [[-100, 0], [0, 0]], sud: [[0, -100], [0, 0]] };
  const segs = new Map(Object.keys(lignes).map(id => [id, { id, fromNode: ['est', 'nord'].includes(id) ? 'N' : 'x', toNode: ['est', 'nord'].includes(id) ? 'x' : 'N', niveau: 0, sourceAttributes: { oneway: null } }]));
  const branches = branchesDe({ id: 'N', connectedSegmentIds: Object.keys(lignes) }, { segments: segs, sectionDe: sec, ligneDe: id => lignes[id] });
  const { raccords } = raccordsDe(branches, null);
  const sans = conflits(geometrieCarrefour(branches, raccords, [], D), toutesLesVoies(branches));
  assert.ok(sans.total > 0);
  assert.ok(sans.paires['motorise×motorise'] > 0);
  const avec = conflits(geometrieCarrefour(branches, raccords, [{ troncon: 'est', type: 'pieton' }], D), toutesLesVoies(branches));
  assert.ok(avec.paires['motorise×pieton'] > 0);
  assert.equal(avec.total - sans.total, Object.entries(avec.paires).filter(([k]) => k.includes('pieton')).reduce((a, [, v]) => a + v, 0));
});
