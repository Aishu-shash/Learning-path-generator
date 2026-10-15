import type { Learner, Roadmap } from '../types'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : 'https://learnova-ai-dfti.onrender.com')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${apiBaseUrl}${path}`
  const method = init?.method || 'GET'
  let response: Response
  try {
    response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  } catch (error) {
    console.error(`[API] ${method} ${url} could not be reached. Check backend availability and CORS configuration.`, error)
    throw new Error('Could not reach the learning server. It may be waking up; wait a moment and try again.')
  }

  let result: { error?: string }
  try {
    result = await response.json()
  } catch (error) {
    console.error(`[API] ${method} ${url} returned an unreadable response (HTTP ${response.status}).`, error)
    throw new Error('The learning server returned an unreadable response. Please try again.')
  }
  if (!response.ok) {
    console.error(`[API] ${method} ${url} returned HTTP ${response.status}: ${result.error || 'Unknown API error.'}`)
    throw new Error(result.error || 'The request could not be completed.')
  }
  return result as T
}
export const api = {
  health: () => request<{ status: string; geminiConfigured: boolean }>('/api/health'),
  generate: (learner: Learner) => request<{ roadmap: Roadmap }>('/api/generate', { method: 'POST', body: JSON.stringify({ learner }) }),
  chat: (message: string) => request<{ answer: string; roadmap_updated: Roadmap | null }>('/api/chat', { method: 'POST', body: JSON.stringify({ message }) }),
  loadWorkspace: () => request<{ workspace: unknown }>('/api/workspace'),
  saveWorkspace: (workspace: unknown) => request<{ saved: boolean }>('/api/workspace', { method: 'POST', body: JSON.stringify(workspace) }),
}
