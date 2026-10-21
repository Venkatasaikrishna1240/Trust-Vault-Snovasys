export interface AuthFailure {
  code?: string
  status?: number
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
