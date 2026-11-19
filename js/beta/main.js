// Le jeu beta « Carte blanche » (v0.9.0) : une carte vierge en 3D, une route à
// double sens où passent des voitures, et trois outils — tirer une route depuis
// n'importe quel point d'une autre (en arc), doubler les voies d'un tronçon,
// lui ajouter une piste cyclable. Cycle de vie, commandes, sauvegarde.
// Les règles sont dans reseau.js et trafic.js (purs) ; le dessin dans scene.js.
import { createStore, autosave } from '../lib/save.js?v=0.9.0';
import { createI18n } from '../lib/i18n.js?v=0.9.0';
import { createLoop } from '../lib/loop.js?v=0.9.0';
import { startUpdateCheck, loadVersion } from '../lib/app-update.js?v=0.9.0';
import { creerHistorique } from '../historique.js?v=0.9.0';
import { ROLES, PALETTE_BETA } from '../palette.js?v=0.9.0';
import { contraindre, deplacer, tourner, zoomer } from '../scene/camera.js?v=0.9.0';
import { TEXTES_BETA } from './textes.js?v=0.9.0';
import { ROUTE, TRACE, DEPART, VEHICULES, TRAFIC, CAMERA } from './donnees.js?v=0.9.0';
import { reseauDepart, relireReseau, viser, accroche, projetRoute, construireRoute, basculerVoies, basculerVelo } from './reseau.js?v=0.9.0';
import { preparerTrafic, creerTrafic, avancer, reconcilier, poseVehicule, compter } from './trafic.js?v=0.9.0';
import { creerSceneBeta } from './scene.js?v=0.9.0';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

for (const [role, couleur] of Object.entries(ROLES)) document.documentElement.style.setProperty(`--jeu-${role}`, couleur);
for (const k of ['sol', 'velo', 'refus', 'apercu']) document.documentElement.style.setProperty(`--beta-${k}`, PALETTE_BETA[k]);

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
let ctx = preparerTrafic(historique.etat, ROUTE);
let trafic = creerTrafic(TRAFIC, DEBUG && params.has('seed') ? +params.get('seed') : TRAFIC.graine);
let outil = 'route';
let depart = null;      // l'accroche du départ d'une route en projet
let projet = null;      // la route en projet sous le pointeur
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
  ctx = preparerTrafic(historique.etat, ROUTE);
  reconcilier(trafic, ctx);
  scene.majReseau(historique.etat, ctx.geo);
  $('annuler').disabled = !historique.peutAnnuler;
  $('retablir').disabled = !historique.peutRetablir;
}
majReseau();

const sauvegarder = () => store.save('beta', { reseau: historique.etat, camera: cam });
autosave(sauvegarder, { everyMs: 10000 });

// ─── Outils ────────────────────────────────────────────────────────────────
function choisirOutil(o) {
  outil = o; depart = null; projet = null;
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
  const tr = reseau.troncons[v.troncon], g = ctx.geo.troncons[v.troncon];
  scene.majSurvol({ troncon: { ligne: g.axe, demi: g.demi } });
  etiquette(outil === 'voies' ? t(tr.voies > 1 ? 'survol.simple' : 'survol.doubler') : t(tr.velo ? 'survol.sansvelo' : 'survol.velo'));
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
function cliquer(p) {
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
  } else {
    const v = viser(reseau, p, rayonVisee());
    if (v) faire(outil === 'voies' ? basculerVoies(reseau, v.troncon, ROUTE) : basculerVelo(reseau, v.troncon));
  }
  majSurvol();
}

