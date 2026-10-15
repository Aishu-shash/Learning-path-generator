import { useState } from 'react'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { NewPathPage } from './pages/NewPathPage'
import { useWorkspace } from './stores/workspace'
import { api } from './services/api'
import type { Learner, Workspace } from './types'
export default function App() {
  const { workspace, setWorkspace } = useWorkspace()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
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
  return <AppLayout onNew={() => setCreating(true)}><DashboardPage workspace={workspace} onToggle={toggle} onNew={() => setCreating(true)}/>{error && <div className="toast" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}{creating && <NewPathPage onClose={() => setCreating(false)} onGenerate={generate}/>}</AppLayout>
}
