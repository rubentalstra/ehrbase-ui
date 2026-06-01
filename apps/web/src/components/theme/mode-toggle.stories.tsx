import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { ModeToggle } from '@/components/theme/mode-toggle'

// Theme context is supplied globally by the preview decorator (ADR-0047).
const meta = {
  title: 'Shell/ModeToggle',
  component: ModeToggle,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof ModeToggle>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
