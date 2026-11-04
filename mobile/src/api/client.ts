/**
 * CrickEye Pro — Dynamic Network Client & Dual-Transport Resolver
 * 
 * Supports seamless switching between:
 * - Cloudflare Live Demo (https://*.trycloudflare.com)
 * - Localhost (http://localhost:8000)
 * - Android Emulator Loopback (http://10.0.2.2:8000)
 * - Wi-Fi LAN Hotspot (http://192.168.x.x:8000)
 */

import { ServerPreset, PublicConfigResponse, AiCoachInsight } from '../types/session';

// Fallback in-memory storage if AsyncStorage is unlinked
let memoryStorage: Record<string, string> = {};

const STORAGE_KEY = 'crickeye_active_server_url';
export const DEFAULT_SERVER_URL = 'http://10.0.2.2:8000'; // Default Android emulator host

export const SERVER_PRESETS: ServerPreset[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare Live Demo',
    url: 'https://crickeye-demo.trycloudflare.com',
    description: 'Remote Cricket Nets / Cellular 4G/5G Tunnel Gateway',
    icon: 'cloud',
  },
  {
    id: 'localhost',
    name: 'Localhost (Port 8000)',
    url: 'http://localhost:8000',
    description: 'Local development & React Native for Web testing',
    icon: 'laptop',
  },
  {
    id: 'emulator',
    name: 'Android Studio Emulator',
    url: 'http://10.0.2.2:8000',
    description: 'Loopback to development host PC machine',
    icon: 'smartphone',
  },
  {
    id: 'lan',
    name: 'Current PC Wi-Fi LAN',
    url: 'http://10.236.212.209:8000',
    description: 'Direct zero-latency connection to host PC (10.236.212.209:8000)',
    icon: 'wifi',
  },
];

let activeServerUrl = DEFAULT_SERVER_URL;

export async function getActiveServerUrl(): Promise<string> {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      activeServerUrl = stored;
      return stored;
    }
  } catch (e) {
    if (memoryStorage[STORAGE_KEY]) {
      activeServerUrl = memoryStorage[STORAGE_KEY];
      return activeServerUrl;
    }
  }
  return activeServerUrl;
}

export async function setActiveServerUrl(url: string): Promise<void> {
  const normalized = url.trim().replace(/\/+$/, '');
  activeServerUrl = normalized;
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem(STORAGE_KEY, normalized);
  } catch (e) {
    memoryStorage[STORAGE_KEY] = normalized;
  }
}

export interface PingResult {
  ok: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
  config?: PublicConfigResponse;
}

/**
 * Measures roundtrip HTTP ping latency against /api/public-config
 */
export async function pingServer(targetUrl?: string): Promise<PingResult> {
  const base = targetUrl ? targetUrl.trim().replace(/\/+$/, '') : await getActiveServerUrl();
  const endpoint = `${base}/api/public-config`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (response.ok) {
      const config: PublicConfigResponse = await response.json();
      return { ok: true, latencyMs, statusCode: response.status, config };
    } else {
      return {
        ok: false,
        latencyMs,
        statusCode: response.status,
        error: `Server responded with HTTP ${response.status}`,
      };
    }
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      ok: false,
      latencyMs,
      error: err.name === 'AbortError' ? 'Connection timed out (6s)' : (err.message || 'Network unreachable'),
    };
  }
}

/**
 * Fetch public config containing Supabase anon key and cache version
 */
export async function fetchPublicConfig(serverUrl?: string): Promise<PublicConfigResponse | null> {
  const base = serverUrl ? serverUrl.replace(/\/+$/, '') : await getActiveServerUrl();
  try {
    const res = await fetch(`${base}/api/public-config`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[ApiClient] Failed to fetch public config:', e);
  }
  return null;
}

/**
 * Request Gemini AI Coach insights from /llm-insights
 */
export async function fetchLlmInsights(
  results: any,
  serverUrl?: string
): Promise<{ ok: boolean; llm_insights: AiCoachInsight | null; fallback_used?: boolean }> {
  const base = serverUrl ? serverUrl.replace(/\/+$/, '') : await getActiveServerUrl();
  try {
    const res = await fetch(`${base}/llm-insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[ApiClient] Failed to fetch LLM insights:', e);
  }
  return {
    ok: false,
    llm_insights: null,
    fallback_used: true,
  };
}

/**
 * Fetch the last completed session from the FastAPI backend.
 * Used when reconnecting or when the mobile app launches to show the most recent analysis.
 */
export async function fetchLastSession(
  serverUrl?: string
): Promise<any | null> {
  const base = serverUrl ? serverUrl.replace(/\/+$/, '') : await getActiveServerUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${base}/api/last-session`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[ApiClient] Failed to fetch last session:', e);
  }
  return null;
}

/**
 * Auto-detect which server preset is reachable.
 * Tries LAN → Emulator → Localhost → Cloudflare in order.
 * Returns the first reachable URL, or the current active URL as fallback.
 */
export async function autoDetectServer(): Promise<string> {
  const priorityOrder = ['lan', 'emulator', 'localhost', 'cloudflare'];

  for (const presetId of priorityOrder) {
    const preset = SERVER_PRESETS.find((p) => p.id === presetId);
    if (!preset) continue;

    const result = await pingServer(preset.url);
    if (result.ok) {
      console.log(`[ApiClient] Auto-detected server: ${preset.name} (${result.latencyMs}ms)`);
      await setActiveServerUrl(preset.url);
      return preset.url;
    }
  }

  console.warn('[ApiClient] No servers reachable, using current URL.');
  return await getActiveServerUrl();
}
