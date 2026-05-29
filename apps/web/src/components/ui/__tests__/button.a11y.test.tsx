// Baseline accessibility test — proves the axe + Vitest + Testing Library
// pipeline works end-to-end. Mirrored shape: docs/architecture.md §12.4.

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { Button } from '@/components/ui/button'
import { axeConfig } from '@/test/axe-config'

describe('Button accessibility', () => {
  it('has no axe violations in the default variant', async () => {
    const { container } = render(<Button>Save patient record</Button>)
    const results = await axe(container, axeConfig)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations as an icon-only button with aria-label', async () => {
    const { container } = render(
      <Button size="icon" aria-label="Open menu">
        <svg width="16" height="16" aria-hidden="true" focusable="false" />
      </Button>,
    )
    const results = await axe(container, axeConfig)
    expect(results).toHaveNoViolations()
  })
})
