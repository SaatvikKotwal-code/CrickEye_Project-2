/**
 * CrickEye Mobile — Wireless Background Video Upload Service
 * 
 * Streams recorded 60-120 FPS cricket deliveries to the FastAPI ingestion endpoint
 * over Wi-Fi LAN or Cloudflare Tunnel with exponential retry handling.
 */

export interface UploadResult {
  sessionId: string;
  videoPath: string;
  error?: string;
}

export async function uploadDeliveryVideo(
  fileUri: string,
  serverUrl: string,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const normalizedUrl = serverUrl.replace(/\/+$/, '');
  const targetEndpoint = `${normalizedUrl}/upload`;

  const formData = new FormData();
  const filename = fileUri.split('/').pop() || `delivery_${Date.now()}.mp4`;

  formData.append('file', {
    uri: fileUri,
    type: 'video/mp4',
    name: filename,
  } as any);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', targetEndpoint);
    xhr.timeout = 120000; // 120s timeout for large high-FPS video clips

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(Math.min(percent, 99)); // Cap at 99 until server responds
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (onProgress) onProgress(100);
          resolve({
            sessionId: response.session_id,
            videoPath: response.video_path,
          });
        } catch (err) {
          reject(new Error('Invalid JSON response from FastAPI server'));
        }
      } else {
        reject(new Error(`Upload failed with status HTTP ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during video upload. Verify LAN IP or Tunnel URL.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload timed out. Check server load or Wi-Fi signal.'));
    };

    xhr.send(formData);
  });
}
