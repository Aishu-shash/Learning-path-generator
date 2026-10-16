import { useState, type FormEvent } from 'react'
import { ArrowRight, BookOpen, CheckCircle2, Sparkles } from 'lucide-react'

type AuthMode = 'login' | 'signup'

export function AuthPage({
  mode,
  onModeChange,
  onAuthenticate,
  error,
  onClearError,
  onBack,
}: {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onAuthenticate: (email: string, password: string, name?: string) => Promise<string | void>
  error: string
  onClearError: () => void
  onBack?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setFormError('')
    onClearError()
    const values = new FormData(event.currentTarget)
    try {
      const result = await onAuthenticate(
        String(values.get('email')),
        String(values.get('password')),
        mode === 'signup' ? String(values.get('name')) : undefined,
      )
      if (result) setMessage(result)
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'We could not complete your request. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const activeError = formError || error
  return <main className="auth-screen">
    <div className="auth-backdrop auth-backdrop-one" />
    <div className="auth-backdrop auth-backdrop-two" />
    <div className="auth-header">
      {onBack && <button className="auth-back" type="button" onClick={onBack}>← Back to learning studio</button>}
      <a className="auth-brand brand" href="/"><span className="brand-mark"><BookOpen size={20}/></span>Learnova <span>AI</span></a>
    </div>
    <section className="auth-card">
      <div className="auth-copy">
        <span className="auth-kicker"><Sparkles size={15}/> YOUR PERSONAL LEARNING STUDIO</span>
        <h1>{mode === 'signup' ? 'A new chapter starts here.' : 'Welcome back, learner.'}</h1>
        <p>{mode === 'signup' ? 'Create your account and turn your next big goal into a clear, doable plan.' : 'Pick up where your curiosity left off and keep your learning journey moving.'}</p>
        <div className="auth-promise"><CheckCircle2 size={18}/><span>Your goals, roadmap, and progress in one place.</span></div>
      </div>
      <div className="auth-form-side">
        <div className="auth-switch" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'selected' : ''} onClick={() => { onModeChange('login'); setMessage(''); setFormError('') }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'selected' : ''} onClick={() => { onModeChange('signup'); setMessage(''); setFormError('') }}>Create account</button>
        </div>
        <span className="eyebrow">{mode === 'signup' ? 'GET STARTED FOR FREE' : 'YOUR JOURNEY CONTINUES'}</span>
        <h2>{mode === 'signup' ? 'Create your account' : 'Sign in to Learnova'}</h2>
        <p className="auth-subtitle">{mode === 'signup' ? 'A few details and you are ready to learn.' : 'Enter your details to access your learning space.'}</p>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && <label>Full name<input name="name" type="text" autoComplete="name" placeholder="Your name" required maxLength={80}/></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required/></label>
          <label>Password<input name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} minLength={8} required/></label>
          {activeError && <p className="auth-message auth-error" role="alert">{activeError}</p>}
          {message && <p className="auth-message auth-success" role="status">{message}</p>}
          <button className="primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create my account' : 'Sign in'} {!busy && <ArrowRight size={18}/>}
          </button>
        </form>
        <p className="auth-toggle">
          {mode === 'signup' ? 'Already have an account?' : 'New to Learnova?'}
          <button type="button" onClick={() => { onModeChange(mode === 'signup' ? 'login' : 'signup'); setMessage(''); setFormError('') }}>{mode === 'signup' ? 'Sign in' : 'Create an account'}</button>
        </p>
      </div>
    </section>
    <p className="auth-footer">Thoughtful plans for curious minds <span>✦</span></p>
  </main>
}
