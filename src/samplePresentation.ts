import type { Presentation } from './model'

export const samplePresentation: Presentation = {
  schemaVersion: 1,
  id: 'streaming-wars',
  title: 'The Streaming Wars',
  tagline: 'How endless choice changed what we watch.',
  aspectRatio: '9:16',
  accent: '#6c5ce7',
  scenes: [
    {
      id: 'streaming-title',
      type: 'title',
      title: 'Opening question',
      duration: 4,
      eyebrow: 'The streaming wars',
      headline: 'More choice.\nLess certainty.',
      subtitle: 'The promise of everything, all at once.',
      transition: { type: 'fade', duration: 0.55 },
    },
    {
      id: 'streaming-stat',
      type: 'big-stat',
      title: 'The subscription stack',
      duration: 5,
      eyebrow: 'A growing stack',
      value: '5+',
      label: 'services in one household',
      supportingText: 'A sample project ready to adapt with your own research and sources.',
      transition: { type: 'scale', duration: 0.65 },
    },
    {
      id: 'streaming-close',
      type: 'text',
      title: 'The real competition',
      duration: 4,
      eyebrow: 'The takeaway',
      headline: 'Attention is the\nscarce resource.',
      body: 'The biggest contest is not between platforms. It is between every possible use of our time.',
      callout: 'The catalog is infinite. The evening is not.',
      transition: { type: 'slide', duration: 0.6 },
    },
  ],
}
