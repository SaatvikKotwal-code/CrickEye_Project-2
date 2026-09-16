import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  VideoFile,
} from 'react-native-vision-camera';
import { uploadDeliveryVideo } from '../services/uploadService';
import { TelemetrySocketClient, TelemetryProgress } from '../services/telemetrySocket';

interface CameraCaptureScreenProps {
  serverUrl: string;
  onAnalysisComplete?: (results: any) => void;
}

export const CameraCaptureScreen: React.FC<CameraCaptureScreenProps> = ({
  serverUrl,
  onAnalysisComplete,
}) => {
  const cameraRef = useRef<any>(null);
  const device = useCameraDevice('back');

  // Select 60-120 FPS capture format where hardware permits
  const format = useCameraFormat(device, [
    { fps: 120 },
    { fps: 60 },
    { videoResolution: { width: 1280, height: 720 } },
  ]);

  const [hasPermission, setHasPermission] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED');

  const socketClientRef = useRef<TelemetrySocketClient | null>(null);

  useEffect(() => {
    (async () => {
      const cameraStatus = await Camera.requestCameraPermission();
      const micStatus = await Camera.requestMicrophonePermission();
      setHasPermission(cameraStatus === 'granted' && micStatus === 'granted');
    })();

    // Initialize telemetry socket
    const client = new TelemetrySocketClient(serverUrl);
    socketClientRef.current = client;

    client.connect(
      (data: TelemetryProgress) => {
        if (data.type === 'progress' && data.progress !== undefined) {
          setAnalysisProgress(data.progress);
        } else if (data.type === 'complete') {
          setAnalysisProgress(100);
          if (onAnalysisComplete) onAnalysisComplete(data.results);
          Alert.alert('Analysis Complete', 'Delivery processed successfully!');
        }
      },
      (status) => setConnectionStatus(status)
    ).catch((e) => console.log('Socket connect error:', e));

    return () => {
      client.disconnect();
    };
  }, [serverUrl]);

  const startCountdownAndRecord = () => {
    if (isRecording || !cameraRef.current) return;

    let count = 3;
    setCountdown(count);

    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(timer);
        setCountdown(null);
        startRecording();
      }
    }, 1000);
  };

  const startRecording = async () => {
    if (!cameraRef.current) return;
    try {
      setIsRecording(true);
      setUploadProgress(null);
      setAnalysisProgress(null);

      await cameraRef.current.startRecording({
        flash: 'off',
        onRecordingFinished: async (video: any) => {
          setIsRecording(false);
          await handleUploadAndAnalyze(video.path);
        },
        onRecordingError: (error) => {
          setIsRecording(false);
          Alert.alert('Recording Error', error.message);
        },
      });

      // Auto-stop recording after 5 seconds (standard delivery window)
      setTimeout(async () => {
        if (cameraRef.current) {
          try {
            await cameraRef.current.stopRecording();
          } catch (e) {}
        }
      }, 5000);
    } catch (e: any) {
      setIsRecording(false);
      Alert.alert('Camera Error', e.message || 'Failed to start recording');
    }
  };

  const handleUploadAndAnalyze = async (videoPath: string) => {
    try {
      setUploadProgress(0);
      const { videoPath: serverPath } = await uploadDeliveryVideo(
        videoPath,
        serverUrl,
        (percent) => setUploadProgress(percent)
      );
      setUploadProgress(100);

      // Trigger AI Pipeline
      if (socketClientRef.current) {
        socketClientRef.current.startAnalysis(serverPath);
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message);
    }
  };

  if (!device || !hasPermission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#06b6d4" />
        <Text style={styles.statusText}>Requesting Camera Permissions & Hardware...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={true}
        video={true}
        audio={false}
        fps={format?.maxFps || 60}
      />

      {/* Batsman Alignment Overlay Guides */}
      <View style={styles.overlayGuide}>
        <View style={styles.headGuide}>
          <Text style={styles.guideText}>HEAD / STANCE</Text>
        </View>
        <View style={styles.creaseGuide}>
          <Text style={styles.guideText}>POPPING CREASE ALIGNMENT</Text>
        </View>
      </View>

      {/* Top HUD */}
      <View style={styles.topHud}>
        <View style={styles.pillBadge}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connectionStatus === 'CONNECTED' ? '#10b981' : '#ef4444' },
            ]}
          />
          <Text style={styles.hudText}>{connectionStatus}</Text>
        </View>
        <View style={styles.pillBadge}>
          <Text style={styles.hudText}>{format?.maxFps || 60} FPS CAPTURE</Text>
        </View>
      </View>

      {/* Countdown overlay */}
      {countdown !== null && (
        <View style={styles.countdownOverlay}>
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      )}

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        {uploadProgress !== null && uploadProgress < 100 && (
          <View style={styles.progressBox}>
            <Text style={styles.progressText}>Uploading delivery: {uploadProgress}%</Text>
          </View>
        )}

        {analysisProgress !== null && (
          <View style={styles.progressBox}>
            <Text style={styles.progressText}>AI Analysis Progress: {analysisProgress}%</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={startCountdownAndRecord}
          disabled={isRecording || countdown !== null}
        >
          <Text style={styles.recordButtonText}>
            {isRecording ? 'RECORDING (5s)...' : 'RECORD DELIVERY'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0b0f19',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  statusText: {
    color: '#94a3b8',
    marginTop: 16,
    fontSize: 14,
  },
  topHud: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  hudText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  overlayGuide: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 120,
    pointerEvents: 'none',
  },
  headGuide: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(6, 182, 212, 0.6)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  creaseGuide: {
    width: '80%',
    height: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#0f172a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    color: '#06b6d4',
    fontSize: 110,
    fontWeight: '900',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  progressBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#06b6d4',
  },
  progressText: {
    color: '#06b6d4',
    fontSize: 13,
    fontWeight: '700',
  },
  recordButton: {
    backgroundColor: '#06b6d4',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    elevation: 5,
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  recordButtonActive: {
    backgroundColor: '#ef4444',
  },
  recordButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
