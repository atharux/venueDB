export interface AiSettings {
  openRouterApiKey: string
  openRouterModel: string
}

const SETTINGS_KEY = 'venue-intel-ai-settings-v1'

// 'auto-free' = discover and use the best live *free* model (see scraper-core).
// Replaces the old 'openrouter/auto' default, which was the PAID auto-router.
export const DEFAULT_AI_SETTINGS: AiSettings = {
  openRouterApiKey: '',
  openRouterModel: 'auto-free',
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_AI_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AiSettings>
    const stored = parsed.openRouterModel ?? DEFAULT_AI_SETTINGS.openRouterModel
    return {
      openRouterApiKey: parsed.openRouterApiKey ?? '',
      // Migrate legacy paid-router preference to the free auto default.
      openRouterModel: stored === 'openrouter/auto' ? 'auto-free' : stored,
    }
  } catch {
    return DEFAULT_AI_SETTINGS
  }
}

export function saveAiSettings(settings: AiSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

// Live free-model list for the Settings picker — keeps the dropdown from going
// stale. Cached in localStorage (24h). Returns [] if no key / fetch fails, so
// the UI just falls back to free-text entry.
const MODELS_CACHE_KEY = 'venue-intel-free-models-v1'
const MODELS_TTL_MS = 24 * 60 * 60 * 1000
const MODEL_SKIP = /coder|math|code-|content-safety|guard|moderation|lyria|whisper|embed|rerank/i

export async function fetchFreeModelIds(apiKey: string): Promise<string[]> {
  if (!apiKey) return []
  try {
    const cachedRaw = localStorage.getItem(MODELS_CACHE_KEY)
    if (cachedRaw) {
      const c = JSON.parse(cachedRaw) as { ids: string[]; at: number }
      if (Date.now() - c.at < MODELS_TTL_MS && c.ids.length) return c.ids
    }
  } catch {
    // ignore cache errors
  }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return []
    const { data } = (await res.json()) as {
      data: Array<{ id: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }>
    }
    const ids = (data || [])
      .filter(m => {
        const id = String(m.id || '')
        const isFree = id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0')
        return isFree && !MODEL_SKIP.test(id)
      })
      .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
      .map(m => m.id)
    if (ids.length) localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ ids, at: Date.now() }))
    return ids
  } catch {
    return []
  }
}
