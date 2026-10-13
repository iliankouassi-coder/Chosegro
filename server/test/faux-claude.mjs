// Faux « claude » pour les tests du serveur de lecture. Le comportement dépend du nom du client dans le prompt.
import { appendFileSync, readdirSync } from 'node:fs'

const args = process.argv.slice(2)
const prompt = args[args.indexOf('-p') + 1] ?? ''
const journal = process.env.FAUX_CLAUDE_JOURNAL
if (journal) appendFileSync(journal, `${JSON.stringify({ debut: Date.now(), args, fichiers: readdirSync('.') })}\n`)

const brut = {
  lisible: true, motif_illisible: null, manuscrit: false,
  fournisseur: { valeur: 'Énergie des Lagunes', confiance: 'haut' },
  destinataire: { valeur: 'Boutique Awa Mode SARL', confiance: 'haut' },
  date: { valeur: '10/10/2026', confiance: 'haut' },
  numero_facture: { valeur: 'EL-1', confiance: 'haut' },
  montant_ht: { valeur: '100 000', confiance: 'haut' },
  montant_tva: { valeur: '18 000', confiance: 'haut' },
  montant_ttc: { valeur: '118 000', confiance: 'haut' },
  devise: { valeur: 'FCFA', confiance: 'haut' },
  nature: { valeur: 'facture', confiance: 'haut' },
  qr_fne: { valeur: 'non', confiance: 'haut' },
  compte_propose: { valeur: '6052', confiance: 'moyen' },
  raison_compte: "Facture d'électricité",
}

const fin = () => {
  if (prompt.includes('mode:lent')) setTimeout(() => {}, 60_000)
  else if (prompt.includes('mode:erreur')) { process.stdout.write(JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, result: '' })); process.exit(1) }
  else if (prompt.includes('mode:illisible')) process.stdout.write('pas du json')
  else if (prompt.includes('mode:hors_schema')) process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: { lisible: 'oui' } }))
  else if (prompt.includes('mode:plantage')) { process.stderr.write('panne'); process.exit(3) }
  else process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '', structured_output: brut }))
}
setTimeout(fin, prompt.includes('mode:pause') ? 150 : 5)
