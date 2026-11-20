// Le jeu beta « Carte blanche » (v0.9.0) : une carte vierge en 3D, une route à
// double sens où passent des voitures, des vélos et des piétons, et six outils en
// trois groupes — routes (tirer une route en arc, doubler les voies, démolir), vélo
// (pistes de chaque côté, piste à double sens), carrefours (feux et leurs durées).
// Cycle de vie, commandes, sauvegarde.
// Les règles sont dans reseau.js et roulage.js (purs ; jamais « trafic.js » : les bloqueurs de publicités le refusent) ; le dessin dans scene.js.
import { createStore, autosave } from '../lib/save.js?v=0.9.8';
import { createI18n } from '../lib/i18n.js?v=0.9.8';
import { createLoop } from '../lib/loop.js?v=0.9.8';
import { startUpdateCheck, loadVersion } from '../lib/app-update.js?v=0.9.8';
import { creerHistorique } from '../historique.js?v=0.9.8';
import { ROLES, PALETTE_BETA } from '../palette.js?v=0.9.8';
import { contraindre, deplacer, tourner, zoomer } from '../scene/camera.js?v=0.9.8';
import { TEXTES_BETA } from './textes.js?v=0.9.8';
import { ROUTE, TRACE, DEPART, VEHICULES, TRAFIC, CAMERA, FEUX, PIETONS } from './donnees.js?v=0.9.8';
import { reseauDepart, relireReseau, viser, accroche, projetRoute, construireRoute, basculerVoies, basculerVelo, demolir, basculerPisteDouble, coteDe, basculerFeux, reglerFeu, feuxDe, viserCarrefour, basculerBus, busDe, basculerIlot, basculerGiratoire, projeterSurLigne } from './reseau.js?v=0.9.8';
import { basculerMouvement, mouvementsDu, cle as cleVoie } from './mouvements.js?v=0.9.8';
import { ligneVoie, raccord } from './geometrie.js?v=0.9.8';
import { posePieton } from './pietons.js?v=0.9.8';
import { preparerTrafic, creerTrafic, avancer, reconcilier, poseVehicule, compter } from './roulage.js?v=0.9.8';
import { creerSceneBeta } from './scene.js?v=0.9.8';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

for (const [role, couleur] of Object.entries(ROLES)) document.documentElement.style.setProperty(`--jeu-${role}`, couleur);
for (const k of ['sol', 'velo', 'refus', 'apercu']) document.documentElement.style.setProperty(`--beta-${k}`, PALETTE_BETA[k]);
document.documentElement.style.setProperty('--beta-feux', PALETTE_BETA.feuOrange);
document.documentElement.style.setProperty('--beta-feuvert', PALETTE_BETA.feuVert);
document.documentElement.style.setProperty('--beta-voiebus', PALETTE_BETA.voieBus);

// Même préfixe que le jeu principal : la langue choisie là-bas vaut ici ; la carte beta a sa propre entrée
const store = createStore({
  game: 'urban-mobility-simulator',
  debug: DEBUG,
  entries: {
    beta: { version: 1 }, // { reseau, camera }
    prefs: { version: 1, debugWrites: false, defaults: { langue: (navigator.language || 'fr').startsWith('fr') ? 'fr' : 'en', expert: false } },
  },
});
const prefs = store.load('prefs');
const i18n = createI18n(TEXTES_BETA, { lang: prefs.langue });
const t = (k, v) => i18n.t(k, v);
document.documentElement.lang = i18n.lang;
i18n.apply(document);
document.title = `Urban Mobility Simulator — ${t('titre')} (${t('beta')})`;

let toastMinuteur = 0;
function toast(texte) {
  const el = $('toast');
  el.textContent = texte; el.hidden = false;
  clearTimeout(toastMinuteur);
  toastMinuteur = setTimeout(() => { el.hidden = true; }, 1800);
}

// ─── État ──────────────────────────────────────────────────────────────────
const sauve = store.load('beta');
const historique = creerHistorique(relireReseau(sauve?.reseau) || reseauDepart(DEPART));
let ctx = preparerTrafic(historique.etat, ROUTE, FEUX);
let trafic = creerTrafic(TRAFIC, DEBUG && params.has('seed') ? +params.get('seed') : TRAFIC.graine);
let outil = 'route';
let depart = null;      // l'accroche du départ d'une route en projet
let projet = null;      // la route en projet sous le pointeur
let carrefourChoisi = null; // le carrefour dont le panneau des feux est ouvert
let carrefourMouvements = null; // le carrefour montré dans la vue « Mouvements »
let tirage = null; // { entree, depuis } : une liaison qu'on tire depuis une voie qui arrive
let pointeur = null;    // [x, y] au sol, et position écran
let pauseJoueur = false;
let vitesse = 1;
const VITESSES = [1, 2, 4];

