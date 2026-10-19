import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { signInSchema, signUpSchema } from '../lib/validation'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Card } from '../components/ui/Card'

interface Values { displayName: string; email: string; password: string }

export default function LoginPage() {
  const { session, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const target = from && from.startsWith('/') && !from.startsWith('//') ? from : '/'

  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    defaultValues: { displayName: '', email: '', password: '' },
  })

  if (session) return <Navigate to={target} replace />

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null); setNotice(null)
    const parsed = (mode === 'signin' ? signInSchema : signUpSchema).safeParse(values)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) setError(issue.path[0] as keyof Values, { message: issue.message })
      return
    }
    try {
      if (mode === 'signin') { await signIn(values.email.trim(), values.password); navigate(target, { replace: true }) }
      else {
        const r = await signUp(values.email.trim(), values.password, values.displayName.trim())
        if (r.needsConfirmation) { setNotice('Account created. Check your e-mail to confirm it, then sign in.'); setMode('signin'); reset() }
      }
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Something went wrong.') }
  })

  return (
    <div className="grid min-h-full place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-white"><ShieldCheck className="h-7 w-7" aria-hidden="true" /></span>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{mode === 'signin' ? 'Sign in to TrustVault' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-slate-500">Secure document storage with a tamper-evident audit trail.</p>
        </div>
        <Card className="p-6">
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
            {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
            {mode === 'signup' && <Input label="Name" autoComplete="name" error={errors.displayName?.message} {...register('displayName')} />}
            <Input label="E-mail" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
            <Input label="Password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              hint={mode === 'signup' ? 'At least 12 characters.' : undefined} error={errors.password?.message} {...register('password')} />
            <Button type="submit" className="w-full" loading={isSubmitting}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-sm text-slate-600">
          {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
          <button type="button" className="font-medium text-brand-600 hover:underline"
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setFormError(null); setNotice(null) }}>
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
        {mode === 'signup' && <p className="mt-2 text-center text-xs text-slate-500">New accounts start as viewers. An administrator can grant upload rights.</p>}
      </div>
    </div>
  )
}
