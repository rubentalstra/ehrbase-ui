import type { Meta, StoryObj } from '@storybook/react-vite'

import { CommandPalette } from '@/components/shell/command-palette'
import { withRouter } from '@/test/storybook-decorators'

const meta = {
  title: 'Shell/CommandPalette',
  component: CommandPalette,
  decorators: [withRouter],
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof CommandPalette>

export default meta

type Story = StoryObj<typeof meta>

// The trigger button; press ⌘/Ctrl+K (or click) to open the dialog.
export const Default: Story = {}