// ─── Scène ─────────────────────────────────────────────────────────────────
const vue = $('vue');
const scene = creerSceneBeta({ conteneur: vue, P: PALETTE_BETA, R: ROUTE, C: CAMERA });
scene.dessinerLimite(TRACE.zone);
const limites = { boite: CAMERA.boite, distanceMin: CAMERA.distanceMin, distanceMax: CAMERA.distanceMax, inclinaisonMax: CAMERA.inclinaisonMax };
const cameraDepart = () => ({ cible: [0, 40], distance: CAMERA.distance, azimut: CAMERA.azimut, inclinaison: CAMERA.inclinaison });
let cam = contraindre(sauve?.camera?.cible ? sauve.camera : cameraDepart(), limites);
const majCamera = e => { cam = contraindre(e, limites); scene.appliquerCamera(cam); };
majCamera(cam);

function majReseau() {
  queueMicrotask(() => { if (outil === 'mouvements') majVueMouvements(); });
  ctx = preparerTrafic(historique.etat, ROUTE, FEUX);
  reconcilier(trafic, ctx);
  scene.majReseau(historique.etat, ctx.geo);
  majPanneauFeux();
  $('annuler').disabled = !historique.peutAnnuler;
  $('retablir').disabled = !historique.peutRetablir;
}
majReseau();

const sauvegarder = () => store.save('beta', { reseau: historique.etat, camera: cam });
autosave(sauvegarder, { everyMs: 10000 });

// ─── Outils ────────────────────────────────────────────────────────────────
function choisirOutil(o) {
  outil = o; depart = null; projet = null;
  if (o !== 'feux') carrefourChoisi = null;
  if (o !== 'mouvements') { carrefourMouvements = null; tirage = null; scene.majMouvements(null); }
  majPanneauFeux();
  for (const b of document.querySelectorAll('[data-outil]')) b.setAttribute('aria-pressed', String(b.dataset.outil === o));
  majSurvol();
  window.__jeu?.log('outil', { outil });
}
for (const b of document.querySelectorAll('[data-outil]')) b.onclick = () => { choisirOutil(b.dataset.outil); vue.focus(); };

/** Rayon de visée : au moins TRACE.visee, et au moins 12 px à l'écran quand on regarde de loin. */
const rayonVisee = () => Math.max(TRACE.visee, 12 * scene.metresParPixel());

function etiquette(texte, refus) {
  const el = $('etiquette');
  if (!texte || !pointeur) { el.hidden = true; return; }
  el.textContent = texte; el.hidden = false;
  el.classList.toggle('refus', !!refus);
  el.style.left = `${pointeur.ecran[0]}px`; el.style.top = `${pointeur.ecran[1]}px`;
}

