import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Toast from './Toast'

describe('Toast Component', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should not render when show is false', () => {
    const { container } = render(
      <Toast message="Test message" show={false} onClose={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('should render message when show is true', () => {
    render(<Toast message="Test message" show={true} onClose={() => {}} />)
    expect(screen.getByText('Test message')).toBeInTheDocument()
  })

  it('should call onClose after duration', () => {
    const onClose = vi.fn()
    render(<Toast message="Test message" show={true} onClose={onClose} duration={1000} />)
    
    expect(screen.getByText('Test message')).toBeInTheDocument()
    
    vi.advanceTimersByTime(1000)
    vi.advanceTimersByTime(300)
    
    expect(onClose).toHaveBeenCalled()
  })

  it('should have visible class when shown', () => {
    const { container } = render(
      <Toast message="Test message" show={true} onClose={() => {}} />
    )
    const toast = container.querySelector('.toast')
    expect(toast).toHaveClass('toast-visible')
  })
})

