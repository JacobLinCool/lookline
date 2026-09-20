import { describe, expect, it } from 'vitest'
import { PROMPT_NEGATIVE_GUIDANCE } from '../imagery/preview-prompt'
import { buildCardImagePrompt, type CardPromptArticle } from './prompt'

const FORBIDDEN = [/undefined/, /\bnull\b/, /NaN/, /\[object/]

const artDirection = {
  focus: 'layering',
  pose: 'walking',
  scene: 'architecture',
  note: null,
} as const

const articles = [
  {
    name: 'Tailored Coat',
    colorName: 'Black',
    material: 'wool',
    subcategory: 'coat',
    pattern: 'solid',
    outfitRole: 'outer',
  },
  {
    name: 'Silk Shirt',
    colorName: 'Ivory',
    material: 'silk',
    subcategory: 'shirt',
    pattern: 'solid',
    outfitRole: 'top',
  },
  {
    name: 'Wide Trousers',
    colorName: 'Navy',
    material: 'cotton',
    subcategory: 'trousers',
    pattern: 'stripe',
    outfitRole: 'bottom',
  },
] satisfies CardPromptArticle[]

describe('buildCardImagePrompt', () => {
  it('names the persona photo as the subject and every garment it was handed a picture of', () => {
    const prompt = buildCardImagePrompt({
      artDirection,
      authorName: 'Mia',
      subjects: [
        {
          name: '媽媽',
          kind: 'person',
          hasPhoto: true,
          articles: articles.map((a) => ({ ...a, hasImage: true })),
        },
      ],
    })

    // One person photo, attached after the garments, so it is the last label.
    expect(prompt).toContain(`Subject reference 1`)
    for (const [i, article] of articles.entries()) {
      expect(prompt).toContain(`Garment ${i + 1}`)
      expect(prompt).toContain(article.name)
    }
    expect(prompt).toContain('Keep their identity')
    expect(prompt).toContain('every layer clearly')
    expect(prompt).toContain('Mia')
    expect(prompt).toContain(PROMPT_NEGATIVE_GUIDANCE)
    const identity = prompt.indexOf('Keep their identity')
    const focus = prompt.indexOf('every layer clearly')
    const pose = prompt.indexOf('natural walking stride')
    const scene = prompt.indexOf('strong architectural space')
    const safety = prompt.indexOf(PROMPT_NEGATIVE_GUIDANCE)
    expect(identity).toBeLessThan(focus)
    expect(focus).toBeLessThan(pose)
    expect(pose).toBeLessThan(scene)
    expect(scene).toBeLessThan(safety)
    for (const re of FORBIDDEN) expect(prompt).not.toMatch(re)
  })

  it('falls back to an invented model, and to words, when nothing is attached', () => {
    const prompt = buildCardImagePrompt({
      artDirection,
      authorName: 'Mia',
      subjects: [
        {
          name: '媽媽',
          kind: 'person',
          hasPhoto: false,
          articles: articles.map((a) => ({ ...a, hasImage: false })),
        },
      ],
    })
    expect(prompt).toContain('one adult model')
    expect(prompt).not.toContain('Subject reference')
    expect(prompt).not.toContain('Garment 1')
    // Still described well enough to draw: the words are all the model gets.
    for (const article of articles) expect(prompt).toContain(article.name)
    for (const re of FORBIDDEN) expect(prompt).not.toMatch(re)
  })

  it('reproduces a non-human subject instead of turning it into a person', () => {
    const subject = {
      name: '奶龍',
      kind: 'avatar' as const,
      hasPhoto: true,
      articles: [{ ...articles[0]!, hasImage: true }],
    }
    const prompt = buildCardImagePrompt({ artDirection, authorName: 'Mei', subjects: [subject] })

    // The bug this guards: a reference photo of a toy, described as a person whose "skin tone and
    // hair" must be kept, comes back as a photograph of a human being with no trace of the toy.
    expect(prompt).toContain('Subject reference 1')
    expect(prompt).toContain('is not a human being')
    expect(prompt).toMatch(/do not turn it into one/)
    expect(prompt).not.toMatch(/skin tone/)
    expect(prompt).not.toMatch(/natural skin/)
    expect(prompt).not.toMatch(/adult model/)
    for (const re of FORBIDDEN) expect(prompt).not.toMatch(re)
  })

  it('keeps a human subject of the same card human', () => {
    const prompt = buildCardImagePrompt({
      artDirection,
      authorName: 'Mei',
      subjects: [
        { name: '奶龍', kind: 'avatar', hasPhoto: true, articles: [] },
        { name: '美琪', kind: 'person', hasPhoto: true, articles: [] },
      ],
    })
    expect(prompt).toContain('is not a human being')
    // One human in the frame is enough to keep the photographic language for skin.
    expect(prompt).toContain('natural skin')
    expect(prompt).toContain('Keep their identity')
  })

  it('keeps each subject of an edition with their own garments', () => {
    const [first, second, third] = articles
    const prompt = buildCardImagePrompt({
      artDirection,
      authorName: 'Mia',
      collectionTitle: '一家人',
      subjects: [
        { name: '媽媽', kind: 'person', hasPhoto: true, articles: [{ ...first!, hasImage: true }] },
        {
          name: '阿公',
          kind: 'person',
          hasPhoto: false,
          articles: [
            { ...second!, hasImage: true },
            { ...third!, hasImage: false },
          ],
        },
      ],
    })

    // Garments are numbered across the whole request in subject order, and the one person photo
    // comes after all of them — which is the order the caller attaches the images in.
    const paragraphs = prompt.split('\n\n')
    const mother = paragraphs.find((para) => para.startsWith('媽媽 '))!
    const grandfather = paragraphs.find((para) => para.startsWith('阿公 '))!
    expect(mother).toContain('Garment 1')
    expect(grandfather).toContain('Garment 2')
    // The third piece had no photograph, so it is described rather than pointed at.
    expect(prompt).not.toContain('Garment 3')
    expect(prompt).toContain(third!.name)

    expect(prompt).toContain('Photograph 2 subjects together in one frame')
    expect(prompt).toContain('媽媽 and 阿公')
    expect(prompt).toContain('一家人')
    // Only the subject with a photo is tied to one; the other is left to the model.
    expect(prompt.match(/Subject reference/g)).toHaveLength(1)
    expect(mother).toContain('Subject reference 1')
    expect(grandfather).not.toContain('Subject reference')
    expect(grandfather).toContain('one adult model')
    for (const re of FORBIDDEN) expect(prompt).not.toMatch(re)
  })
})
