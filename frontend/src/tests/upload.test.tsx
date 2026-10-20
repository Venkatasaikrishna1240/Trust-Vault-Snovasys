import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_UPLOAD_BYTES, precheckFile } from '../lib/validation'
import { FilePicker } from '../features/documents/FilePicker'
import UploadPage from '../pages/UploadPage'
import { authValue, Providers } from './helpers'

const { searchShareRecipients, uploadDocument } = vi.hoisted(() => ({ searchShareRecipients: vi.fn(), uploadDocument: vi.fn() }))
vi.mock('../services/documents', () => ({ searchShareRecipients, uploadDocument }))

describe('upload precheck', () => {
  beforeEach(() => { searchShareRecipients.mockReset(); uploadDocument.mockReset() })
  it('accepts PDF/PNG/JPEG within limit', () => {
    for (const type of ['application/pdf', 'image/png', 'image/jpeg']) expect(precheckFile({ type, size: 1000 })).toBeNull()
  })
  it('rejects wrong type and oversize', () => {
    expect(precheckFile({ type: 'text/html', size: 10 })).toMatch(/PDF, PNG or JPEG/)
    expect(precheckFile({ type: 'application/pdf', size: MAX_UPLOAD_BYTES + 1 })).toMatch(/10 MB/)
    expect(precheckFile({ type: 'application/pdf', size: 0 })).toMatch(/empty/)
  })
  it('FilePicker shows an error and does not accept a bad file', () => {
    let picked: File | null | undefined
    render(<FilePicker label="File" file={null} onChange={(f) => { picked = f }} />)
    const input = screen.getByLabelText('File') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'evil.exe', { type: 'application/x-msdownload' })] } })
    expect(screen.getByRole('alert')).toHaveTextContent(/only pdf, png or jpeg/i)
    expect(picked).toBeNull()
  })
  it('viewers can upload their own documents', () => {
    render(<Providers auth={authValue({}, 'viewer')}><UploadPage /></Providers>)
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument()
  })

  it('uploads to selected recipients with the chosen edit access in the same request', async () => {
    const recipient = { id: 'u2', email: 'user2@example.com', display_name: 'User Two' }
    searchShareRecipients.mockResolvedValue([recipient])
    uploadDocument.mockResolvedValue({ id: 'doc-1' })
    render(<Providers auth={authValue({}, 'viewer')}><UploadPage /></Providers>)

    fireEvent.change(screen.getByLabelText('File'), { target: { files: [new File(['%PDF-1.4\n%%EOF'], 'contract.pdf', { type: 'application/pdf' })] } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Contract' } })
    fireEvent.click(screen.getByRole('radio', { name: /specific people/i }))
    const recipientSearch = screen.getByRole('searchbox', { name: /find recipient by name or username/i })
    fireEvent.change(recipientSearch, { target: { value: 'User' } })
    expect(await screen.findByText('User Two')).toBeInTheDocument()
    expect(searchShareRecipients).toHaveBeenCalledWith('User')

    fireEvent.change(recipientSearch, { target: { value: 'user2' } })
    await waitFor(() => expect(searchShareRecipients).toHaveBeenCalledWith('user2'))
    expect(screen.getByText('User Two')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /user2@example.com/i }))
    fireEvent.change(screen.getByLabelText('Recipient access'), { target: { value: 'edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Contract', shareEmails: ['user2@example.com'], permission: 'edit', isGlobal: false,
    })))
  })

  it('searches after three characters and clears suggestions for shorter terms', async () => {
    searchShareRecipients.mockResolvedValue([])
    render(<Providers auth={authValue({}, 'viewer')}><UploadPage /></Providers>)
    fireEvent.click(screen.getByRole('radio', { name: /specific people/i }))
    const search = screen.getByRole('searchbox', { name: /find recipient by name or username/i })

    fireEvent.change(search, { target: { value: 'us' } })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    expect(searchShareRecipients).not.toHaveBeenCalled()

    fireEvent.change(search, { target: { value: 'use' } })
    await waitFor(() => expect(searchShareRecipients).toHaveBeenCalledWith('use'))
  })
})
