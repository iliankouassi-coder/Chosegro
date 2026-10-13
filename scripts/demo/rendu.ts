// Rendu des pièces fictives : images JPG (SVG rendu par sharp) et PDF (pdf-lib).
// Chaque pièce porte la mention « DOCUMENT FICTIF — DÉMO ».
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import QRCode from 'qrcode'
import sharp from 'sharp'
import { imprime, type DocumentDemo, type PageDocument } from './catalogue'

const LARGEUR = 1240
const HAUTEUR = 1754
const POLICE = "'DejaVu Sans', 'Liberation Sans', Arial, Helvetica, sans-serif"
const POLICE_MANUSCRITE = "'Bradley Hand', 'Segoe Print', 'DejaVu Serif', 'Liberation Serif', serif"
const POLICE_TICKET = "'DejaVu Sans Mono', 'Liberation Mono', Menlo, monospace"

const echapper = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const date = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Montant affiché sur la pièce : « 84 500 » en FCFA, « 1,850.00 » en USD. */
const montant = (n: number, devise: PageDocument['devise']): string =>
  devise === 'USD' ? `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.00` : imprime(n)

const texteQr = (p: PageDocument): string =>
  `DEMO - facture fictive ${p.numero ?? ''} - ${p.emetteur.nom} - aucune valeur fiscale`

