import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button.tsx'

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
  },
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'Save patient record',
  },
}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Cancel',
  },
}

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Delete composition',
  },
}

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Edit',
  },
}

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Dismiss',
  },
}

export const IconOnly: Story = {
  args: {
    size: 'icon',
    'aria-label': 'Open menu',
    children: (
      <svg width="16" height="16" aria-hidden="true" focusable="false">
        <rect x="2" y="3" width="12" height="2" fill="currentColor" />
        <rect x="2" y="7" width="12" height="2" fill="currentColor" />
        <rect x="2" y="11" width="12" height="2" fill="currentColor" />
      </svg>
    ),
  },
}