function annulerProjet() { if (!depart) return false; depart = null; projet = null; majSurvol(); return true; }
function annuler() { if (historique.annuler()) { annulerProjet(); majReseau(); sauvegarder(); majSurvol(); toast(t('toast.annule')); } }
function retablir() { if (historique.retablir()) { annulerProjet(); majReseau(); sauvegarder(); majSurvol(); toast(t('toast.retabli')); } }
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
});
vue.addEventListener('pointermove', e => {
  const ecran = local(e);
  if (geste) {
    const dx = ecran[0] - geste.dernier[0], dy = ecran[1] - geste.dernier[1];
    if (!geste.bouge && Math.hypot(ecran[0] - geste.depuis[0], ecran[1] - geste.depuis[1]) > 5) { geste.bouge = true; vue.classList.add('glisse'); }
    if (geste.bouge) {
      majCamera(geste.tourner ? tourner(cam, dx * 0.006, -dy * 0.005) : deplacer(cam, dx, dy, scene.metresParPixel()));
      geste.dernier = ecran;
      return;
    }
  }
  const sol = scene.sousPointeur(...ecran);
  pointeur = sol ? { sol, ecran } : null;
  majSurvol();
});
vue.addEventListener('pointerup', e => {
  const g = geste; geste = null;
  vue.classList.remove('glisse');
  if (!g || g.bouge) return;
  if (g.bouton === 2) { annulerProjet(); return; } // clic droit : on renonce à la route en projet
  if (g.bouton !== 0) return;
  const sol = scene.sousPointeur(...local(e));
  if (sol) cliquer(sol);
});
vue.addEventListener('pointerleave', () => { if (!geste) { pointeur = null; majSurvol(); } });
vue.addEventListener('wheel', e => {
  e.preventDefault();
  majCamera(zoomer(cam, Math.exp(e.deltaY * 0.0012)));
  majSurvol();
}, { passive: false });

// ─── Clavier ───────────────────────────────────────────────────────────────
const tenues = new Set();
const OUTILS = { Digit1: 'route', Digit2: 'voies', Digit3: 'velo', Numpad1: 'route', Numpad2: 'voies', Numpad3: 'velo' };
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (e.ctrlKey || e.metaKey) {
    if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); annuler(); }
    else if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); retablir(); }
    return;
  }
  if (OUTILS[e.code]) { choisirOutil(OUTILS[e.code]); return; }
  if (e.code === 'Escape') { if (!annulerProjet()) ouvrirMenu(); return; }
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
  const texte = t('compte', { voitures: n.voiture, velos: n.velo }) + (trafic.abandons ? t('compte.abandons', { n: trafic.abandons }) : '');
  if (texte !== dernierCompte) { $('compte').textContent = texte; dernierCompte = texte; }
}

let dernierePose = 0;
const boucle = createLoop({
  step: 1 / 30,
  update: dt => avancer(trafic, ctx, TRAFIC, VEHICULES, dt),
  render: () => {
    const maintenant = performance.now();
    clavierCamera(Math.min(0.05, (maintenant - (dernierePose || maintenant)) / 1000));
    dernierePose = maintenant;
    scene.majVehicules(trafic.vehicules.map(v => ({ mode: v.mode, id: v.id, ...poseVehicule(v, TRAFIC) })), VEHICULES);
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
  for (let i = 0; i < TRAFIC.prechauffage * 30; i++) avancer(trafic, ctx, TRAFIC, VEHICULES, 1 / 30);
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
  const { installDebug } = await import('../lib/debug.js?v=0.9.0');
  installDebug({
    state: () => ({
      outil, depart: depart && { ...depart }, projet: projet && { refus: projet.refus ?? null, longueur: projet.longueur, libre: !!projet.fin.libre },
      troncons: Object.keys(historique.etat.troncons).length, noeuds: Object.keys(historique.etat.noeuds).length,
      vehicules: compter(trafic), abandons: trafic.abandons, sortis: trafic.sortis, camera: cam,
    }),
    setTimeScale: s => boucle.setTimeScale(s),
    reset: () => { historique.reinitialiser(reseauDepart(DEPART)); majReseau(); },
    extra: {
      reseau: () => historique.etat,
      outil: choisirOutil,
      /** Survole puis clique le sol en (x, y) mètres, comme la souris. */
      survoler: (x, y) => { pointeur = { sol: [x, y], ecran: scene.versEcran([x, y]) }; majSurvol(); },
      cliquer: (x, y) => { pointeur = { sol: [x, y], ecran: scene.versEcran([x, y]) }; cliquer([x, y]); },
      ecran: (x, y) => scene.versEcran([x, y]),
      camera: e => majCamera({ ...cam, ...e }),
      annuler, retablir,
    },
  });
}