/** Ce que montre le survol, et ce que dira l'aide. */
function majSurvol() {
  const reseau = historique.etat;
  $('aide').textContent = outil === 'route' ? t(depart ? 'aide.route.trace' : 'aide.route.depart') : t(`aide.${outil}`);
  if (!pointeur) { scene.majSurvol(); etiquette(null); return; }
  const p = pointeur.sol;
  if (outil === 'feux') { survolFeux(p); return; }
  if (outil === 'giratoire') {
    const c = carrefourVise(p);
    if (!c) { scene.majSurvol(); etiquette(null); return; }
    const r = basculerGiratoire(reseau, c.noeud);
    scene.majSurvol({ carrefour: { p: c.geo.p, rayon: c.geo.recul + 2, refus: !!r.refus } });
    etiquette(r.refus ? t(`refus.${r.refus}`) : t(`survol.giratoire.${r.reseau.noeuds[c.noeud].giratoire ?? 'aucun'}`), !!r.refus);
    return;
  }
  if (outil === 'mouvements') { survolMouvements(p); return; }
  if (outil === 'route' && depart) {
    projet = projetRoute(reseau, depart, p, ROUTE, TRACE);
    scene.majSurvol({ projet });
    const m = Math.round(projet.longueur);
    etiquette(projet.refus ? t(`refus.${projet.refus}`) : t(projet.fin.libre ? 'survol.construire' : 'survol.raccorder', { m }), projet.refus);
    return;
  }
  const v = viser(reseau, p, rayonVisee());
  if (!v) { scene.majSurvol(); etiquette(null); return; }
  if (outil === 'route') {
    const a = accroche(reseau, v, TRACE);
    scene.majSurvol({ point: a.p });
    etiquette(t('survol.depart'));
    return;
  }
  const tr = reseau.troncons[v.troncon], g = ctx.geo.troncons[v.troncon], troncon = { ligne: g.axe, g: g.g, d: g.d };
  if (outil === 'demolir') {
    // Ce qui partirait, en rouge ; un tronçon du bord ne se démolit pas : l'étiquette dit pourquoi
    const r = demolir(reseau, v.troncon);
    scene.majSurvol({ troncon: { ...troncon, demolir: true } });
    etiquette(r.refus ? t(`refus.${r.refus}`) : t('survol.demolir'), true);
    return;
  }
  if (outil === 'ilot') {
    // Ce que fera le clic : aucun → refuges → terre-plein → aucun
    const r = basculerIlot(reseau, v.troncon, ROUTE, TRACE);
    scene.majSurvol({ troncon });
    etiquette(r.refus ? t(`refus.${r.refus}`) : t(`survol.ilot.${r.reseau.troncons[v.troncon].ilot ?? 'aucun'}`), !!r.refus);
    return;
  }
  if (outil === 'bus') {
    // La voie bus du sens qui roule de ce côté
    const cote = coteDe(reseau, v.troncon, p), r = basculerBus(reseau, v.troncon, cote);
    scene.majSurvol({ troncon: { ...troncon, cote } });
    etiquette(r.refus ? t(`refus.${r.refus}`) : t(busDe(tr)[cote === 'gauche' ? 'g' : 'd'] ? 'survol.sansbus' : 'survol.bus'), !!r.refus);
    return;
  }
  if (outil === 'double') {
    // Le côté sous le pointeur : la piste à double sens s'y posera
    const cote = coteDe(reseau, v.troncon, p);
    scene.majSurvol({ troncon: { ...troncon, cote } });
    const k = cote === 'gauche' ? 'g' : 'd', r = basculerPisteDouble(reseau, v.troncon, cote, ROUTE, TRACE);
    etiquette(r.refus ? t(`refus.${r.refus}`) : t(tr.pistes[k] === 'double' ? 'survol.sansdouble' : 'survol.double'), !!r.refus);
    return;
  }
  scene.majSurvol({ troncon });
  if (outil === 'voies') {
    // Ce que fera le clic (une voie de plus par sens), ou pourquoi il ne marchera pas ; Maj + clic : une de moins
    const r = basculerVoies(reseau, v.troncon, ROUTE, TRACE, pointeur.maj ? -1 : 1), n = r.reseau?.troncons[v.troncon].voies;
    etiquette(r.refus ? t(`refus.${r.refus}`) : n === 1 ? t('survol.simple') : t('survol.voies', { n }), !!r.refus);
    return;
  }
  const simples = tr.pistes.g === 'simple' && tr.pistes.d === 'simple', r = basculerVelo(reseau, v.troncon, ROUTE, TRACE);
  etiquette(r.refus ? t(`refus.${r.refus}`) : t(simples ? 'survol.sansvelo' : tr.pistes.g || tr.pistes.d ? 'survol.velodeux' : 'survol.velo'), !!r.refus);
}

/** Le carrefour sous le pointeur (outil Feux). */
function carrefourVise(p) {
  const c = viserCarrefour(historique.etat, p, Math.max(18, rayonVisee()));
  return c && { ...c, geo: ctx.geo.noeuds[c.noeud] };
}
function survolFeux(p) {
  const c = carrefourVise(p);
  if (!c) { scene.majSurvol(); etiquette(null); return; }
  scene.majSurvol({ carrefour: { p: c.geo.p, rayon: c.geo.recul + ROUTE.largeurTraversee + 2 } });
  etiquette(t(historique.etat.noeuds[c.noeud].feux ? 'survol.reglerFeux' : 'survol.poserFeux'));
}

