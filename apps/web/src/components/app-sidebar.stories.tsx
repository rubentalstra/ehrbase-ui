import type { Meta, StoryObj } from '@storybook/react-vite'

import { AppSidebar } from '@/components/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { withRouter } from '@/test/storybook-decorators'

const meta = {
  title: 'Shell/AppSidebar',
  component: AppSidebar,
  decorators: [
    withRouter,
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
