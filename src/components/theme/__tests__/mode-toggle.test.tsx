import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { ModeToggle } from '@/components/theme/mode-toggle'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { axeConfig } from '@/test/axe-config'

function renderToggle() {
  return render(
    <ThemeProvider>
      <ModeToggle />
    </ThemeProvider>,
  )
}

describe('ModeToggle', () => {
  it('renders an accessible, labelled icon trigger', () => {
    renderToggle()
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderToggle()
    const results = await axe(container, axeConfig)
    expect(results).toHaveNoViolations()
  })
})