function faire(resultat, message) {
  if (resultat.refus) { toast(t(`refus.${resultat.refus}`)); return false; }
  historique.faire(resultat.reseau);
  majReseau();
  sauvegarder();
  if (message) toast(message);
  window.__jeu?.log('reseau', { troncons: Object.keys(historique.etat.troncons).length });
  return true;
}

/** Un clic sur le sol, en mètres. */
function cliquer(p, maj = false) {
  const reseau = historique.etat;
  if (outil === 'route') {
    if (depart) {
      const pr = projetRoute(reseau, depart, p, ROUTE, TRACE);
      if (pr.refus) { toast(t(`refus.${pr.refus}`)); return; }
      if (faire(construireRoute(reseau, pr, TRACE), t('toast.construite'))) { depart = null; projet = null; }
    } else {
      const v = viser(reseau, p, rayonVisee());
      if (v) depart = accroche(reseau, v, TRACE);
    }
  } else if (outil === 'giratoire') {
    const c = carrefourVise(p);
    if (c) faire(basculerGiratoire(reseau, c.noeud), t('toast.giratoire'));
  } else if (outil === 'mouvements') {
    cliquerMouvements(p);
  } else if (outil === 'feux') {
    const c = carrefourVise(p);
    if (!c) { carrefourChoisi = null; majPanneauFeux(); return; }
    if (!reseau.noeuds[c.noeud].feux) faire(basculerFeux(reseau, c.noeud, FEUX), t('toast.feux'));
    carrefourChoisi = c.noeud;
    majPanneauFeux();
  } else {
    const v = viser(reseau, p, rayonVisee());
    if (v) {
      if (outil === 'demolir') faire(demolir(reseau, v.troncon), t('toast.demolie'));
      else if (outil === 'ilot') faire(basculerIlot(reseau, v.troncon, ROUTE, TRACE));
      else if (outil === 'bus') faire(basculerBus(reseau, v.troncon, coteDe(reseau, v.troncon, p)));
      else if (outil === 'double') faire(basculerPisteDouble(reseau, v.troncon, coteDe(reseau, v.troncon, p), ROUTE, TRACE));
      else faire(outil === 'voies' ? basculerVoies(reseau, v.troncon, ROUTE, TRACE, maj ? -1 : 1) : basculerVelo(reseau, v.troncon, ROUTE, TRACE));
    }
  }
  majSurvol();
}

