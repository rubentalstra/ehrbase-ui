import type { Meta, StoryObj } from '@storybook/react-vite'

import { FeatureErrorBoundary } from '@/components/errors/feature-error-boundary'

const meta = {
  title: 'Errors/FeatureErrorBoundary',
  component: FeatureErrorBoundary,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof FeatureErrorBoundary>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    error: new Error('Example failure (never shown to the user)'),
    reset: () => {},
    info: { componentStack: '' },
  },
}
