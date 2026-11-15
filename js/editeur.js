// L'éditeur de section transversale (v0.3) : un bandeau sous la carte, avec la
// coupe à l'échelle (bandes, limites à glisser, espace libre), les outils de la
// bande choisie et le message du dernier refus. Ce module dessine et écoute :
// il ne modifie jamais la section, il demande à main.js (surOperation…), qui
// applique les règles de js/section.js et tient l'historique.
import { BANDES, SENS, LARGEURS } from './data/bandes.js?v=0.3.0';
import { libre } from './section.js?v=0.3.0';

/**
 * racine : l'élément du bandeau ; P : palette ; t, lang : textes.
 * rappels : surOperation(nom, args, { apercu }) → { refus? } ; surAnnuler(), surRetablir(), surMesure(), surFermer(),
 *           surChoixBande(id | null) : la bande choisie a changé (pour la carte et la 3D).
 */
export function creerEditeur({ racine, P, t: tr, lang: langue, rappels }) {
  let t = tr, lang = langue;
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  const nombre = n => n.toLocaleString(lang === 'en' ? 'en-GB' : 'fr-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  let section = null, info = null, choisie = null, glisse = null;

  // Fond d'une bande : sa teinte, et pour certaines un motif (jamais la couleur seule : le sigle est écrit dessus)
  const fond = type => {
    const b = BANDES[type], c = P[b.couleur];
    const raye = (trait) => `repeating-linear-gradient(135deg, ${c} 0 6px, ${trait} 6px 7.5px)`;
    return { velo: raye(P.voirie), hachures: raye(P.bord), inconnu: raye(P.inconnu) }[b.motif] ?? c;
  };
  const texteSur = type => (BANDES[type].couleur === 'encre' ? P.voirie : P.encre);

  const bouton = (cle, onclick, extra = {}) => el('button', { type: 'button', className: 'bouton editeur-bouton', textContent: t(cle), onclick, ...extra });

  // Le message du dernier ordre (refus écrit) ; sans message, la ligne rappelle les commandes
  let dernier = { texte: '', refus: false };
  function message(texte = '', refus = false) {
    dernier = { texte, refus };
    const m = racine.querySelector('.editeur-message');
    if (!m) return;
    m.textContent = texte || t('editeur.aide');
    m.classList.toggle('refus', refus);
  }

  function operer(nom, args, opts = {}) {
    const r = rappels.surOperation(nom, args, opts);
    if (r?.refus) message(t(`refus.${r.refus}`, r.valeurs), true);
    else if (!opts.apercu) message('');
    return r;
  }

  function choisir(id) {
    choisie = id;
    rappels.surChoixBande?.(id);
    dessiner();
  }

  // ─── La coupe : bandes à l'échelle, limites, espace libre ────────────────
  function ruban() {
    const total = section.emprise;
    const r = el('div', { className: 'editeur-ruban', role: 'listbox' });
    r.setAttribute('aria-label', t('editeur.titre'));
    section.bandes.forEach((b, i) => {
      const nom = t(`bande.${b.type}`);
      const d = el('div', { className: `editeur-bande${b.id === choisie ? ' choisie' : ''}`, role: 'option', tabIndex: 0 },
        el('span', { className: 'editeur-sigle', textContent: t(`bande.${b.type}.sigle`) + (b.sens ? ` ${t(`sens.${b.sens}.signe`)}` : '') }),
        el('span', { className: 'editeur-mesure', textContent: nombre(b.largeur) }));
      d.dataset.bande = b.id;
      d.style.flexGrow = String(b.largeur / total);
      d.style.background = fond(b.type);
      d.style.setProperty('--fond-texte', P[BANDES[b.type].couleur]); // le texte garde un fond uni sur les motifs
      d.style.color = texteSur(b.type);
      d.title = `${nom} · ${nombre(b.largeur)} m${b.sens ? ` · ${t(`sens.${b.sens}`)}` : ''}`;
      d.setAttribute('aria-selected', String(b.id === choisie));
      d.setAttribute('aria-label', d.title);
      d.onclick = () => choisir(b.id);
      d.onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(b.id); }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); retirerChoisie(b.id); }
      };
      r.append(d);
      // La limite droite de chaque bande (après la dernière : la limite avec l'espace libre)
      r.append(limite(i));
    });
    const reste = libre(section);
    if (reste > 0) {
      const l = el('div', { className: 'editeur-libre', textContent: nombre(reste) });
      l.style.flexGrow = String(reste / total);
      l.style.background = `repeating-linear-gradient(45deg, ${P.papier} 0 6px, ${P.trottoir} 6px 9px)`;
      l.title = `${t('editeur.libre-bande')} · ${nombre(reste)} m`;
      r.append(l);
    }
    return r;
  }

  function limite(i) {
    const a = section.bandes[i], b = section.bandes[i + 1];
    const h = el('div', { className: 'editeur-limite', role: 'separator', tabIndex: 0 });
    h.dataset.limite = String(i);
    h.setAttribute('aria-orientation', 'vertical');
    h.setAttribute('aria-label', t('editeur.limite', { a: t(`bande.${a.type}`), b: b ? t(`bande.${b.type}`) : t('editeur.libre-bande') }));
    h.setAttribute('aria-valuenow', String(a.largeur));
    h.onkeydown = e => {
      const pas = (e.shiftKey ? LARGEURS.grandPas : LARGEURS.pas) * ({ ArrowLeft: -1, ArrowRight: 1 }[e.key] ?? 0);
      if (!pas) return;
      e.preventDefault();
      e.stopPropagation();
      operer('deplacerLimite', [i, pas]);
      racine.querySelector(`[data-limite="${i}"]`)?.focus();
    };
    // Glisser : un aperçu à chaque mouvement (sans historique), une seule opération au lâcher
    h.onpointerdown = e => {
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      const largeurPx = racine.querySelector('.editeur-ruban').getBoundingClientRect().width;
      glisse = { i, x0: e.clientX, mParPx: section.emprise / largeurPx, delta: 0 };
      // La bande devient la choisie sans redessiner : la limite doit garder le pointeur
      choisie = a.id;
      racine.querySelectorAll('.editeur-bande').forEach(d => { d.classList.toggle('choisie', d.dataset.bande === a.id); d.setAttribute('aria-selected', String(d.dataset.bande === a.id)); });
      rappels.surChoixBande?.(a.id);
    };
    h.onpointermove = e => {
      if (!glisse) return;
      const delta = Math.round(((e.clientX - glisse.x0) * glisse.mParPx) / LARGEURS.pas) * LARGEURS.pas;
      if (delta === glisse.delta) return;
      glisse.delta = delta;
      operer('deplacerLimite', [glisse.i, delta], { apercu: true });
    };
    const lacher = () => {
      if (!glisse) return;
      const { i: k, delta } = glisse;
      glisse = null;
      if (delta) operer('deplacerLimite', [k, delta], { finApercu: true });
      else rappels.surOperation(null, [], { annulerApercu: true });
    };
    h.onpointerup = lacher;
    h.onpointercancel = lacher;
    return h;
  }

  function retirerChoisie(id = choisie) {
    const i = section.bandes.findIndex(b => b.id === id);
    const r = operer('retirer', [i]);
    if (!r?.refus) choisir(section.bandes[Math.min(i, section.bandes.length - 1)]?.id ?? null);
  }

  // ─── Outils de la bande choisie, et ajout ────────────────────────────────
  function outils() {
    const i = section.bandes.findIndex(b => b.id === choisie);
    const b = section.bandes[i];
    const types = Object.entries(BANDES).filter(([, d]) => d.ajoutable).map(([k]) => k);
    const choixType = (valeur, onchange, inclureChaussee = false) => {
      const s = el('select', { className: 'editeur-choix', onchange });
      for (const k of [...(inclureChaussee ? ['chaussee'] : []), ...types]) s.append(el('option', { value: k, textContent: t(`bande.${k}`), disabled: k === 'chaussee' }));
      s.value = valeur;
      return s;
    };
    const champ = (cle, controle) => el('label', { className: 'editeur-champ' }, el('span', { textContent: t(cle) }), controle);
    const groupeBande = el('div', { className: 'editeur-groupe' });
    if (b) {
      const largeur = el('input', { type: 'number', className: 'editeur-largeur', step: String(LARGEURS.pas), min: String(LARGEURS.min), value: String(b.largeur) });
      largeur.onchange = () => { const r = operer('definirLargeur', [i, Number(largeur.value)]); if (r?.refus) largeur.value = String(b.largeur); };
      const sens = el('select', { className: 'editeur-choix', disabled: !BANDES[b.type].sens, onchange: e => operer('changerSens', [i, e.target.value]) });
      if (!BANDES[b.type].sens) sens.append(el('option', { value: '', textContent: '—' }));
      for (const k of SENS) sens.append(el('option', { value: k, textContent: `${t(`sens.${k}.signe`)} ${t(`sens.${k}`)}` }));
      sens.value = b.sens ?? '';
      const g = bouton('editeur.gauche', () => operer('deplacer', [i, -1]), { disabled: i === 0 });
      g.setAttribute('aria-label', t('editeur.deplacer-gauche'));
      const d = bouton('editeur.droite', () => operer('deplacer', [i, 1]), { disabled: i === section.bandes.length - 1 });
      d.setAttribute('aria-label', t('editeur.deplacer-droite'));
      groupeBande.append(
        champ('editeur.type', choixType(b.type, e => operer('changerType', [i, e.target.value]), b.type === 'chaussee')),
        champ('editeur.largeur', largeur),
        champ('editeur.sens', sens),
        g, d,
        bouton('editeur.diviser', () => operer('diviser', [i])),
        bouton('editeur.supprimer', () => retirerChoisie()),
      );
    }
    const nouvelle = choixType('voiture', () => {});
    const ajout = el('div', { className: 'editeur-groupe' },
      champ('editeur.nouvelle', nouvelle),
      bouton('editeur.ajouter', () => {
        const r = operer('ajouter', [nouvelle.value, i < 0 ? section.bandes.length - 1 : i]);
        if (r && !r.refus) choisir(r.section.bandes[r.indice].id);
      }));
    return el('div', { className: 'editeur-outils' }, groupeBande, ajout);
  }

  function dessiner() {
    if (!section) return;
    const focus = document.activeElement && racine.contains(document.activeElement)
      ? (document.activeElement.dataset.limite !== undefined ? `[data-limite="${document.activeElement.dataset.limite}"]`
        : document.activeElement.dataset.bande ? `[data-bande="${document.activeElement.dataset.bande}"]` : null) : null;
    const annuler = bouton('editeur.annuler', rappels.surAnnuler, { disabled: !info.peutAnnuler, title: 'Ctrl+Z' });
    const retablir = bouton('editeur.retablir', rappels.surRetablir, { disabled: !info.peutRetablir, title: 'Ctrl+Y' });
    const fermer = el('button', { type: 'button', className: 'icone', onclick: rappels.surFermer });
    fermer.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    fermer.setAttribute('aria-label', t('editeur.fermer'));
    const reste = libre(section);
    racine.replaceChildren(
      el('div', { className: 'editeur-tete' },
        el('h2', { textContent: t('editeur.titre') }),
        el('span', { className: `editeur-nom${info.nom ? '' : ' inconnu'}`, textContent: info.nom ?? t('valeur.inconnu') }),
        el('span', { className: 'editeur-emprise', textContent: t('editeur.emprise', { n: nombre(section.emprise) }), title: info.source }),
        el('span', { className: `editeur-reste${reste > 0 ? ' libre' : ''}`, textContent: t('editeur.libre', { n: nombre(reste) }) }),
        el('span', { className: 'editeur-espace' }),
        annuler, retablir,
        bouton('editeur.mesure', rappels.surMesure, { disabled: !info.modifiee }),
        fermer),
      el('div', { className: 'editeur-cotes', title: t('editeur.cotes') },
        el('span', { textContent: t('editeur.cote-gauche') }),
        el('p', { className: `editeur-message${dernier.refus ? ' refus' : ''}`, role: 'status', textContent: dernier.texte || t('editeur.aide') }),
        el('span', { textContent: t('editeur.cote-droit') })),
      ruban(),
      outils(),
    );
    if (focus) racine.querySelector(focus)?.focus();
  }

  return {
    /** Affiche la section (info : { nom, source, peutAnnuler, peutRetablir, modifiee }). */
    afficher(s, i) {
      const nouvelle = section?.troncon !== s.troncon;
      section = s; info = i;
      if (nouvelle) { choisie = null; message(''); }
      if (choisie && !s.bandes.some(b => b.id === choisie)) choisie = null;
      racine.hidden = false;
      dessiner();
    },
    /** Pendant un glisser : seules les largeurs changent, sans reconstruire (la limite garde le pointeur). */
    apercu(s) {
      const r = racine.querySelector('.editeur-ruban');
      if (!r) return;
      for (const b of s.bandes) {
        const d = r.querySelector(`[data-bande="${b.id}"]`);
        if (!d) continue;
        d.style.flexGrow = String(b.largeur / s.emprise);
        d.querySelector('.editeur-mesure').textContent = nombre(b.largeur);
      }
      const reste = libre(s);
      let l = r.querySelector('.editeur-libre');
      if (!l && reste > 0) {
        l = el('div', { className: 'editeur-libre' });
        l.style.background = `repeating-linear-gradient(45deg, ${P.papier} 0 6px, ${P.trottoir} 6px 9px)`;
        r.append(l);
      }
      if (l) { l.style.flexGrow = String(Math.max(0, reste) / s.emprise); l.textContent = reste > 0 ? nombre(reste) : ''; l.hidden = reste <= 0; }
      const e = racine.querySelector('.editeur-reste');
      if (e) e.textContent = t('editeur.libre', { n: nombre(reste) });
    },
    masquer() { section = null; choisie = null; glisse = null; racine.hidden = true; racine.replaceChildren(); },
    message,
    get bandeChoisie() { return choisie; },
    choisir,
    langue(nt, nl) { t = nt; lang = nl; dessiner(); },
  };
}
