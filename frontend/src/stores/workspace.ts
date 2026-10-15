import { useEffect, useState } from 'react'
import type { Workspace } from '../types'
import { api } from '../services/api'
const KEY = 'learnpath-workspace-v2'
export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || localStorage.getItem('learnpath.workspace.v1') || 'null') as Workspace | null } catch { return null }
  })
  useEffect(() => {
    let active = true
    void api.loadWorkspace().then(({ workspace: saved }) => {
      if (active && !workspace && saved) setWorkspace(saved as Workspace)
      else if (active && workspace && !saved) void api.saveWorkspace(workspace).catch(() => {})
    }).catch(() => {})
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!workspace) return
    localStorage.setItem(KEY, JSON.stringify(workspace))
    const handle = window.setTimeout(() => { void api.saveWorkspace(workspace).catch(() => {}) }, 400)
    return () => window.clearTimeout(handle)
  }, [workspace])
  return { workspace, setWorkspace }
}
