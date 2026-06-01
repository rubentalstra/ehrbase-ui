import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { SiteFooter } from '@/components/shell/site-footer'

// `@storybook/tanstack-react` supplies the (mocked) router, so the footer's
// <Link>s resolve without a hand-written decorator (ADR-0047).
const meta = {
  title: 'Shell/SiteFooter',
  component: SiteFooter,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof SiteFooter>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
