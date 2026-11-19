// v0.7 : les outils de la barre — la voie visée par son décalage à l'axe, la chaussée découpée
// en voies (proposition), le type changé sans toucher aux largeurs, refus motivés.
import { readFileSync } from 'node:fs';
import { appliquerOutil, decouperChaussee, bandeAuDecalage } from '../js/outils.js';
import { sectionMesuree, verifier, occupe, decalages } from '../js/section.js';

const bande = (id, type, largeur, sens = null) => ({ id, type, largeur, sens });
// Trottoir 3 m, chaussée 12,3 m, trottoir 4,5 m ; l'axe à 9 m du bord gauche
const s0 = { troncon: 't', emprise: 19.8, axe: 9, prochain: 4, bandes: [bande('b1', 'trottoir', 3), bande('b2', 'chaussee', 12.3), bande('b3', 'trottoir', 4.5)] };

group('outils — viser et découper');
test('la bande visée par son décalage à l\'axe (positif à gauche)', () => {
  assert.equal(bandeAuDecalage(s0, 8), 0);
  assert.equal(bandeAuDecalage(s0, 0), 1);
  assert.equal(bandeAuDecalage(s0, -9), 2);
  assert.equal(bandeAuDecalage(s0, 30), null);
});
test('une chaussée à double sens devient des voies : à gauche de l\'axe contre lui, à cheval sur l\'axe à double sens', () => {
  const r = decouperChaussee(s0, 1, null);
  assert.equal(r.voies, 3);
  // Voies de 4,1 m : [6 ; 1,9], [1,9 ; −2,2] (à cheval), [−2,2 ; −6,3]
  assert.deepEqual(r.section.bandes.slice(1, 4).map(b => [b.type, b.sens]), [['voiture', 'retour'], ['voiture', 'double'], ['voiture', 'aller']]);
  assert.equal(occupe(r.section), occupe(s0));
  assert.deepEqual(verifier(r.section), []);
  assert.equal(new Set(r.section.bandes.map(b => b.id)).size, r.section.bandes.length);
  assert.deepEqual(decouperChaussee(s0, 1, 'unique-inverse').section.bandes.slice(1, 4).map(b => b.sens), ['retour', 'retour', 'retour']);
});

group('outils — appliquer');
test('une piste posée sur la chaussée : découpe puis la voie visée devient une piste, largeurs inchangées', () => {
  const r = appliquerOutil(s0, -5, 'cyclable', { sensSource: null });
  assert.equal(r.decoupee, 3);
  const visee = r.section.bandes[r.indice];
  assert.equal(visee.type, 'cyclable');
  const d = decalages(r.section)[r.indice];
  assert.ok(d.gauche >= -5 && d.droite <= -5);
  assert.equal(occupe(r.section), occupe(s0));
});
test('changer de type, de sens, supprimer ; refus motivés', () => {
  const a = appliquerOutil(s0, -5, 'voiture').section;
  const i = bandeAuDecalage(a, -5);
  assert.equal(appliquerOutil(a, -5, 'voiture').refus, 'deja');
  assert.equal(appliquerOutil(a, -5, 'bus').section.bandes[i].type, 'bus');
  assert.equal(a.bandes[i].sens, 'aller');
  assert.equal(appliquerOutil(a, -5, 'sens').section.bandes[i].sens, 'retour');
  assert.equal(appliquerOutil(a, 8, 'sens').refus, 'sans-sens');
  const sup = appliquerOutil(a, -5, 'supprimer').section;
  assert.equal(sup.bandes.length, a.bandes.length - 1);
  assert.equal(appliquerOutil(null, 0, 'bus').refus, 'section-inconnue');
  assert.equal(appliquerOutil(s0, 40, 'bus').refus, 'hors-section');
  assert.equal(appliquerOutil(s0, 0, 'avion').refus, 'outil');
  // Un trottoir posé sur une chaussée inconnue la transforme entière (pas de découpe)
  assert.equal(appliquerOutil(s0, 0, 'trottoir').section.bandes.length, 3);
});
test('sur tout le réseau réel : un outil posé au milieu de chaque section mesurée garde une section valide', () => {
  const reseau = JSON.parse(readFileSync(new URL('../data/processed/network.json', import.meta.url), 'utf8'));
  let n = 0;
  for (const seg of reseau.streetSegments) {
    const s = sectionMesuree(seg);
    if (!s) continue;
    for (const outil of ['cyclable', 'bus', 'sens', 'supprimer']) {
      const r = appliquerOutil(s, 0, outil, { sensSource: seg.sourceAttributes.oneway });
      if (r.section) { assert.deepEqual(verifier(r.section), [], seg.id); n++; }
    }
  }
  assert.ok(n > 1000);
});
