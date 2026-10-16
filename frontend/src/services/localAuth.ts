const ACCOUNTS_KEY = 'learnova-local-accounts-v1'
const SESSION_KEY = 'learnova-local-session-v1'
const HASH_ITERATIONS = 120_000
const HASH_LENGTH = 256

interface LocalAccount {
  email: string
  name: string
  salt: string
  passwordHash: string
}

export interface LocalUser {
  provider: 'local'
  email: string
  user_metadata: { full_name: string }
}

function readAccounts(): LocalAccount[] {
  const stored = localStorage.getItem(ACCOUNTS_KEY)
  if (!stored) return []
  const accounts: unknown = JSON.parse(stored)
  if (!Array.isArray(accounts) || !accounts.every(account =>
    account && typeof account.email === 'string' &&
    typeof account.name === 'string' && typeof account.salt === 'string' &&
    typeof account.passwordHash === 'string'
  )) {
    throw new Error('Local account data is invalid. Clear this site’s local storage and create your account again.')
  }
  return accounts
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure password hashing is unavailable. Open the app on localhost or use a modern browser.')
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: HASH_ITERATIONS, hash: 'SHA-256' },
    key,
    HASH_LENGTH,
  )
  return toHex(new Uint8Array(bits))
}

function decodeSalt(salt: string): Uint8Array<ArrayBuffer> {
  const binary = atob(salt)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function saveSession(account: LocalAccount): LocalUser {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email: account.email }))
  return { provider: 'local', email: account.email, user_metadata: { full_name: account.name } }
}

export async function authenticateLocally(emailInput: string, password: string, name?: string): Promise<LocalUser> {
  const email = emailInput.trim().toLowerCase()
  const accounts = readAccounts()
  const existing = accounts.find(account => account.email === email)

  if (name !== undefined) {
    if (existing) throw new Error('An account with this email already exists. Please sign in instead.')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const account: LocalAccount = {
      email,
      name: name.trim(),
      salt: btoa(String.fromCharCode(...salt)),
      passwordHash: await hashPassword(password, salt),
    }
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, account]))
    return saveSession(account)
  }

  if (!existing) throw new Error('No local account was found for this email. Create an account first.')
  const expected = existing.passwordHash
  const actual = await hashPassword(password, decodeSalt(existing.salt))
  if (actual.length !== expected.length || [...actual].some((character, index) => character !== expected[index])) {
    throw new Error('Incorrect email or password.')
  }
  return saveSession(existing)
}

export function getLocalSession(): LocalUser | null {
  const stored = localStorage.getItem(SESSION_KEY)
  if (!stored) return null
  const session: unknown = JSON.parse(stored)
  if (!session || typeof session !== 'object' || !('email' in session) || typeof session.email !== 'string') {
    throw new Error('Local session data is invalid. Sign in again.')
  }
  const account = readAccounts().find(item => item.email === session.email)
  if (!account) {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
  return { provider: 'local', email: account.email, user_metadata: { full_name: account.name } }
}

export function updateLocalProfile(user: LocalUser, name: string): LocalUser {
  const accounts = readAccounts()
  const account = accounts.find(item => item.email === user.email)
  if (!account) throw new Error('Your local account could not be found. Sign in again.')
  account.name = name.trim()
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
  return { provider: 'local', email: account.email, user_metadata: { full_name: account.name } }
}

export function signOutLocally(): void {
  localStorage.removeItem(SESSION_KEY)
}
