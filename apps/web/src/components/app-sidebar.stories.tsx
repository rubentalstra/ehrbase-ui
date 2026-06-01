import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { AppSidebar } from '@/components/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'

// Router is supplied (mocked) by the framework; only the sidebar layout context
// is local to these stories (ADR-0047).
const meta = {
  title: 'Shell/AppSidebar',
  component: AppSidebar,
  decorators: [
    (Story) => (
      <SidebarProvider>
        <Story />
      </SidebarProvider>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AppSidebar>

export default meta

type Story = StoryObj<typeof meta>

export const Clinician: Story = {
  args: {
    user: {
      name: 'Dev Clinician',
      email: 'dev-clinician@example.org',
      roles: ['clinician'],
    },
  },
}

export const Admin: Story = {
  args: {
    user: {
      name: 'Site Admin',
      email: 'admin@example.org',
      roles: ['clinician', 'admin'],
    },
  },
}
