import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { expect, mocked, userEvent, waitFor, within } from 'storybook/test'

import { m } from '@ehrbase-ui/i18n/messages'
import { CommandPalette } from '@/components/shell/command-palette'
import { searchPatients } from '@/server/functions/patient.functions'

// `@storybook/tanstack-react` rewrites the `searchPatients` server function to a
// `storybook/test` mock, and supplies the (mocked) router that the palette's
// navigation depends on — so no hand-written stubs/decorators are needed
// (ADR-0047). The QueryClient comes from the global preview decorator.
const meta = {
  title: 'Shell/CommandPalette',
  component: CommandPalette,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof CommandPalette>

export default meta

type Story = StoryObj<typeof meta>

// The trigger button; press ⌘/Ctrl+K (or click) to open the dialog.
export const Default: Story = {}

// End-to-end of the global patient search: open → type a name → the mocked
// server search runs → the patient is listed by name + DOB + MRN (never a UUID).
export const SearchesPatients: Story = {
  beforeEach: () => {
    mocked(searchPatients).mockResolvedValue({
      parties: [
        {
          id: 'demo-party-1',
          active: true,
          version: 1,
          identifiers: [{ namespace: 'mrn', value: '100042' }],
          names: [
            {
              use: 'official',
              family: 'Doe',
              given: ['Jane'],
              prefix: [],
              suffix: [],
            },
          ],
          gender: 'female',
          birthDate: '1990-05-12',
          deceased: false,
          addresses: [],
          contacts: [],
        },
      ],
      total: 1,
    })
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement)

    await step('open the palette', async () => {
      await userEvent.click(canvas.getByRole('button'))
    })

    // The command dialog renders in a portal on document.body.
    const dialog = within(document.body)

    await step('type a family-name query', async () => {
      await userEvent.type(
        dialog.getByPlaceholderText(m.command_patients_hint()),
        'Doe',
      )
    })

    await step('the server search runs and the patient is listed', async () => {
      await waitFor(() => expect(searchPatients).toHaveBeenCalled())
      await waitFor(() =>
        expect(dialog.getByText(/MRN\s*100042/u)).toBeInTheDocument(),
      )
    })
  },
}
