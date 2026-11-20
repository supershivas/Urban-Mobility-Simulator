// Les mouvements d'un carrefour du jeu beta (Jérôme, v0.9.5) : de quelle voie qui arrive vers quelle
// voie qui part. Pur, testé. Par défaut, comme le marquage courant : une seule voie va partout ; avec
// plusieurs voies, celle de gauche tourne à gauche ou va tout droit, celle de droite tourne à droite ou
// va tout droit, celles du milieu vont tout droit. Le joueur les change dans la vue « Mouvements »
// (glisser d'une voie qui arrive vers une voie qui part, clic sur une liaison pour la retirer) ;
// les voitures les suivent ; des flèches au sol les montrent.
// Clé d'une voie : `tronçon|sens|voie` (sens de circulation sur le tronçon, voie 0 = près de l'axe).
import { voieBus, nbVoies, extraDe } from './reseau.js?v=0.10.0';

export const cle = v => `${v.troncon}|${v.sens}|${v.voie}`;
export const deCle = k => { const [troncon, sens, voie] = k.split('|'); return { troncon, sens: +sens, voie: +voie }; };

/** Les voies automobiles qui arrivent au nœud et celles qui en partent, avec leur branche. */
export function voiesDu(reseau, geoNoeud) {
  const entrees = [], sorties = [];
  geoNoeud.branches.forEach((b, i) => {
    const t = reseau.troncons[b.troncon];
    for (let k = 0; k < nbVoies(t, -b.sens); k++) entrees.push({ troncon: b.troncon, sens: -b.sens, voie: k, branche: i });
    for (let k = 0; k < nbVoies(t, b.sens); k++) sorties.push({ troncon: b.troncon, sens: b.sens, voie: k, branche: i });
  });
  return { entrees, sorties };
}

/** Le sens du mouvement de la branche i vers la branche j : 'gauche', 'toutdroit' ou 'droite'. */
export function direction(geoNoeud, i, j) {
  const arrive = geoNoeud.branches[i].angle + Math.PI, part = geoNoeud.branches[j].angle;
  let a = (part - arrive) % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI; else if (a <= -Math.PI) a += 2 * Math.PI;
  return a > 0.45 ? 'gauche' : a < -0.45 ? 'droite' : 'toutdroit';
}

/** Les mouvements par défaut d'une voie qui arrive : [clé de sortie]. */
function parDefaut(reseau, g, e) {
  const t = reseau.troncons[e.troncon], n = nbVoies(t, e.sens), vb = voieBus(t, e.sens);
  // Une voie de présélection (voie 0 d'un sens « gauche ») ne fait que tourner à gauche ; les autres ne tournent plus à gauche
  const poche = extraDe(t, e.sens) === 'gauche';
  if (poche && e.voie === 0) {
    const gauche = g.branches.map((b, j) => ({ b, j })).filter(({ j }) => j !== e.branche && direction(g, e.branche, j) === 'gauche')
      .map(({ b }) => cle({ troncon: b.troncon, sens: b.sens, voie: 0 }));
    if (gauche.length) return gauche; // sinon (plus de branche à gauche), la voie va où elle peut
  }
  const voitures = [...Array(n).keys()].filter(k => k !== vb && !(poche && k === 0)); // une voie bus suit les mêmes mouvements que sa voisine
  const rang = e.voie === vb ? voitures.length - 1 : voitures.indexOf(e.voie), m = voitures.length;
  const out = [];
  g.branches.forEach((b, j) => {
    if (j === e.branche) return;
    const d = direction(g, e.branche, j);
    const aGauche = poche && g.branches.some((_, k) => k !== e.branche && direction(g, e.branche, k) === 'gauche');
    const permis = d === 'gauche' && aGauche ? false : m <= 1 || (d === 'toutdroit' ? true : d === 'gauche' ? rang === 0 : rang === m - 1);
    // Pas de tout droit possible (côté d'un T) : la voie de gauche tourne à gauche, celle de droite à droite
    const sansToutDroit = !g.branches.some((_, k) => k !== e.branche && direction(g, e.branche, k) === 'toutdroit');
    const permisT = sansToutDroit && m > 1 ? (d === 'gauche' ? rang < m / 2 : rang >= m / 2 - 0.5) : permis;
    if (!permisT) return;
    const ts = reseau.troncons[b.troncon], ns = nbVoies(ts, b.sens);
    // Voie de sortie : à droite, la plus à droite ; à gauche, la plus à gauche ; tout droit, la même
    const k = d === 'droite' ? ns - 1 : d === 'gauche' ? 0 : Math.min(e.voie, ns - 1);
    out.push(cle({ troncon: b.troncon, sens: b.sens, voie: k }));
  });
  // Jamais de voie sans issue : si aucune règle ne la mène nulle part, elle va partout où l'on peut aller
  if (!out.length) g.branches.forEach((b, j) => { if (j !== e.branche) out.push(cle({ troncon: b.troncon, sens: b.sens, voie: Math.min(e.voie, nbVoies(reseau.troncons[b.troncon], b.sens) - 1) })); });
  return out;
}

/**
 * Tous les mouvements d'un nœud : { [clé d'entrée]: [clé de sortie] } — ceux du joueur s'ils sont
 * encore valides (une branche a pu disparaître), sinon ceux par défaut.
 */
export function mouvementsDu(reseau, geoNoeud, idNoeud) {
  const { entrees, sorties } = voiesDu(reseau, geoNoeud), valides = new Set(sorties.map(cle));
  const choisis = reseau.noeuds[idNoeud]?.mouvements ?? {};
  const out = {};
  for (const e of entrees) {
    const k = cle(e), perso = (choisis[k] ?? []).filter(s => valides.has(s) && deCle(s).troncon !== e.troncon);
    out[k] = perso.length ? perso : parDefaut(reseau, geoNoeud, e);
  }
  return out;
}

/** Ajoute ou retire le mouvement entree → sortie. On ne retire pas le dernier d'une voie (elle ne mènerait nulle part). */
export function basculerMouvement(reseau, geoNoeud, idNoeud, entree, sortie) {
  const tous = mouvementsDu(reseau, geoNoeud, idNoeud);
  if (!(entree in tous)) return { refus: 'perdu' };
  if (deCle(sortie).troncon === deCle(entree).troncon) return { refus: 'demiTour' };
  const actuels = tous[entree], present = actuels.includes(sortie);
  if (present && actuels.length === 1) return { refus: 'dernierMouvement' };
  const nouveaux = present ? actuels.filter(s => s !== sortie) : [...actuels, sortie];
  const n = reseau.noeuds[idNoeud];
  return { reseau: { ...reseau, noeuds: { ...reseau.noeuds, [idNoeud]: { ...n, mouvements: { ...(n.mouvements ?? {}), [entree]: nouveaux } } } } };
}

/** Les flèches d'une voie qui arrive : l'ensemble de ses directions, dans l'ordre gauche, tout droit, droite. */
export function fleches(geoNoeud, mouvements, entree) {
  const e = deCle(entree), i = geoNoeud.branches.findIndex(b => b.troncon === e.troncon && b.sens === -e.sens);
  const dirs = new Set((mouvements[entree] ?? []).map(s => { const d = deCle(s); return direction(geoNoeud, i, geoNoeud.branches.findIndex(b => b.troncon === d.troncon && b.sens === d.sens)); }));
  return ['gauche', 'toutdroit', 'droite'].filter(d => dirs.has(d));
}
