import { useEffect, useState } from 'react'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { NewPathPage } from './pages/NewPathPage'
import { AuthPage } from './pages/AuthPage'
import { useWorkspace } from './stores/workspace'
import { api } from './services/api'
import { supabase } from './services/supabase'
import { authenticateLocally, getLocalSession, signOutLocally, updateLocalProfile, type LocalUser } from './services/localAuth'
import type { Learner, Workspace } from './types'
import type { User } from '@supabase/supabase-js'

type AppUser = User | LocalUser

export default function App() {
  const { workspace, setWorkspace } = useWorkspace()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<AppUser | null>(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    if (!supabase) {
      try {
        setUser(getLocalSession())
      } catch (sessionError) {
        setError(sessionError instanceof Error ? sessionError.message : 'Could not load your local account.')
      }
      return
    }
    let active = true
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(sessionError.message)
      setUser(data.session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function generate(learner: Learner) {
    setError('')
    try {
      const { roadmap } = await api.generate(learner)
      const tasks = roadmap.phases.flatMap(phase => phase.tasks || [])
      setWorkspace({ learner, roadmap, tasks, completedIds: [] })
      setCreating(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not generate your learning plan.') }
  }
  function toggle(index: number) {
    if (!workspace) return
    const id = String(index)
    const completedIds = workspace.completedIds.includes(id) ? workspace.completedIds.filter(item => item !== id) : [...workspace.completedIds, id]
    setWorkspace({ ...workspace, completedIds } as Workspace)
  }

  async function authenticate(email: string, password: string, name?: string) {
    if (!supabase) {
      const localUser = await authenticateLocally(email, password, name)
      setUser(localUser)
      setAuthOpen(false)
      return
    }
    if (name) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      })
      if (signUpError) throw signUpError
      if (!data.session) return 'Account created. Check your email to confirm your account, then sign in.'
      setUser(data.user)
      return
    }
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) throw signInError
    setUser(data.user)
  }

  async function updateProfile(name: string) {
    if (!supabase) {
      if (!user || !('provider' in user)) throw new Error('Your local account could not be found. Sign in again.')
      setUser(updateLocalProfile(user, name))
      return
    }
    const { data, error: updateError } = await supabase.auth.updateUser({ data: { full_name: name } })
    if (updateError) throw updateError
    setUser(data.user)
  }

  async function signOut() {
    if (!supabase) {
      signOutLocally()
      setUser(null)
      setAuthMode('login')
      setAuthOpen(true)
      return
    }
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
  }

  if (authLoading) return <main className="auth-loading" aria-label="Loading account"><span className="loading-orb" /></main>
  if ((supabase && !user) || authOpen) {
    return <AuthPage
      mode={authMode}
      onModeChange={setAuthMode}
      onAuthenticate={authenticate}
      error={error}
      onClearError={() => setError('')}
      onBack={supabase ? undefined : () => setAuthOpen(false)}
    />
  }

  const profileName = user?.user_metadata.full_name || user?.email?.split('@')[0] || 'Guest learner'
  return <AppLayout
    onNew={() => setCreating(true)}
    profileName={profileName}
    profileEmail={user?.email || 'Your personal learning space'}
    onSignIn={() => { setAuthMode('login'); setAuthOpen(true) }}
    onSignOut={user ? signOut : undefined}
    onSaveProfile={user ? updateProfile : undefined}
  >
    <DashboardPage workspace={workspace} onToggle={toggle} onNew={() => setCreating(true)}/>
    {error && <div className="toast" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    {creating && <NewPathPage onClose={() => setCreating(false)} onGenerate={generate}/>}
  </AppLayout>
}
