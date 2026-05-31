// ConflictDialog test (F4 — 412 optimistic-concurrency conflict-resolution).
//
// Verifies: (1) the dialog fetches the CURRENT server composition and renders a
// field-level diff of the user's pending values vs the current server values;
// (2) "Re-apply my changes onto the latest version" fires onRetryOnLatest with
// the freshly-read server version_uid (the new If-Match the retry must use);
// (3) "Discard my changes and reload" fires onReloadDiscard.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock the server fn so the dialog's "current server version" read is
// deterministic — pending form-state vs this server form-state is the diff.
vi.mock('@/server/functions/composition.functions', () => ({
  readComposition: vi.fn(() =>
    Promise.resolve({
      formState: JSON.stringify({ weight: { magnitude: 80, unit: 'kg' }, note: 'updated by colleague' }),
      versionUid: 'obj::sys::5',
    }),
  ),
}))

import { ConflictDialog } from '../conflict-dialog'

function renderDialog(overrides: Partial<Parameters<typeof ConflictDialog>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onRetryOnLatest = vi.fn()
  const onReloadDiscard = vi.fn()
  const onCancel = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <ConflictDialog
        open={true}
        ehrId="11111111-1111-1111-1111-111111111111"
        templateId="vitals.v1"
        compositionUid="obj"
        currentVersionUid="obj::sys::4"
        pendingValues={{ weight: { magnitude: 70.5, unit: 'kg' }, note: 'stable' }}
        onReloadDiscard={onReloadDiscard}
        onRetryOnLatest={onRetryOnLatest}
        isRetrying={false}
        onCancel={onCancel}
        {...overrides}
      />
    </QueryClientProvider>,
  )
  return { onRetryOnLatest, onReloadDiscard, onCancel }
}

describe('ConflictDialog', () => {
  it('renders a field-level diff of pending vs current server values', async () => {
    renderDialog()

    // The differing fields appear as diff rows: weight.magnitude (70.5 vs 80)
    // and note ("stable" vs "updated by colleague").
    await waitFor(() => expect(screen.getByText('weight.magnitude')).toBeTruthy())
    expect(screen.getByText('70.5')).toBeTruthy()
    expect(screen.getByText('80')).toBeTruthy()
    expect(screen.getByText('stable')).toBeTruthy()
    expect(screen.getByText('updated by colleague')).toBeTruthy()
    // weight.unit is identical ("kg") on both sides → not a diff row.
    expect(screen.queryByText('weight.unit')).toBeNull()
  })

  it('retry-on-latest calls back with the freshly-read server version_uid', async () => {
    const user = userEvent.setup()
    const { onRetryOnLatest } = renderDialog()

    // Wait for the current-version read to resolve so the button enables with
    // the fresh version_uid (obj::sys::5, NOT the stale 412-reported obj::sys::4).
    const retry = await screen.findByRole('button', {
      name: /re-apply my changes onto the latest version/iu,
    })
    await waitFor(() => expect(retry.hasAttribute('disabled')).toBe(false))
    await user.click(retry)

    expect(onRetryOnLatest).toHaveBeenCalledWith('obj::sys::5')
  })

  it('reload-and-discard calls onReloadDiscard', async () => {
    const user = userEvent.setup()
    const { onReloadDiscard } = renderDialog()

    await user.click(
      await screen.findByRole('button', { name: /discard my changes and reload/iu }),
    )
    expect(onReloadDiscard).toHaveBeenCalledTimes(1)
  })
})
