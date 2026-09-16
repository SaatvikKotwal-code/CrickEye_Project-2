/**
 * CrickEye Mobile — useServerUrl Hook
 * Manages active backend URL, presets, live latency ping diagnostics, and connection state.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getActiveServerUrl,
  setActiveServerUrl,
  pingServer,
  SERVER_PRESETS,
  PingResult,
} from '../api/client';
import { ConnectionStatus, ServerPreset } from '../types/session';

export function useServerUrl() {
  const [serverUrl, setServerUrlState] = useState<string>('http://10.0.2.2:8000');
  const [status, setStatus] = useState<ConnectionStatus>('CONNECTING');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastPingError, setLastPingError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load initial URL from storage
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const url = await getActiveServerUrl();
      if (isMounted) {
        setServerUrlState(url);
        setIsLoading(false);
        checkHealth(url);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

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
  };
}