async function qrSvg(p: PageDocument, x: number, y: number, taille: number): Promise<string> {
  const svg = await QRCode.toString(texteQr(p), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 33 33'
  const contenu = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return `<svg x="${x}" y="${y}" width="${taille}" height="${taille}" viewBox="${viewBox}" shape-rendering="crispEdges">${contenu}</svg>`
}

const filigrane = (largeur: number, hauteur: number): string =>
  `<text x="${largeur / 2}" y="${hauteur / 2}" text-anchor="middle" font-family="${POLICE}" font-size="${Math.round(largeur / 11)}" font-weight="700" fill="#b91c1c" fill-opacity="0.10" transform="rotate(-30 ${largeur / 2} ${hauteur / 2})">DOCUMENT FICTIF — DÉMO</text>`

const piedDePage = (largeur: number, hauteur: number): string =>
  `<text x="${largeur / 2}" y="${hauteur - 40}" text-anchor="middle" font-family="${POLICE}" font-size="20" fill="#6b7280">Pièce fictive générée pour la démonstration Pièces Cabinet — aucune valeur comptable ni fiscale.</text>`

async function svgFacture(p: PageDocument): Promise<string> {
  const d = p.devise
  const el: string[] = []
  const t = (x: number, y: number, contenu: string, attrs = ''): void => {
    el.push(`<text x="${x}" y="${y}" font-family="${POLICE}" ${attrs}>${echapper(contenu)}</text>`)
  }
  // En-tête : émetteur à gauche, titre à droite.
  t(90, 150, p.emetteur.nom, 'font-size="44" font-weight="700" fill="#111827"')
  t(90, 195, p.emetteur.adresse, 'font-size="24" fill="#374151"')
  if (p.emetteur.identifiants) t(90, 230, p.emetteur.identifiants, 'font-size="20" fill="#6b7280"')
  t(1150, 150, p.titre, 'font-size="52" font-weight="700" text-anchor="end" fill="#1f2937"')
  if (p.numero) t(1150, 200, `N° ${p.numero}`, 'font-size="28" text-anchor="end"')
  t(1150, 240, `Date : ${date(p.date)}`, 'font-size="28" text-anchor="end"')
  el.push('<line x1="90" y1="275" x2="1150" y2="275" stroke="#9ca3af" stroke-width="2"/>')
  // Destinataire.
  if (p.destinataire) {
    el.push('<rect x="640" y="305" width="510" height="150" fill="none" stroke="#9ca3af" stroke-width="2" rx="8"/>')
    t(665, 345, d === 'USD' ? 'Bill to:' : 'Client :', 'font-size="22" fill="#6b7280"')
    t(665, 385, p.destinataire.nom, 'font-size="28" font-weight="700"')
    t(665, 425, p.destinataire.adresse, 'font-size="20" fill="#374151"')
  }
  // Tableau des lignes.
  let y = 520
  if (p.lignes.length > 0) {
    el.push(`<rect x="90" y="${y - 40}" width="1060" height="56" fill="#e5e7eb"/>`)
    t(110, y, d === 'USD' ? 'Description' : 'Désignation', 'font-size="24" font-weight="700"')
    t(780, y, d === 'USD' ? 'Qty' : 'Qté', 'font-size="24" font-weight="700" text-anchor="end"')
    t(960, y, d === 'USD' ? 'Unit price' : 'P.U.', 'font-size="24" font-weight="700" text-anchor="end"')
    t(1130, y, d === 'USD' ? 'Amount' : 'Montant', 'font-size="24" font-weight="700" text-anchor="end"')
    y += 70
    for (const l of p.lignes) {
      t(110, y, l.designation, 'font-size="24"')
      t(780, y, String(l.quantite), 'font-size="24" text-anchor="end"')
      t(960, y, montant(l.prixUnitaire, d), 'font-size="24" text-anchor="end"')
      t(1130, y, montant(l.quantite * l.prixUnitaire, d), 'font-size="24" text-anchor="end"')
      el.push(`<line x1="90" y1="${y + 22}" x2="1150" y2="${y + 22}" stroke="#e5e7eb" stroke-width="2"/>`)
      y += 64
    }
  }
  // Totaux.
  if (p.totaux) {
    y = Math.max(y + 40, 900)
    const unite = d === 'USD' ? 'USD' : 'FCFA'
    const lignesTotaux: [string, string, boolean][] = []
    if (p.totaux.ht !== null) lignesTotaux.push([d === 'USD' ? 'Total excl. VAT' : 'Total HT', montant(p.totaux.ht, d), false])
    if (p.totaux.tva !== null) lignesTotaux.push([d === 'USD' ? 'VAT' : 'TVA 18 %', montant(p.totaux.tva, d), false])
    lignesTotaux.push([d === 'USD' ? 'Total' : 'Total TTC', `${montant(p.totaux.ttc, d)} ${unite}`, true])
    el.push(`<rect x="640" y="${y - 45}" width="510" height="${lignesTotaux.length * 58 + 30}" fill="#f9fafb" stroke="#9ca3af" stroke-width="2" rx="8"/>`)
    for (const [libelle, valeur, gras] of lignesTotaux) {
      t(665, y, libelle, `font-size="26" ${gras ? 'font-weight="700"' : ''}`)
      t(1130, y, valeur, `font-size="26" text-anchor="end" ${gras ? 'font-weight="700"' : ''}`)
      y += 58
    }
  }
  // Mentions, pagination, QR code FNE.
  let ym = 1400
  for (const m of p.mentions) {
    t(90, ym, m, 'font-size="21" fill="#374151"')
    ym += 34
  }
  if (p.pagination) t(1150, 1660, p.pagination, 'font-size="22" text-anchor="end" fill="#374151"')
  if (p.qrFne) {
    el.push(await qrSvg(p, 90, 1150, 190))
    t(90, 1370, 'QR code FNE (DÉMO)', 'font-size="18" fill="#374151"')
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="${HAUTEUR}">
<rect width="100%" height="100%" fill="#ffffff"/>${filigrane(LARGEUR, HAUTEUR)}${el.join('')}${piedDePage(LARGEUR, HAUTEUR)}</svg>`
}

function svgTicket(p: PageDocument): string {
  const largeur = 640
  const lignes: string[] = [
    p.emetteur.nom,
    p.emetteur.adresse,
    '',
    p.titre,
    p.numero ? `N° ${p.numero}` : '',
    `Le ${date(p.date)} à 08:41`,
    '--------------------------------',
    ...p.lignes.flatMap((l) => [l.designation, `${l.quantite} x ${imprime(l.prixUnitaire)} = ${imprime(l.quantite * l.prixUnitaire)}`]),
    '--------------------------------',
    ...(p.totaux?.ht !== null && p.totaux?.ht !== undefined ? [`HT          ${imprime(p.totaux.ht)}`] : []),
    ...(p.totaux?.tva !== null && p.totaux?.tva !== undefined ? [`TVA 18 %    ${imprime(p.totaux.tva)}`] : []),
    `TOTAL TTC   ${imprime(p.totaux?.ttc ?? 0)} FCFA`,
    '',
    'Merci de votre visite',
  ]
  const hauteur = 160 + lignes.length * 40 + 120
  const texte = lignes
    .map((l, i) => `<text x="${largeur / 2}" y="${120 + i * 40}" text-anchor="middle" font-family="${POLICE_TICKET}" font-size="24" ${i === 0 || l.startsWith('TOTAL') ? 'font-weight="700"' : ''}>${echapper(l)}</text>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}">
<rect width="100%" height="100%" fill="#fbfaf7"/>${filigrane(largeur, hauteur)}${texte}
<text x="${largeur / 2}" y="${hauteur - 30}" text-anchor="middle" font-family="${POLICE}" font-size="14" fill="#6b7280">Pièce fictive — démonstration Pièces Cabinet</text></svg>`
}

function svgManuscrit(p: PageDocument): string {
  const largeur = 900
  const hauteur = 1100
  const encre = '#1e3a8a'
  const regles = Array.from({ length: 22 }, (_, i) => `<line x1="0" y1="${120 + i * 44}" x2="${largeur}" y2="${120 + i * 44}" stroke="#bfdbfe" stroke-width="2"/>`).join('')
  const ligne = (x: number, y: number, contenu: string, taille: number, angle: number): string =>
    `<text x="${x}" y="${y}" font-family="${POLICE_MANUSCRITE}" font-style="italic" font-size="${taille}" fill="${encre}" transform="rotate(${angle} ${x} ${y})">${echapper(contenu)}</text>`
  const contenu = [
    ligne(80, 200, p.emetteur.nom, 46, -2),
    ligne(80, 260, p.emetteur.adresse, 30, -1),
    ligne(560, 340, `le ${date(p.date)}`, 34, -1.5),
    ligne(80, 430, p.titre, 44, -1),
    ...p.lignes.map((l, i) => ligne(110, 520 + i * 70, `${l.designation} ....... ${imprime(l.quantite * l.prixUnitaire)}`, 34, -1.2)),
    ligne(110, 700, `Total : ${imprime(p.totaux?.ttc ?? 0)} F`, 42, -2),
    ligne(520, 860, 'Signature', 28, 0),
    `<path d="M 560 920 C 600 880, 640 960, 690 905 S 760 930, 800 890" stroke="${encre}" stroke-width="4" fill="none"/>`,
  ].join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}">
<rect width="100%" height="100%" fill="#fffef6"/>${regles}${filigrane(largeur, hauteur)}${contenu}
<text x="${largeur / 2}" y="${hauteur - 25}" text-anchor="middle" font-family="${POLICE}" font-size="16" fill="#6b7280">Pièce fictive — démonstration Pièces Cabinet</text></svg>`
}

async function svgPage(p: PageDocument): Promise<string> {
  if (p.rendu === 'ticket') return svgTicket(p)
  if (p.rendu === 'manuscrit') return svgManuscrit(p)
  return svgFacture(p)
}

/** Angle de prise de vue stable pour une pièce donnée (pas de hasard : le rendu est reproductible). */
const angleDe = (nom: string): number => {
  let h = 0
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) % 1000
  return ((h % 50) - 25) / 10
}