function annulerProjet() { if (!depart) return false; depart = null; projet = null; majSurvol(); return true; }
function annuler() { if (historique.annuler()) { annulerProjet(); majReseau(); sauvegarder(); majSurvol(); toast(t('toast.annule')); } }
function retablir() { if (historique.retablir()) { annulerProjet(); majReseau(); sauvegarder(); majSurvol(); toast(t('toast.retabli')); } }
// ─── Vue « Mouvements » : les liaisons voie à voie d'un carrefour ───────────
/** Ce qu'on voit du carrefour choisi : ses liaisons (raccords), les bouts des voies qui arrivent et qui partent. */
function vueMouvements() {
  const id = carrefourMouvements, n = id && ctx.geo.noeuds[id];
  if (!n) return null;
  const mv = mouvementsDu(historique.etat, n, id), liens = [], entrees = [], sorties = [];
  for (const [e, liste] of Object.entries(mv)) {
    const [te, se, ve] = e.split('|'), le = ligneVoie(ctx.geo, { troncon: te, sens: +se, voie: +ve });
    entrees.push({ cle: e, p: le[le.length - 1] });
    for (const sc of liste) {
      const [ts, ss, vs] = sc.split('|'), ls = ligneVoie(ctx.geo, { troncon: ts, sens: +ss, voie: +vs });
      liens.push({ entree: e, sortie: sc, ligne: raccord(le, ls) });
    }
  }
  n.branches.forEach(b => { const t = historique.etat.troncons[b.troncon]; for (let k = 0; k < t.voies; k++) { const l = ligneVoie(ctx.geo, { troncon: b.troncon, sens: b.sens, voie: k }); sorties.push({ cle: cleVoie({ troncon: b.troncon, sens: b.sens, voie: k }), p: l[0] }); } });
  return { id, n, liens, entrees, sorties };
}
const proche = (liste, p, r) => liste.reduce((best, x) => { const d = Math.hypot(x.p[0] - p[0], x.p[1] - p[1]); return d < r && (!best || d < best.d) ? { ...x, d } : best; }, null);
function lienSous(vue, p) {
  let best = null;
  for (const l of vue.liens) { const pr = projeterSurLigne(l.ligne, p); if (pr.d < 0.9 && (!best || pr.d < best.d)) best = { ...l, d: pr.d }; }
  return best;
}
function majVueMouvements(survolLien = null) {
  const vue = vueMouvements();
  if (!vue) { scene.majMouvements(null); return vue; }
  const apercu = tirage && pointeur ? { ligne: [tirage.p, pointeur.sol], refus: !proche(vue.sorties, pointeur.sol, 2) } : null;
  scene.majMouvements({ liens: vue.liens.map(l => ({ ligne: l.ligne, survol: survolLien && l.entree === survolLien.entree && l.sortie === survolLien.sortie })), entrees: vue.entrees.map(e => e.p), sorties: vue.sorties.map(s => s.p), apercu });
  return vue;
}
function survolMouvements(p) {
  const vue = vueMouvements();
  if (!vue) {
    // Pas encore de carrefour choisi : on montre celui qu'un clic ouvrirait
    const c = carrefourVise(p);
    scene.majSurvol(c ? { carrefour: { p: c.geo.p, rayon: c.geo.recul + 2, refus: !!c.geo.giratoire } } : {});
    etiquette(c ? t(c.geo.giratoire ? 'refus.mouvementsGiratoire' : 'survol.mouvements') : null, c?.geo.giratoire);
    return;
  }
  scene.majSurvol();
  if (tirage) { majVueMouvements(); const s = proche(vue.sorties, p, 2); etiquette(t(s ? 'survol.lier' : 'survol.tirer'), !s); return; }
  const e = proche(vue.entrees, p, 1.6), l = !e && lienSous(vue, p);
  majVueMouvements(l);
  etiquette(e ? t('survol.tirer') : l ? t('survol.couper') : null, !!l);
}
function cliquerMouvements(p) {
  const vue = vueMouvements();
  const l = vue && lienSous(vue, p);
  if (l) { faire(basculerMouvement(historique.etat, vue.n, vue.id, l.entree, l.sortie)); majVueMouvements(); return; }
  const c = carrefourVise(p);
  if (c?.geo.giratoire) { toast(t('refus.mouvementsGiratoire')); return; }
  carrefourMouvements = c ? c.noeud : null;
  majVueMouvements();
}

// ─── Panneau des feux : la durée du vert de chaque phase ───────────────────
const BOUSSOLE = ['e', 'ne', 'n', 'no', 'o', 'so', 's', 'se'];
const directionDe = dir => BOUSSOLE[((Math.round(Math.atan2(dir[1], dir[0]) / (Math.PI / 4)) % 8) + 8) % 8];
function majPanneauFeux() {
  const el = $('panneau-feux');
  const feux = carrefourChoisi && feuxDe(historique.etat, carrefourChoisi, FEUX);
  if (!feux || outil !== 'feux') { el.hidden = true; carrefourChoisi = feux ? carrefourChoisi : null; return; }
  const g = ctx.geo.noeuds[carrefourChoisi];
  const lignes = feux.verts.map((v, i) => ({ phase: i, nom: t('feux.depuis', { dir: t(`dir.${directionDe(pointAxe(g.branches[i]))}`) }), v }));
  lignes.push({ phase: 'pietons', nom: t('feux.pietons'), v: feux.pietons });
  el.replaceChildren();
  const tete = document.createElement('div'); tete.className = 'feux-tete';
  const h = document.createElement('h2'); h.textContent = t('feux.titre');
  const fermer = document.createElement('button'); fermer.className = 'bouton feux-fermer'; fermer.textContent = '×'; fermer.setAttribute('aria-label', t('feux.fermer'));
  fermer.onclick = () => { carrefourChoisi = null; majPanneauFeux(); vue.focus(); };
  tete.append(h, fermer);
  el.append(tete);
  for (const l of lignes) {
    const ligne = document.createElement('div'); ligne.className = 'feux-ligne'; ligne.dataset.phase = l.phase;
    const nom = document.createElement('span'); nom.className = 'feux-nom'; nom.textContent = l.nom;
    const moins = document.createElement('button'); moins.className = 'bouton'; moins.textContent = '−'; moins.setAttribute('aria-label', t('feux.moins', { nom: l.nom }));
    const val = document.createElement('output'); val.textContent = t('feux.secondes', { s: l.v });
    const plus = document.createElement('button'); plus.className = 'bouton'; plus.textContent = '+'; plus.setAttribute('aria-label', t('feux.plus', { nom: l.nom }));
    moins.disabled = l.v <= FEUX.min; plus.disabled = l.v >= FEUX.max;
    moins.onclick = () => faire(reglerFeu(historique.etat, carrefourChoisi, l.phase, -FEUX.pas, FEUX));
    plus.onclick = () => faire(reglerFeu(historique.etat, carrefourChoisi, l.phase, +FEUX.pas, FEUX));
    ligne.append(nom, moins, val, plus);
    el.append(ligne);
  }
  const retirer = document.createElement('button'); retirer.className = 'bouton feux-retirer'; retirer.textContent = t('feux.retirer');
  retirer.onclick = () => { const id = carrefourChoisi; carrefourChoisi = null; faire(basculerFeux(historique.etat, id, FEUX), t('toast.sansfeux')); vue.focus(); };
  el.append(retirer);
  el.hidden = false;
  majPhaseCourante();
}
const pointAxe = b => { const e = b.ext; return [e[1][0] - e[0][0], e[1][1] - e[0][1]]; };
/** La phase au vert est soulignée dans le panneau. */
function majPhaseCourante() {
  if (!carrefourChoisi || $('panneau-feux').hidden) return;
  const etat = trafic.feux[carrefourChoisi];
  for (const l of $('panneau-feux').querySelectorAll('.feux-ligne')) l.classList.toggle('en-cours', !!etat && String(etat.phase) === l.dataset.phase);
}

