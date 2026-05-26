// Vitest matcher type augmentation for vitest-axe + @testing-library/jest-dom.
// The matchers themselves are registered in src/test/setup.ts via expect.extend().

/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Assertion, AsymmetricMatchersContaining } from 'vitest'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

interface AxeMatchers {
  toHaveNoViolations(): void
}

declare module 'vitest' {
  interface Assertion<T = unknown>
    extends AxeMatchers,
      TestingLibraryMatchers<typeof expect.stringContaining, T> {}
  interface AsymmetricMatchersContaining
    extends AxeMatchers,
      TestingLibraryMatchers<typeof expect.stringContaining, unknown> {}
}
