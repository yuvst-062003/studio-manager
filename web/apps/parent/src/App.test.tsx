import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('parent app', () => {
  it('renders its own app name', () => {
    render(<App />)
    expect(screen.getByText('סטודיו — הורים')).toBeInTheDocument()
  })

  it('reports whether it is installed or running in a tab', () => {
    render(<App />)
    expect(screen.getByTestId('display-mode')).toBeInTheDocument()
  })
})
