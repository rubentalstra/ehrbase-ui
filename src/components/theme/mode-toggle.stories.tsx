import type { Meta, StoryObj } from '@storybook/react-vite'

import { ModeToggle } from '@/components/theme/mode-toggle'
import { withTheme } from '@/test/storybook-decorators'

const meta = {
  title: 'Shell/ModeToggle',
  component: ModeToggle,
  decorators: [withTheme],
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof ModeToggle>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
