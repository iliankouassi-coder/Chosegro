import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { extrairePages, pdfEnImages } from './pdfEnImages'

const pdf = (nom: string): string =>
  readFileSync(fileURLToPath(new URL(`../data/demo/pieces/${nom}`, import.meta.url))).toString('base64')
const nombreDePages = async (base64: string): Promise<number> => (await PDFDocument.load(Buffer.from(base64, 'base64'))).getPageCount()

describe('extrairePages', () => {
  it('isole une page, ou un groupe de pages, d’un PDF papier', async () => {
    const papier = pdf('I10_papier_lagune_4_pages.pdf')
    expect(await nombreDePages(papier)).toBe(4)
    expect(await nombreDePages(await extrairePages(papier, [2]))).toBe(1)
    expect(await nombreDePages(await extrairePages(papier, [1, 2]))).toBe(2)
  })
})

describe.skipIf(process.platform !== 'darwin')('pdfEnImages (macOS)', () => {
  it('rend chaque page en image PNG', async () => {
    const images = await pdfEnImages(pdf('D02_clim_service.pdf'))
    expect(images).toHaveLength(1)
    expect(images[0]?.startsWith('iVBORw0KGgo')).toBe(true)
  })
})
