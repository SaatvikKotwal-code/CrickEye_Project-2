/**
 * CrickEye Mobile — useServerUrl Hook
 * Manages active backend URL, presets, live latency ping diagnostics, and connection state.
 * Supports auto-detect on first launch and periodic health re-checks.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getActiveServerUrl,
  setActiveServerUrl,
  pingServer,
  autoDetectServer,
  SERVER_PRESETS,
  DEFAULT_SERVER_URL,
  PingResult,
} from '../api/client';
import { ConnectionStatus, ServerPreset } from '../types/session';

const HEALTH_RECHECK_INTERVAL_MS = 30_000; // 30 seconds

export function useServerUrl() {
  const [serverUrl, setServerUrlState] = useState<string>(DEFAULT_SERVER_URL);
  const [status, setStatus] = useState<ConnectionStatus>('CONNECTING');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastPingError, setLastPingError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const healthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load initial URL from storage, auto-detect if needed
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const storedUrl = await getActiveServerUrl();

      // If it's still the default, attempt auto-detect to find a reachable server
      if (storedUrl === DEFAULT_SERVER_URL) {
        console.log('[useServerUrl] First launch — auto-detecting backend...');
        const detectedUrl = await autoDetectServer();
        if (isMounted) {
          setServerUrlState(detectedUrl);
          setIsLoading(false);
          checkHealth(detectedUrl);
        }
      } else {
        if (isMounted) {
          setServerUrlState(storedUrl);
          setIsLoading(false);
          checkHealth(storedUrl);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Periodic health re-check
  useEffect(() => {
    if (healthTimerRef.current) {
      clearInterval(healthTimerRef.current);
    }

    healthTimerRef.current = setInterval(() => {
      if (serverUrl) {
        checkHealth(serverUrl);
      }
    }, HEALTH_RECHECK_INTERVAL_MS);

    return () => {
      if (healthTimerRef.current) {
        clearInterval(healthTimerRef.current);
      }
    };
  }, [serverUrl]);

  const checkHealth = useCallback(async (targetUrl?: string): Promise<PingResult> => {
    setStatus('CONNECTING');
    const result = await pingServer(targetUrl || serverUrl);
    if (result.ok) {
      setStatus('CONNECTED');
      setLatencyMs(result.latencyMs);
      setLastPingError(null);
    } else {
      setStatus('ERROR');
      setLatencyMs(null);
      setLastPingError(result.error || 'Connection failed');
    }
    return result;
  }, [serverUrl]);

  const updateServerUrl = useCallback(async (newUrl: string) => {
    const clean = newUrl.trim().replace(/\/+$/, '');
    await setActiveServerUrl(clean);
    setServerUrlState(clean);
    await checkHealth(clean);
  }, [checkHealth]);

  const selectPreset = useCallback(async (presetId: string) => {
    const found = SERVER_PRESETS.find((p) => p.id === presetId);
    if (found) {
      await updateServerUrl(found.url);
    }
  }, [updateServerUrl]);

  const runAutoDetect = useCallback(async () => {
    setIsLoading(true);
    const detected = await autoDetectServer();
    setServerUrlState(detected);
    setIsLoading(false);
    await checkHealth(detected);
    return detected;
  }, [checkHealth]);

  return {
    serverUrl,
    setServerUrl: updateServerUrl,
    presets: SERVER_PRESETS,
    selectPreset,
    status,
    latencyMs,
    lastPingError,
    checkHealth,
    isLoading,
    autoDetect: runAutoDetect,
  };
}