$('annuler').onclick = annuler;
$('retablir').onclick = retablir;

// ─── Souris ────────────────────────────────────────────────────────────────
const local = e => { const r = vue.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
let geste = null; // { bouton, depuis: [px, py], dernier, bouge }
vue.addEventListener('contextmenu', e => e.preventDefault());
vue.addEventListener('pointerdown', e => {
  vue.focus({ preventScroll: true });
  vue.setPointerCapture(e.pointerId);
  const ecran = local(e);
  geste = { bouton: e.button, tourner: e.button === 2 || (e.button === 0 && e.shiftKey) || e.button === 1, depuis: ecran, dernier: ecran, bouge: false };
  // Vue « Mouvements » : on tire une liaison depuis le bout d'une voie qui arrive (au lieu de déplacer la vue)
  if (outil === 'mouvements' && e.button === 0) {
    const vue = vueMouvements(), sol = scene.sousPointeur(...ecran), en = vue && sol && proche(vue.entrees, sol, 1.6);
    if (en) { tirage = { entree: en.cle, p: en.p }; geste.tirage = true; }
  }
});
vue.addEventListener('pointermove', e => {
  const ecran = local(e);
  if (geste) {
    const dx = ecran[0] - geste.dernier[0], dy = ecran[1] - geste.dernier[1];
    if (!geste.bouge && Math.hypot(ecran[0] - geste.depuis[0], ecran[1] - geste.depuis[1]) > 5) { geste.bouge = true; vue.classList.add('glisse'); }
    if (geste.tirage) {
      const sol = scene.sousPointeur(...ecran);
      pointeur = sol ? { sol, ecran, maj: e.shiftKey } : pointeur;
      geste.bouge = true;
      majSurvol();
      return;
    }
    if (geste.bouge) {
      majCamera(geste.tourner ? tourner(cam, dx * 0.006, -dy * 0.005) : deplacer(cam, dx, dy, scene.metresParPixel()));
      geste.dernier = ecran;
      return;
    }
  }
  const sol = scene.sousPointeur(...ecran);
  pointeur = sol ? { sol, ecran, maj: e.shiftKey } : null;
  majSurvol();
});
vue.addEventListener('pointerup', e => {
  const g = geste; geste = null;
  vue.classList.remove('glisse');
  if (g?.tirage) {
    // Lâché sur le bout d'une voie qui part : la liaison s'ajoute (ou se retire si elle existait)
    const vue = vueMouvements(), sol = scene.sousPointeur(...local(e)), s = vue && sol && proche(vue.sorties, sol, 2), en = tirage;
    tirage = null;
    if (s && g.bouge) faire(basculerMouvement(historique.etat, vue.n, vue.id, en.entree, s.cle));
    majVueMouvements(); majSurvol();
    return;
  }
  if (!g || g.bouge) return;
  if (g.bouton === 2) { annulerProjet(); return; } // clic droit : on renonce à la route en projet
  if (g.bouton !== 0) return;
  const sol = scene.sousPointeur(...local(e));
  if (sol) cliquer(sol, e.shiftKey);
});
vue.addEventListener('pointerleave', () => { if (!geste) { pointeur = null; majSurvol(); } });
vue.addEventListener('wheel', e => {
  e.preventDefault();
  majCamera(zoomer(cam, Math.exp(e.deltaY * 0.0012)));
  majSurvol();
}, { passive: false });

// ─── Clavier ───────────────────────────────────────────────────────────────
const tenues = new Set();
const ORDRE = ['route', 'voies', 'demolir', 'velo', 'double', 'feux', 'bus', 'ilot', 'giratoire', 'mouvements'];
const OUTILS = { Delete: 'demolir' };
ORDRE.forEach((o, i) => { OUTILS[`Digit${(i + 1) % 10}`] = o; OUTILS[`Numpad${(i + 1) % 10}`] = o; });
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (e.ctrlKey || e.metaKey) {
    if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); annuler(); }
    else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); retablir(); }
    return;
  }
  if (OUTILS[e.code]) { choisirOutil(OUTILS[e.code]); return; }
  if (e.code === 'Escape') { if (annulerProjet()) return; if (carrefourMouvements) { carrefourMouvements = null; tirage = null; majVueMouvements(); return; } if (carrefourChoisi) { carrefourChoisi = null; majPanneauFeux(); return; } ouvrirMenu(); return; }
  if (e.code === 'Space') { e.preventDefault(); basculerPause(); return; }
  if (e.code === 'KeyX') { changerVitesse(); return; }
  if (e.code === 'Home') { majCamera(cameraDepart()); return; }
  if (/^(Arrow|Key[WASDQE]|Equal|Minus|NumpadAdd|NumpadSubtract)/.test(e.code)) { tenues.add(e.code); e.preventDefault(); }
});
document.addEventListener('keyup', e => tenues.delete(e.code));
window.addEventListener('blur', () => tenues.clear());
function clavierCamera(dt) {
  if (!tenues.size) return;
  const k = CAMERA.vitesseClavier * dt, has = (...c) => c.some(x => tenues.has(x));
  let e = cam;
  const dx = (has('ArrowLeft', 'KeyA') ? k : 0) - (has('ArrowRight', 'KeyD') ? k : 0);
  const dy = (has('ArrowUp', 'KeyW') ? k : 0) - (has('ArrowDown', 'KeyS') ? k : 0);
  if (dx || dy) e = deplacer(e, dx, dy, scene.metresParPixel());
  if (has('KeyQ')) e = tourner(e, -1.5 * dt, 0);
  if (has('KeyE')) e = tourner(e, 1.5 * dt, 0);
  if (has('Equal', 'NumpadAdd')) e = zoomer(e, Math.exp(-1.5 * dt));
  if (has('Minus', 'NumpadSubtract')) e = zoomer(e, Math.exp(1.5 * dt));
  majCamera(e);
}

