import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { installFullscreenMock, resetFullscreenMock } from './fullscreenMock'

beforeEach(() => {
  installFullscreenMock()
})

afterEach(() => {
  resetFullscreenMock()
  cleanup()
})
