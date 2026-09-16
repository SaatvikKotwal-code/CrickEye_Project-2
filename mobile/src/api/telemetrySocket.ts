/**
 * CrickEye Mobile — WebSocket Telemetry Client
 * 
 * Manages resilient bidirectional WebSocket communication with the FastAPI backend (/ws)
 * to trigger video analysis and stream frame-by-frame progress updates.
 * Implements 25s keepalive heartbeat for Cloudflare Tunnel persistence.
 */

import { SessionResults } from '../types/session';

export interface TelemetryProgress {
  type: 'progress' | 'metrics' | 'complete' | 'error' | 'pong';
  progress?: number;
  frame?: number;
  fps?: number;
  results?: SessionResults;
  message?: string;
}

export type SocketStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

export class TelemetrySocketClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: any = null;
  private heartbeatInterval: any = null;
  private isExplicitlyClosed = false;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  public connect(
    onMessage: (data: TelemetryProgress) => void,
    onStatusChange?: (status: SocketStatus) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isExplicitlyClosed = false;
      const wsProtocol = this.serverUrl.startsWith('https') ? 'wss' : 'ws';
      const cleanHost = this.serverUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      const socketUrl = `${wsProtocol}://${cleanHost}/ws`;

      if (onStatusChange) onStatusChange('CONNECTING');

      try {
        this.ws = new WebSocket(socketUrl);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          if (onStatusChange) onStatusChange('CONNECTED');
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data: TelemetryProgress = JSON.parse(event.data);
            if (data.type === 'pong') {
              // Keep-alive acknowledgment
              return;
            }
            onMessage(data);
          } catch (e) {
            console.warn('[TelemetrySocket] Failed to parse message:', event.data);
          }
        };

        this.ws.onerror = (err) => {
          console.error('[TelemetrySocket] Socket error:', err);
        };

        this.ws.onclose = () => {
          this.stopHeartbeat();
          if (onStatusChange) onStatusChange('DISCONNECTED');
          if (!this.isExplicitlyClosed) {
            this.handleReconnect(onMessage, onStatusChange);
          }
        };
      } catch (err) {
        if (onStatusChange) onStatusChange('DISCONNECTED');
        reject(err);
      }
    });
  }

  public startAnalysis(videoPath: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'start',
        video_path: videoPath,
      }));
    } else {
      console.error('[TelemetrySocket] Cannot start analysis: WebSocket is not connected.');
    }
  }

  /**
   * Cloudflare Tunnel drops idle websockets after 100 seconds.
   * Send heartbeat every 25 seconds.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ action: 'ping' }));
        } catch (e) {
          console.warn('[TelemetrySocket] Heartbeat ping failed:', e);
        }
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleReconnect(
    onMessage: (data: TelemetryProgress) => void,
    onStatusChange?: (status: SocketStatus) => void
  ): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(2500 * Math.pow(1.8, this.reconnectAttempts - 1), 15000);
      console.log(`[TelemetrySocket] Reconnecting in ${Math.round(delay)}ms (Attempt ${this.reconnectAttempts})...`);
      
      this.reconnectTimer = setTimeout(() => {
        this.connect(onMessage, onStatusChange).catch(() => {});
      }, delay);
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