// ─── Temps ─────────────────────────────────────────────────────────────────
function basculerPause() {
  pauseJoueur = !pauseJoueur;
  $('pause').setAttribute('aria-pressed', String(pauseJoueur));
  $('pause-texte').textContent = t(pauseJoueur ? 'reprendre' : 'pause');
  majBoucle();
}
function changerVitesse() {
  vitesse = VITESSES[(VITESSES.indexOf(vitesse) + 1) % VITESSES.length];
  boucle.setTimeScale(vitesse);
  $('vitesse-texte').textContent = t('vitesse', { n: vitesse });
}
$('pause').onclick = basculerPause;
$('vitesse').onclick = changerVitesse;
$('vitesse-texte').textContent = t('vitesse', { n: vitesse });

let dernierCompte = '';
function majCompte() {
  const n = compter(trafic);
  const texte = t('compte', { voitures: n.voiture, velos: n.velo, bus: n.bus, pietons: trafic.pietons.length }) + (trafic.abandons ? t('compte.abandons', { n: trafic.abandons }) : '');
  if (texte !== dernierCompte) { $('compte').textContent = texte; dernierCompte = texte; }
}

let dernierePose = 0;
const boucle = createLoop({
  step: 1 / 30,
  update: dt => avancer(trafic, ctx, TRAFIC, VEHICULES, dt, PIETONS),
  render: () => {
    const maintenant = performance.now();
    clavierCamera(Math.min(0.05, (maintenant - (dernierePose || maintenant)) / 1000));
    dernierePose = maintenant;
    scene.majVehicules(trafic.vehicules.map(v => ({ mode: v.mode, id: v.id, ...poseVehicule(v, TRAFIC) })), VEHICULES);
    scene.majPietons(trafic.pietons.map(p => ({ id: p.id, ...posePieton(p, PIETONS) })), VEHICULES.pieton);
    scene.majFeux(trafic.feux);
    majPhaseCourante();
    scene.rendre();
    majCompte();
  },
});
// Pause sur modale ou perte de focus (section 9) ; le rendu continue (la caméra bouge encore)
function majBoucle() {
  const arret = pauseJoueur || !!document.querySelector('dialog[open]') || !document.hasFocus();
  if (arret) boucle.pause(); else boucle.resume();
}
window.addEventListener('blur', majBoucle);
window.addEventListener('focus', majBoucle);

