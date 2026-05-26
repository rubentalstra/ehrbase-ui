import type { Preview } from '@storybook/react-vite'
import '../src/styles.css'

// Axe rule set mirrors src/test/axe-config.ts + e2e/axe-config.ts.
// addon-a11y will run these on every story.
const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      element: '#storybook-root',
      config: {
        rules: [{ id: 'target-size', enabled: true }],
      },
      options: {
        runOnly: {
          type: 'tag',
          values: [
            'wcag2a',
            'wcag2aa',
            'wcag21a',
            'wcag21aa',
            'wcag22aa',
            'best-practice',
            'EN-301-549',
          ],
        },
      },
    },
  },
}

export default preview
