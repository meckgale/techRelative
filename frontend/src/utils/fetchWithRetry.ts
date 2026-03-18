const RETRY_DELAYS = [1000, 3000, 5000]

export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = RETRY_DELAYS.length,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options)
      if (!res.ok) throw new Error(`API ${res.status}`)
      return res
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      if (attempt === retries) throw err
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]))
    }
  }
  throw new Error('Unreachable')
}

export function friendlyError(err: unknown): string {
  if (!navigator.onLine) return 'You appear to be offline'
  if (err instanceof TypeError) return 'Could not reach the server'
  if (err instanceof Error) {
    if (err.message.startsWith('API 5')) return 'Server error — please try again'
    if (err.message.startsWith('API 4')) return 'Request failed'
    return err.message
  }
  return 'Something went wrong'
}
