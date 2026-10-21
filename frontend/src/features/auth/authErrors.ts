export interface AuthFailure {
  code?: string
  status?: number
  message?: string
}

export function signUpErrorMessage(error: AuthFailure): string {
  if (error.message?.toLowerCase().includes('error sending confirmation email')) {
    return 'TrustVault could not send the confirmation email. Your account may already have been created but remain unconfirmed. Do not keep retrying; contact the administrator to check Supabase Auth logs, SMTP provider logs, and your account status.'
  }
  if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
    return 'Too many confirmation emails were requested. Wait before trying again. If this continues, contact the project administrator.'
  }
  if (error.status === undefined || error.status === 0) {
    return 'Could not reach the authentication service. Check your connection and try again.'
  }
  if (error.status >= 500) {
    return 'Account creation could not be completed because the authentication service failed. Please try again later or contact the project administrator.'
  }
  return 'Account creation could not be completed. Check your details or contact the project administrator.'
}

export function signInErrorMessage(error: AuthFailure): string {
  switch (error.code) {
    case 'email_not_confirmed':
      return 'Please confirm your email before signing in. Check your inbox and spam folder for the confirmation email. If you cannot find it, ask the project administrator to resend it.'
    case 'invalid_credentials':
      return 'Email or password is incorrect. If you recently registered, confirm your email before signing in.'
    case 'user_banned':
      return 'This account is currently disabled by the authentication service. Contact the project administrator.'
    case 'over_request_rate_limit':
      return 'Too many sign-in attempts. Wait a few minutes before trying again.'
    case 'email_address_not_authorized':
      return 'This email address is not allowed by the current Supabase Auth settings. Contact the project administrator.'
    default:
      if (error.status === undefined || error.status === 0) {
        return 'Could not reach the authentication service. Check your connection and try again.'
      }
      if (error.status >= 500) {
        return 'The authentication service is temporarily unavailable. Please try again later.'
      }
      return 'Sign-in could not be completed. Check your account details or contact the project administrator.'
  }
}
