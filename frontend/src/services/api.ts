import type { Learner, Roadmap } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : 'https://learnova-ai-dfti.onrender.com')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.')
  return result as T
}
export const api = {
  health: () => request<{ status: string; geminiConfigured: boolean }>('/api/health'),
  generate: (learner: Learner) => request<{ roadmap: Roadmap }>('/api/generate', { method: 'POST', body: JSON.stringify({ learner }) }),
  chat: (message: string) => request<{ answer: string; roadmap_updated: Roadmap | null }>('/api/chat', { method: 'POST', body: JSON.stringify({ message }) }),
  loadWorkspace: () => request<{ workspace: unknown }>('/api/workspace'),
  saveWorkspace: (workspace: unknown) => request<{ saved: boolean }>('/api/workspace', { method: 'POST', body: JSON.stringify(workspace) }),
}
