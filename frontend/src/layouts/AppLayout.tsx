import { useState, type FormEvent, type PropsWithChildren } from 'react'
import { BookOpen, CalendarDays, CheckSquare, Compass, LogOut, Plus, Sparkles } from 'lucide-react'

export function AppLayout({
  children,
  onNew,
  profileName,
  profileEmail,
  onSignIn,
  onSignOut,
  onSaveProfile,
}: PropsWithChildren<{
  onNew: () => void
  profileName: string
  profileEmail: string
  onSignIn: () => void
  onSignOut?: () => Promise<void>
  onSaveProfile?: (name: string) => Promise<void>
}>) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileNameDraft, setProfileNameDraft] = useState(profileName)
  const [profileError, setProfileError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!onSaveProfile) return
    setSavingProfile(true)
    setProfileError('')
    try {
      await onSaveProfile(profileNameDraft.trim())
      setProfileOpen(false)
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Could not update your profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  const initials = profileName.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'L'
  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="/">Learnova <span>AI</span></a>
      <p className="side-label">YOUR WORKSPACE</p>
      <nav><a href="#overview"><Compass size={17}/> Overview</a><a href="#roadmap"><BookOpen size={17}/> My roadmap</a><a href="#tasks"><CheckSquare size={17}/> Tasks</a><a href="#schedule"><CalendarDays size={17}/> Study schedule</a></nav>
      <div className="side-note"><Sparkles size={18}/><strong>A little progress adds up.</strong><small>Show up for your goals, one focused session at a time.</small></div>
      <button className="profile" type="button" onClick={() => onSaveProfile ? (setProfileNameDraft(profileName), setProfileError(''), setProfileOpen(true)) : onSignIn()} aria-label={onSaveProfile ? 'Edit your profile' : 'Sign in or create an account'}>
        <span>{initials}</span><div><b>{profileName}</b><small>{onSignOut ? 'Edit profile' : 'Sign in or create an account'}</small></div>
      </button>
    </aside>
    <main className="main" id="overview">
      <header className="topbar"><span>Workspace　/　<b>Overview</b></span><div className="topbar-actions"><button className="top-profile" type="button" onClick={() => onSaveProfile ? (setProfileNameDraft(profileName), setProfileError(''), setProfileOpen(true)) : onSignIn()}><span>{initials}</span>{onSignOut ? profileName : 'Sign in'}</button><button className="icon-button" onClick={onNew} aria-label="Create learning path"><Plus/></button></div></header>
      {children}
      <footer>Made for curious minds <span>♥</span></footer>
    </main>
    {profileOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setProfileOpen(false) }}>
      <section className="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button className="modal-close" type="button" onClick={() => setProfileOpen(false)} aria-label="Close profile">×</button>
        <span className="eyebrow">YOUR LEARNOVA ACCOUNT</span>
        <h2 id="profile-title">Your profile</h2>
        <p>{profileEmail}</p>
        <form className="auth-form" onSubmit={saveProfile}>
          <label>Display name<input value={profileNameDraft} onChange={event => setProfileNameDraft(event.target.value)} required maxLength={80}/></label>
          {profileError && <p className="auth-message auth-error" role="alert">{profileError}</p>}
          <button className="primary" type="submit" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save profile'}</button>
        </form>
        {onSignOut && <button className="signout-button" type="button" onClick={() => void onSignOut()}><LogOut size={16}/> Sign out</button>}
      </section>
    </div>}
  </div>
}