// ─── Menu ──────────────────────────────────────────────────────────────────
function ouvrirMenu() { $('dialogue-menu').showModal(); majBoucle(); }
$('ouvrir-menu').onclick = ouvrirMenu;
$('menu-reprendre').onclick = () => $('dialogue-menu').close();
$('menu-recentrer').onclick = () => { $('dialogue-menu').close(); majCamera(cameraDepart()); };
$('menu-nouvelle').onclick = () => {
  const d = $('dialogue-confirmer');
  d.onclose = () => {
    if (d.returnValue !== 'oui') return;
    $('dialogue-menu').close();
    historique.reinitialiser(reseauDepart(DEPART));
    trafic = creerTrafic(TRAFIC);
    depart = null; projet = null;
    majReseau(); prechauffer(); sauvegarder(); majSurvol();
  };
  d.showModal();
};
for (const d of document.querySelectorAll('dialog')) d.addEventListener('close', () => { majBoucle(); vue.focus(); });
$('retour').addEventListener('click', sauvegarder);

// ─── Démarrage ─────────────────────────────────────────────────────────────
/** La route de départ est longue (ses bouts sont dans la brume) : on fait rouler le trafic avant d'ouvrir. */
function prechauffer() {
  for (let i = 0; i < TRAFIC.prechauffage * 30; i++) avancer(trafic, ctx, TRAFIC, VEHICULES, 1 / 30, PIETONS);
}
prechauffer();
choisirOutil('route');
loadVersion().then(v => { if (v?.version) $('version').textContent = `v${v.version}`; }).catch(() => {});
startUpdateCheck({ isBusy: () => !!depart, beforeReload: sauvegarder, onUpdated: v => toast(t('toast.maj', { v })) });
boucle.start();
majBoucle();
$('chargement').hidden = true;
vue.focus();

// ─── Mode debug (section 18) ───────────────────────────────────────────────
if (DEBUG) {
  const { installDebug } = await import('../lib/debug.js?v=0.9.8');
  installDebug({
    state: () => ({
      outil, depart: depart && { ...depart }, projet: projet && { refus: projet.refus ?? null, longueur: projet.longueur, libre: !!projet.fin.libre },
      troncons: Object.keys(historique.etat.troncons).length, noeuds: Object.keys(historique.etat.noeuds).length,
      vehicules: compter(trafic), pietons: trafic.pietons.length, feux: Object.keys(ctx.feux).length, carrefourChoisi, abandons: trafic.abandons, sortis: trafic.sortis, camera: cam,
    }),
    setTimeScale: s => boucle.setTimeScale(s),
    reset: () => { historique.reinitialiser(reseauDepart(DEPART)); majReseau(); },
    extra: {
      reseau: () => historique.etat,
      outil: choisirOutil,
      /** Survole puis clique le sol en (x, y) mètres, comme la souris. */
      survoler: (x, y) => { pointeur = { sol: [x, y], ecran: scene.versEcran([x, y]) }; majSurvol(); },
      cliquer: (x, y, maj = false) => { pointeur = { sol: [x, y], ecran: scene.versEcran([x, y]), maj }; cliquer([x, y], maj); },
      ecran: (x, y) => scene.versEcran([x, y]),
      camera: e => majCamera({ ...cam, ...e }),
      vueMouvements: () => { const v = vueMouvements(); return v && { id: v.id, entrees: v.entrees, sorties: v.sorties, liens: v.liens.length }; },
      annuler, retablir,
    },
  });
}
