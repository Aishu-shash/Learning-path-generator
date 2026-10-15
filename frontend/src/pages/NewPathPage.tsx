import { useState, type FormEvent } from 'react'
import type { Learner } from '../types'
export function NewPathPage({ onClose, onGenerate }: { onClose: () => void; onGenerate: (learner: Learner) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true)
    const data = new FormData(event.currentTarget)
    const learner = Object.fromEntries(data.entries()) as unknown as Learner
    learner.hours_per_day = Number(learner.hours_per_day)
    try { await onGenerate(learner) } finally { setBusy(false) }
  }
  return <div className="modal-backdrop"><section className="modal"><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">LET'S MAKE A PLAN</span><h2>What would you love to learn?</h2><p>Share a little about your goal. Your roadmap will be built around you.</p><form onSubmit={submit} className="form-grid"><label>Your name<input name="name" placeholder="e.g. Aishwarya" required maxLength={80}/></label><label>Learning goal<input name="goal" placeholder="e.g. Learn Python" required maxLength={200}/></label><label>Current level<select name="level" required><option value="">Choose level</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><label>Target date<input name="target_date" type="date" min={new Date().toISOString().slice(0,10)} required/></label><label className="wide">What do you already know?<textarea name="knowledge" rows={3} maxLength={1200}/></label><label>Study time per day<input name="hours_per_day" type="number" min="0.5" max="12" step="0.5" defaultValue="2"/></label><label>Learning style<select name="learning_style"><option>Mixed learning styles</option><option>Reading and notes</option><option>Videos and examples</option><option>Hands-on practice</option><option>Practice questions</option></select></label><button className="primary wide" disabled={busy}>{busy ? 'Building your plan…' : 'Generate my path →'}</button></form></section></div>
}
