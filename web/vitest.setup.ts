import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Auto-cleanup is only registered when vitest runs with globals enabled, which it
// does not here — without this, renders accumulate into one document across tests.
afterEach(cleanup)
