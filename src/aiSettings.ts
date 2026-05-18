export interface AiSettings {
  openRouterApiKey: string
  openRouterModel: string
}

const SETTINGS_KEY = 'venue-intel-ai-settings-v1'

export const DEFAULT_AI_SETTINGS: AiSettings = {
  openRouterApiKey: '',
  openRouterModel: 'openrouter/auto',
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_AI_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AiSettings>
    return {
      openRouterApiKey: parsed.openRouterApiKey ?? '',
      openRouterModel: parsed.openRouterModel ?? DEFAULT_AI_SETTINGS.openRouterModel,
    }
  } catch {
    return DEFAULT_AI_SETTINGS
  }
}

export function saveAiSettings(settings: AiSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
