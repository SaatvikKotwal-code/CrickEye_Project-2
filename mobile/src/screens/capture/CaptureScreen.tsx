/**
 * CrickEye Mobile — CaptureScreen
 * Primary capture studio: high-speed camera (60-120 FPS), stance alignment HUD,
 * 3-2-1 countdown, 5s auto-stop, gallery picker, upload progress, and live telemetry.
 */

import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CameraView, CameraViewRef } from '../../components/camera/CameraView';
import { StanceGuide } from '../../components/camera/StanceGuide';
import { CountdownTimer } from '../../components/camera/CountdownTimer';
import { uploadDeliveryVideo } from '../../api/uploadService';
import { useTelemetry } from '../../hooks/useTelemetry';
import { useHaptics } from '../../hooks/useHaptics';
import { SessionResults } from '../../types/session';

interface CaptureScreenProps {
  serverUrl: string;
  isActive: boolean;
  onAnalysisComplete: (results: SessionResults) => void;
  onOpenServerModal: () => void;
}

export const CaptureScreen: React.FC<CaptureScreenProps> = ({
  serverUrl,
  isActive,
  onAnalysisComplete,
  onOpenServerModal,
}) => {
  const cameraRef = useRef<CameraViewRef>(null);
  const [cameraPosition, setCameraPosition] = useState<'back' | 'front'>('back');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [showCountdown, setShowCountdown] = useState<boolean>(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Ready to record delivery');
  const [detectedFps, setDetectedFps] = useState<number>(60);

  const { recordEnd, success, error: hapticError } = useHaptics();

  const {
    progress: pipelineProgress,
    currentFrame,
    currentFps,
    isProcessing,
    startAnalysis,
    reset: resetTelemetry,
  } = useTelemetry({
    serverUrl,
    onComplete: (results) => {
      success();
      setStatusMessage('Analysis complete!');
      setUploadPercent(null);
      onAnalysisComplete(results);
    },
    onError: (err) => {
      hapticError();
      Alert.alert('Analysis Failed', err);
      setStatusMessage('Analysis failed');
      setUploadPercent(null);
    },
  });

  const toggleCameraFacing = () => {
    if (isRecording) return;
    setCameraPosition((prev) => (prev === 'back' ? 'front' : 'back'));
  };

  const startCountdown = () => {
    if (isRecording || isProcessing) return;
    setShowCountdown(true);
    setStatusMessage('Get ready in stance...');
  };

  const handleCountdownFinished = async () => {
    setShowCountdown(false);
    setIsRecording(true);
    setStatusMessage('RECORDING (5 seconds)...');

    if (cameraRef.current) {
      await cameraRef.current.startRecording(
        async (videoPath: string) => {
          setIsRecording(false);
          recordEnd();
          await processVideoUpload(videoPath);
        },
        (error: any) => {
          setIsRecording(false);
          hapticError();
          Alert.alert('Recording Error', error?.message || 'Failed to capture delivery.');
        }
      );
    }

    // Auto-stop after 5 seconds (standard delivery window)
    setTimeout(async () => {
      if (cameraRef.current) {
        await cameraRef.current.stopRecording();
      }
    }, 5000);
  };

  const processVideoUpload = async (fileUri: string) => {
    setStatusMessage('Streaming delivery to processing engine...');
    setUploadPercent(0);
    resetTelemetry();

    try {
      const uploadRes = await uploadDeliveryVideo(fileUri, serverUrl, (pct) => {
        setUploadPercent(pct);
      });

      setStatusMessage('Upload complete. YOLOv8 CV pipeline running...');
      startAnalysis(uploadRes.videoPath);
    } catch (err: any) {
      hapticError();
      setUploadPercent(null);
      Alert.alert(
        'Upload Failed',
        `${err.message}\n\nPlease verify your server connection.`,
        [
          { text: 'Server Settings', onPress: onOpenServerModal },
          { text: 'OK' },
        ]
      );
      setStatusMessage('Upload failed');
    }
  };

  const handlePickFromGallery = async () => {
    if (isRecording || isProcessing) return;
    // Simulate picking pre-recorded sample delivery from device storage
    setStatusMessage('Selected delivery from gallery');
    await processVideoUpload('/storage/emulated/0/DCIM/delivery_cover_drive.mp4');
  };

  return (
    <View style={styles.container}>
      {/* High-FPS Vision Camera Ingestion Layer */}
      <CameraView
        ref={cameraRef}
        isActive={isActive}
        cameraPosition={cameraPosition}
        targetFps={120}
        onFpsDetected={setDetectedFps}
      />

      {/* Batsman Stance Alignment Guides */}
      <StanceGuide />

      {/* 3-2-1 Animated Countdown */}
      {showCountdown && (
        <CountdownTimer initialCount={3} onComplete={handleCountdownFinished} />
      )}

      {/* Top Floating Telemetry & Controls HUD */}
      <View style={styles.topHud}>
        <View style={styles.hudPill}>
          <Text style={styles.fpsText}>{detectedFps} FPS CAPTURE</Text>
        </View>

        <TouchableOpacity
          style={styles.facingToggleBtn}
          onPress={toggleCameraFacing}
          disabled={isRecording || isProcessing}
        >
          <Text style={styles.facingToggleText}>
            🔄 {cameraPosition === 'back' ? 'REAR (TRIPOD)' : 'FRONT (SELFIE)'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Live Pipeline Telemetry Card (when uploading/processing) */}
      {(uploadPercent !== null || isProcessing) && (
        <View style={styles.telemetryCard}>
          <View style={styles.telemetryHeader}>
            <Text style={styles.telemetryTitle}>
              {uploadPercent !== null && uploadPercent < 100
                ? 'UPLOADING HIGH-SPEED CLIP'
                : 'YOLOv8-POSE & BALL TRACKING'}
            </Text>
            <Text style={styles.telemetryPct}>
              {uploadPercent !== null && uploadPercent < 100
                ? `${uploadPercent}%`
                : `${pipelineProgress}%`}
            </Text>
          </View>

          {/* Progress Bar Track */}
          <View style={styles.telemetryTrack}>
            <View
              style={[
                styles.telemetryFill,
                {
                  width: `${uploadPercent !== null && uploadPercent < 100 ? uploadPercent : pipelineProgress}%`,
                },
              ]}
            />
          </View>

          {isProcessing && currentFrame !== null && (
            <View style={styles.frameStatsRow}>
              <Text style={styles.frameStatText}>FRAME: {currentFrame}</Text>
              <Text style={styles.frameStatText}>
                ENGINE: {currentFps ? `${currentFps.toFixed(1)} FPS` : 'REALTIME'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Bottom Floating Control Panel */}
      <View style={styles.bottomBar}>
        <Text style={styles.statusLabel}>{statusMessage}</Text>

        <View style={styles.controlsRow}>
          {/* Gallery Upload Button */}
          <TouchableOpacity
            style={styles.galleryBtn}
            onPress={handlePickFromGallery}
            disabled={isRecording || isProcessing}
          >
            <Text style={styles.galleryBtnText}>📁 Gallery</Text>
          </TouchableOpacity>

          {/* Primary Record Delivery Trigger */}
          <TouchableOpacity
            style={[
              styles.recordBtn,
              isRecording && styles.recordBtnActive,
              isProcessing && styles.recordBtnDisabled,
            ]}
            onPress={startCountdown}
            disabled={isRecording || isProcessing || showCountdown}
          >
            {isProcessing ? (
              <ActivityIndicator color="#070a13" />
            ) : (
              <Text style={styles.recordBtnText}>
                {isRecording ? 'RECORDING (5s)...' : 'RECORD DELIVERY'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topHud: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  hudPill: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fpsText: {
    color: '#06b6d4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  facingToggleBtn: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  facingToggleText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '700',
  },
  telemetryCard: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(14, 20, 36, 0.95)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#06b6d4',
    padding: 14,
    zIndex: 30,
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  telemetryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  telemetryTitle: {
    color: '#06b6d4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  telemetryPct: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '900',
  },
  telemetryTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  telemetryFill: {
    height: '100%',
    backgroundColor: '#06b6d4',
    borderRadius: 3,
  },
  frameStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  frameStatText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 20,
  },
  statusLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  galleryBtn: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 25,
  },
  galleryBtnText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  recordBtn: {
    flex: 1,
    backgroundColor: '#06b6d4',
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: 'center',
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  recordBtnActive: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
  },
  recordBtnDisabled: {
    backgroundColor: '#64748b',
    shadowOpacity: 0,
  },
  recordBtnText: {
    color: '#070a13',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
