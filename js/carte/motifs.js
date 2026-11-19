// Les images de la carte, dessinées au lancement depuis la palette (aucune
// ressource distante, aucun sprite) : motifs des bandes et flèches de sens.
// Un motif double la teinte d'une bande : on ne lit jamais un type par la couleur seule.
import { BANDES } from '../data/bandes.js?v=0.8.0';

const PX = 2; // images en double densité (écrans à forte densité)

function image(taille, dessiner) {
  const c = document.createElement('canvas');
  c.width = c.height = taille * PX;
  const g = c.getContext('2d');
  g.scale(PX, PX);
  dessiner(g, taille);
  return g.getImageData(0, 0, c.width, c.height);
}

// Chaque motif : un fond (la teinte de la bande) et un signe discret, en tuile de 16 px
const SIGNES = {
  velo: (g, P) => { g.strokeStyle = P.voirie; g.lineWidth = 1.2; diag(g); },
  bus: (g, P) => { g.fillStyle = P.voirie; g.fillRect(2, 7.5, 5, 1); g.fillRect(10, 7.5, 5, 1); },
  parking: (g, P) => { g.strokeStyle = P.encre; g.lineWidth = 1; g.strokeRect(4.5, 4.5, 7, 7); },
  plante: (g, P) => { g.fillStyle = P.encre; for (const [x, y] of [[4, 4], [12, 12]]) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); } },
  hachures: (g, P) => { g.strokeStyle = P.bord; g.lineWidth = 1; diag(g); },
  inconnu: (g, P) => { g.strokeStyle = P.inconnu; g.lineWidth = 0.8; diag(g); },
};
function diag(g) {
  g.beginPath();
  for (const k of [-16, 0, 16]) { g.moveTo(k, 16); g.lineTo(k + 16, 0); }
  g.stroke();
}

/** Ajoute à la carte MapLibre les images dont le style a besoin (motif-*, fleche, fleche-double). */
export function ajouterImages(carte, P) {
  const motifs = new Map(Object.values(BANDES).filter(b => b.motif).map(b => [b.motif, b.couleur]));
  for (const [motif, couleur] of motifs) {
    carte.addImage(`motif-${motif}`, image(16, g => { g.fillStyle = P[couleur]; g.fillRect(0, 0, 16, 16); SIGNES[motif]?.(g, P); }), { pixelRatio: PX });
  }
  // Flèche pointée vers la droite de l'image : MapLibre l'aligne sur la ligne, dans son sens
  const fleche = (double) => image(24, g => {
    g.fillStyle = P.encre; g.strokeStyle = P.voirie; g.lineWidth = 1.5; g.lineJoin = 'round';
    g.beginPath();
    if (double) { g.moveTo(2, 12); g.lineTo(8, 6); g.lineTo(8, 10); g.lineTo(16, 10); g.lineTo(16, 6); g.lineTo(22, 12); g.lineTo(16, 18); g.lineTo(16, 14); g.lineTo(8, 14); g.lineTo(8, 18); }
    else { g.moveTo(3, 10); g.lineTo(13, 10); g.lineTo(13, 5); g.lineTo(21, 12); g.lineTo(13, 19); g.lineTo(13, 14); g.lineTo(3, 14); }
    g.closePath(); g.stroke(); g.fill();
  });
  // Traversées (v0.4) : bandes blanches sur encre pour le passage piéton, carrés en damier pour la traversée cyclable
  carte.addImage('motif-traversee-pieton', image(16, g => { g.fillStyle = P.encre; g.fillRect(0, 0, 16, 16); g.fillStyle = P.voirie; g.fillRect(0, 0, 8, 16); }), { pixelRatio: PX });
  carte.addImage('motif-traversee-velo', image(16, g => { g.fillStyle = P.cyclable; g.fillRect(0, 0, 16, 16); g.fillStyle = P.voirie; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8); }), { pixelRatio: PX });
  carte.addImage('fleche', fleche(false), { pixelRatio: PX });
  carte.addImage('fleche-double', fleche(true), { pixelRatio: PX });
}
