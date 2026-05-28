import type { Meta, StoryObj } from '@storybook/react-vite'

import { SiteFooter } from '@/components/shell/site-footer'
import { withRouter } from '@/test/storybook-decorators'

const meta = {
  title: 'Shell/SiteFooter',
  component: SiteFooter,
  decorators: [withRouter],
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof SiteFooter>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