/** Une « photo » de la pièce posée sur un bureau, légèrement de travers. */
async function enPhoto(png: Buffer, nom: string, flou: boolean): Promise<Buffer> {
  const meta = await sharp(png).metadata()
  const l = meta.width ?? LARGEUR
  const h = meta.height ?? HAUTEUR
  const tourne = await sharp(png)
    .rotate(angleDe(nom), { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const t = await sharp(tourne).metadata()
  const marge = Math.round(Math.max(l, h) * 0.06)
  const fond = await sharp({
    create: { width: (t.width ?? l) + 2 * marge, height: (t.height ?? h) + 2 * marge, channels: 3, background: { r: 92, g: 74, b: 58 } },
  })
    .composite([{ input: tourne, left: marge, top: marge }])
    .modulate({ brightness: 0.97 })
    .png()
    .toBuffer()
  const image = sharp(fond).resize({ width: Math.round(((t.width ?? l) + 2 * marge) * 0.8) })
  return (flou ? image.blur(9) : image).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
}

/** Une page passée au scanner : niveaux de gris, un peu de travers. */
async function enScan(png: Buffer, nom: string): Promise<Buffer> {
  return sharp(png)
    .rotate(angleDe(nom) / 3, { background: '#ffffff' })
    .greyscale()
    .linear(1.08, -10)
    .resize({ width: 1240 })
    .jpeg({ quality: 78 })
    .toBuffer()
}

const pngDe = async (p: PageDocument): Promise<Buffer> => sharp(Buffer.from(await svgPage(p))).png().toBuffer()

// ——— PDF « natif » (facture envoyée par e-mail) : texte sélectionnable ———

async function pagePdf(doc: PDFDocument, p: PageDocument, polices: { normale: PDFFont; grasse: PDFFont }): Promise<void> {
  const page: PDFPage = doc.addPage([595.28, 841.89])
  const { normale, grasse } = polices
  const H = 841.89
  const d = p.devise
  const t = (x: number, y: number, texte: string, taille: number, gras = false, aDroite = false, couleur = rgb(0.07, 0.09, 0.15)): void => {
    const police = gras ? grasse : normale
    const largeur = police.widthOfTextAtSize(texte, taille)
    page.drawText(texte, { x: aDroite ? x - largeur : x, y: H - y, size: taille, font: police, color: couleur })
  }
  page.drawText('DOCUMENT FICTIF — DÉMO', {
    x: 90, y: 260, size: 46, font: grasse, color: rgb(0.73, 0.11, 0.11), opacity: 0.1, rotate: degrees(30),
  })
  t(45, 70, p.emetteur.nom, 20, true)
  t(45, 90, p.emetteur.adresse, 10)
  if (p.emetteur.identifiants) t(45, 105, p.emetteur.identifiants, 9, false, false, rgb(0.42, 0.45, 0.5))
  t(550, 70, p.titre, 24, true, true)
  if (p.numero) t(550, 92, `N° ${p.numero}`, 12, false, true)
  t(550, 110, `Date : ${date(p.date)}`, 12, false, true)
  page.drawLine({ start: { x: 45, y: H - 125 }, end: { x: 550, y: H - 125 }, thickness: 1, color: rgb(0.6, 0.6, 0.6) })
  if (p.destinataire) {
    t(320, 150, d === 'USD' ? 'Bill to:' : 'Client :', 10, false, false, rgb(0.42, 0.45, 0.5))
    t(320, 168, p.destinataire.nom, 13, true)
    t(320, 184, p.destinataire.adresse, 9)
  }
  let y = 240
  t(50, y, d === 'USD' ? 'Description' : 'Désignation', 11, true)
  t(370, y, d === 'USD' ? 'Qty' : 'Qté', 11, true, true)
  t(460, y, d === 'USD' ? 'Unit price' : 'P.U.', 11, true, true)
  t(545, y, d === 'USD' ? 'Amount' : 'Montant', 11, true, true)
  y += 22
  for (const l of p.lignes) {
    t(50, y, l.designation, 10.5)
    t(370, y, String(l.quantite), 10.5, false, true)
    t(460, y, montant(l.prixUnitaire, d), 10.5, false, true)
    t(545, y, montant(l.quantite * l.prixUnitaire, d), 10.5, false, true)
    y += 20
  }
  if (p.totaux) {
    y = Math.max(y + 30, 420)
    const unite = d === 'USD' ? 'USD' : 'FCFA'
    if (p.totaux.ht !== null) {
      t(330, y, d === 'USD' ? 'Total excl. VAT' : 'Total HT', 12)
      t(545, y, montant(p.totaux.ht, d), 12, false, true)
      y += 20
    }
    if (p.totaux.tva !== null) {
      t(330, y, d === 'USD' ? 'VAT' : 'TVA 18 %', 12)
      t(545, y, montant(p.totaux.tva, d), 12, false, true)
      y += 20
    }
    t(330, y, d === 'USD' ? 'Total' : 'Total TTC', 13, true)
    t(545, y, `${montant(p.totaux.ttc, d)} ${unite}`, 13, true, true)
  }
  let ym = 650
  for (const m of p.mentions) {
    t(45, ym, m, 9.5)
    ym += 15
  }
  if (p.qrFne) {
    const png = await QRCode.toBuffer(texteQr(p), { type: 'png', margin: 1, width: 240 })
    const image = await doc.embedPng(png)
    page.drawImage(image, { x: 45, y: H - 770, width: 90, height: 90 })
    t(45, 780, 'QR code FNE (DÉMO)', 8)
  }
  t(297, 815, 'Pièce fictive générée pour la démonstration Pièces Cabinet — aucune valeur comptable ni fiscale.', 7.5, false, false, rgb(0.42, 0.45, 0.5))
}

/** Rend un document en octets (JPG ou PDF). */
export async function rendreDocument(document: DocumentDemo): Promise<Buffer> {
  if (document.format === 'jpg') {
    const [premiere] = document.pages
    if (!premiere) throw new Error(`${document.fichier} : aucune page`)
    const png = await pngDe(premiere)
    return document.effet === 'photo' || document.effet === 'flou'
      ? enPhoto(png, document.fichier, document.effet === 'flou')
      : sharp(png).jpeg({ quality: 85 }).toBuffer()
  }

  const pdf = await PDFDocument.create()
  pdf.setTitle(`${document.fichier} — pièce fictive (DÉMO)`)
  pdf.setProducer('Pièces Cabinet — démo')
  pdf.setCreator('scripts/seed.ts')
  // Dates fixes : le même seed redonne exactement le même fichier (et donc la même empreinte).
  const fixe = new Date(Date.UTC(2026, 0, 1))
  pdf.setCreationDate(fixe)
  pdf.setModificationDate(fixe)
  if (document.effet === 'scan') {
    for (const p of document.pages) {
      const jpg = await enScan(await pngDe(p), `${document.fichier}-${p.numero ?? ''}-${p.pagination ?? ''}`)
      const image = await pdf.embedJpg(jpg)
      const page = pdf.addPage([595.28, 841.89])
      page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 })
    }
  } else {
    const polices = { normale: await pdf.embedFont(StandardFonts.Helvetica), grasse: await pdf.embedFont(StandardFonts.HelveticaBold) }
    for (const p of document.pages) await pagePdf(pdf, p, polices)
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }))
}
