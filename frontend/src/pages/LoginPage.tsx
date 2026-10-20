import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Check, Database, Lock, Shield, Sparkles } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { signInSchema, signUpSchema } from '../lib/validation'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Card } from '../components/ui/Card'

interface Values {
  displayName: string
  email: string
  password: string
}

export default function LoginPage() {
  const { session, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const target =
    from && from.startsWith('/') && !from.startsWith('//') && !from.toLowerCase().startsWith('/login')
      ? from
      : '/'

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: { displayName: '', email: '', password: '' },
  })

  if (session) return <Navigate to={target} replace />

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    setNotice(null)
    const parsed = (mode === 'signin' ? signInSchema : signUpSchema).safeParse(values)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) setError(issue.path[0] as keyof Values, { message: issue.message })
      return
    }
    try {
      if (mode === 'signin') {
        await signIn(values.email.trim(), values.password)
        navigate(target, { replace: true })
      } else {
        const r = await signUp(values.email.trim(), values.password, values.displayName.trim())
        if (r.needsConfirmation) {
          setNotice('Account created. Check your e-mail to confirm it, then sign in.')
          setMode('signin')
          reset()
        }
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  })

  return (
    <div className="relative min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col justify-center items-center px-4 py-12 sm:px-6 lg:px-8 overflow-hidden selection:bg-blue-600 selection:text-white">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[32rem] w-[48rem] rounded-full bg-gradient-to-b from-blue-600/20 via-indigo-600/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-10 h-72 w-72 rounded-full bg-blue-500/10 blur-2xl" />

      {/* Decorative subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
          backgroundSize: '36px 36px',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-2 relative">
            <img
              src="/logo-icon.png"
              alt="TrustVault Emblem"
              className="h-20 w-auto object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-300"
            />
          </div>

          <div className="flex flex-col items-center">
            <span className="text-2xl font-extrabold tracking-tight text-white">TrustVault</span>
            <span className="text-2xs font-semibold tracking-widest uppercase text-blue-400 mt-0.5">
              Secure · Manage · Share
            </span>
          </div>

          <h1 className="mt-3 text-base font-semibold tracking-tight text-slate-200">
            {mode === 'signin' ? 'Sign in to TrustVault' : 'Create your account'}
          </h1>

          {/* Funny security quote pill */}
          <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/90 px-3.5 py-1 text-xs font-medium text-slate-300 shadow-xs">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
            <span>
              {mode === 'signin'
                ? 'Welcome back, document guardian.'
                : 'Securing your files faster than you can say password123.'}
            </span>
          </p>
        </div>

        {/* Card form */}
        <Card className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xl sm:p-8 text-slate-900">
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {notice && (
              <p
                role="status"
                className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800"
              >
                <Check className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                <span>{notice}</span>
              </p>
            )}
            {formError && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700"
              >
                {formError}
              </p>
            )}

            {mode === 'signup' && (
              <Input
                label="Name"
                autoComplete="name"
                placeholder="Agent Jane"
                error={errors.displayName?.message}
                {...register('displayName')}
              />
            )}

            <Input
              label="E-mail"
              type="email"
              autoComplete="email"
              placeholder="guardian@example.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              hint={mode === 'signup' ? 'At least 12 characters.' : undefined}
              placeholder="••••••••••••"
              error={errors.password?.message}
              {...register('password')}
            />

            <Button type="submit" className="w-full mt-2" loading={isSubmitting}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <div className="mt-5 border-t border-slate-100 pt-4 text-center">
            <p className="text-xs text-slate-600">
              {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
              <button
                type="button"
                className="cursor-pointer font-bold text-blue-600 hover:text-blue-700 hover:underline"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin')
                  setFormError(null)
                  setNotice(null)
                }}
              >
                {mode === 'signin' ? 'Create an account' : 'Sign in'}
              </button>
            </p>
            {mode === 'signup' && (
              <p className="mt-2 text-2xs text-slate-400">
                Every signed-in account can upload and own documents. Access to other people's documents is granted separately by each owner.
              </p>
            )}
          </div>
        </Card>

        {/* Security badges guarantee bar */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-2xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-blue-400" aria-hidden="true" />
            <span>256-bit AES Private Storage</span>
          </div>
          <span className="text-slate-700">·</span>
          <div className="flex items-center gap-1.5">
            <Database className="h-3 w-3 text-emerald-400" aria-hidden="true" />
            <span>Tamper-Evident SHA-256 Ledger</span>
          </div>
          <span className="text-slate-700">·</span>
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-indigo-400" aria-hidden="true" />
            <span>Strict RBAC</span>
          </div>
        </div>
      </div>
    </div>
  )
}
