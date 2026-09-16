/**
 * CrickEye Mobile — CameraView Component
 * High-performance hardware camera wrapper utilizing react-native-vision-camera.
 * Supports 60-120 FPS capture, front/back switching, and sensor sleep management.
 */

import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';

export interface CameraViewRef {
  startRecording: (onFinished: (path: string) => void, onError: (err: any) => void) => Promise<void>;
  stopRecording: () => Promise<void>;
}

interface CameraViewProps {
  isActive?: boolean;
  cameraPosition?: 'back' | 'front';
  targetFps?: 60 | 120;
  onFpsDetected?: (fps: number) => void;
}

export const CameraView = forwardRef<CameraViewRef, CameraViewProps>(({
  isActive = true,
  cameraPosition = 'back',
  targetFps = 120,
  onFpsDetected,
}, ref) => {
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [hasHardware, setHasHardware] = useState<boolean>(true);
  const [detectedFps, setDetectedFps] = useState<number>(60);
  const nativeCameraRef = useRef<any>(null);

  // Safe import of react-native-vision-camera
  let CameraModule: any = null;
  let useCameraDeviceHook: any = null;
  let useCameraFormatHook: any = null;

  try {
    const vision = require('react-native-vision-camera');
    CameraModule = vision.Camera;
    useCameraDeviceHook = vision.useCameraDevice;
    useCameraFormatHook = vision.useCameraFormat;
  } catch (e) {
    // Fallback if running on mock environment
  }

  const device = useCameraDeviceHook ? useCameraDeviceHook(cameraPosition) : null;
  const format = useCameraFormatHook && device
    ? useCameraFormatHook(device, [
        { fps: targetFps },
        { fps: 60 },
        { videoResolution: { width: 1280, height: 720 } },
      ])
    : null;

  useEffect(() => {
    (async () => {
      if (!CameraModule) {
        setHasHardware(false);
        return;
      }
      try {
        const cam = await CameraModule.requestCameraPermission();
        const mic = await CameraModule.requestMicrophonePermission();
        setHasPermission(cam === 'granted' && mic === 'granted');
      } catch (err) {
        setHasHardware(false);
      }
    })();
  }, [CameraModule]);

  useEffect(() => {
    const fps = format?.maxFps || (device ? 60 : 30);
    setDetectedFps(fps);
    if (onFpsDetected) onFpsDetected(fps);
  }, [format, device, onFpsDetected]);

  useImperativeHandle(ref, () => ({
    startRecording: async (onFinished, onError) => {
      if (nativeCameraRef.current) {
        try {
          await nativeCameraRef.current.startRecording({
            flash: 'off',
            onRecordingFinished: (video: any) => onFinished(video.path),
            onRecordingError: (error: any) => onError(error),
          });
        } catch (e) {
          onError(e);
        }
      } else {
        // Mock fallback simulation for dev/testing environments
        console.log('[CameraView] Mock recording started (5s)...');
        setTimeout(() => {
          onFinished('/mock/path/delivery_sample.mp4');
        }, 5000);
      }
    },
    stopRecording: async () => {
      if (nativeCameraRef.current) {
        try {
          await nativeCameraRef.current.stopRecording();
        } catch (e) {}
      }
    },
  }));

  if (!hasHardware || !CameraModule) {
    return (
      <View style={styles.placeholderContainer}>
        <View style={styles.simBadge}>
          <Text style={styles.simText}>SIMULATED CAMERA STREAM</Text>
        </View>
        <Text style={styles.subStatus}>
          Hardware: {cameraPosition.toUpperCase()} CAMERA • {detectedFps} FPS TARGET
        </Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#06b6d4" />
        <Text style={styles.permissionText}>Waiting for Camera & Audio Permissions...</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Camera device ({cameraPosition}) not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraModule
        ref={nativeCameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={isActive}
        video={true}
        audio={false}
        fps={detectedFps}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#070a13',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  placeholderContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#070f1a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
  },
  simBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: '#06b6d4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  simText: {
    color: '#06b6d4',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subStatus: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  permissionText: {
    color: '#94a3b8',
    marginTop: 16,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
  },
});
