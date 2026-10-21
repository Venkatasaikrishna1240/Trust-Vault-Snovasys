import { describe, expect, it } from 'vitest'
import { signInErrorMessage, signUpErrorMessage } from '../features/auth/authErrors'

describe('sign-in error messages', () => {
  it('explains that the email must be confirmed', () => {
    expect(signInErrorMessage({ code: 'email_not_confirmed' })).toMatch(/confirm your email/i)
  })

  describe('sign-up error messages', () => {
    it('explains confirmation email delivery failure and warns against repeated attempts', () => {
      expect(signUpErrorMessage({ message: 'Error sending confirmation email' })).toMatch(
        /could not send the confirmation email/i,
      )
      expect(signUpErrorMessage({ message: 'Error sending confirmation email' })).toMatch(
        /may already have been created but remain unconfirmed/i,
      )
    })

    it('asks rate-limited sign-ups to wait', () => {
      expect(signUpErrorMessage({ code: 'over_email_send_rate_limit' })).toMatch(/wait before trying again/i)
    })

    it('does not expose unknown backend details', () => {
      expect(signUpErrorMessage({ message: 'provider password rejected', status: 500 })).not.toMatch(
        /provider password rejected/i,
      )
      expect(signUpErrorMessage({ status: 500 })).toMatch(/authentication service failed/i)
    })
  })

  it('keeps invalid-credential responses generic while mentioning confirmation', () => {
    expect(signInErrorMessage({ code: 'invalid_credentials' })).toMatch(/email or password is incorrect/i)
    expect(signInErrorMessage({ code: 'invalid_credentials' })).toMatch(/confirm your email/i)
  })

  it('asks rate-limited users to wait before retrying', () => {
    expect(signInErrorMessage({ code: 'over_request_rate_limit' })).toMatch(/wait a few minutes/i)
  })

  it('does not reveal raw service errors for unknown failures', () => {
    expect(signInErrorMessage({ code: 'internal_error', status: 500 })).toMatch(/temporarily unavailable/i)
    expect(signInErrorMessage({ code: 'internal_error', status: 400 })).not.toMatch(/internal_error/i)
  })
})
