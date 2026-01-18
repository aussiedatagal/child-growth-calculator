import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PrivacyPolicy from './PrivacyPolicy'

describe('PrivacyPolicy Component', () => {
  it('should render privacy policy content', () => {
    render(<PrivacyPolicy onClose={() => {}} />)
    
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument()
    expect(screen.getByText(/Data Storage/i)).toBeInTheDocument()
    expect(screen.getByText(/Analytics/i)).toBeInTheDocument()
  })

  it('should call onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    
    render(<PrivacyPolicy onClose={onClose} />)
    
    const closeButton = screen.getByText('×')
    await user.click(closeButton)
    
    expect(onClose).toHaveBeenCalled()
  })

  it('should call onClose when overlay is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    
    const { container } = render(<PrivacyPolicy onClose={onClose} />)
    const overlay = container.querySelector('.privacy-policy-overlay')
    
    await user.click(overlay)
    
    expect(onClose).toHaveBeenCalled()
  })

  it('should not call onClose when content is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    
    const { container } = render(<PrivacyPolicy onClose={onClose} />)
    const content = container.querySelector('.privacy-policy-content')
    
    await user.click(content)
    
    expect(onClose).not.toHaveBeenCalled()
  })

  it('should contain GitHub link', () => {
    render(<PrivacyPolicy onClose={() => {}} />)
    
    const githubLink = screen.getByText(/GitHub repository/i).closest('a')
    expect(githubLink).toHaveAttribute('href', 'https://github.com/aussiedatagal/child-growth-calculator')
    expect(githubLink).toHaveAttribute('target', '_blank')
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

