/**
 * CrickEye Mobile — useTelemetry Hook
 * Reactive state hook for real-time WebSocket telemetry during video analysis.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { TelemetrySocketClient, TelemetryProgress, SocketStatus } from '../api/telemetrySocket';
import { SessionResults } from '../types/session';

interface UseTelemetryOptions {
  serverUrl: string;
  onComplete?: (results: SessionResults) => void;
  onError?: (error: string) => void;
}

export function useTelemetry({ serverUrl, onComplete, onError }: UseTelemetryOptions) {
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('DISCONNECTED');
  const [progress, setProgress] = useState<number>(0);
  const [currentFrame, setCurrentFrame] = useState<number | null>(null);
  const [currentFps, setCurrentFps] = useState<number | null>(null);
  const [results, setResults] = useState<SessionResults | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const clientRef = useRef<TelemetrySocketClient | null>(null);

  useEffect(() => {
    const client = new TelemetrySocketClient(serverUrl);
    clientRef.current = client;

    client.connect(
      (msg: TelemetryProgress) => {
        if (msg.type === 'progress') {
          if (msg.progress !== undefined) setProgress(msg.progress);
          if (msg.frame !== undefined) setCurrentFrame(msg.frame);
          if (msg.fps !== undefined) setCurrentFps(msg.fps);
        } else if (msg.type === 'complete' && msg.results) {
          setProgress(100);
          setIsProcessing(false);
          setResults(msg.results);
          if (onComplete) onComplete(msg.results);
        } else if (msg.type === 'error') {
          setIsProcessing(false);
          if (onError) onError(msg.message || 'Pipeline analysis error');
        }
      },
      (status) => setSocketStatus(status)
    ).catch((err) => {
      console.warn('[useTelemetry] Connection failed:', err);
    });

    return () => {
      client.disconnect();
    };
  }, [serverUrl]);

  const startAnalysis = useCallback((serverVideoPath: string) => {
    setProgress(0);
    setCurrentFrame(null);
    setCurrentFps(null);
    setResults(null);
    setIsProcessing(true);

    if (clientRef.current) {
      clientRef.current.startAnalysis(serverVideoPath);
    }
  }, []);

  const reset = useCallback(() => {
    setProgress(0);
    setCurrentFrame(null);
    setCurrentFps(null);
    setResults(null);
    setIsProcessing(false);
  }, []);

  return {
    socketStatus,
    progress,
    currentFrame,
    currentFps,
    results,
    isProcessing,
    startAnalysis,
    reset,
  };
}
