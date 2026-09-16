/**
 * CrickEye Mobile — useHaptics Hook
 * Native vibration cues for countdown, recording start/stop, and completion.
 */

import { useCallback } from 'react';
import { Vibration, Platform } from 'react-native';

export function useHaptics() {
  const tick = useCallback(() => {
    try {
      Vibration.vibrate(Platform.OS === 'android' ? 40 : 15);
    } catch (e) {}
  }, []);

  const recordStart = useCallback(() => {
    try {
      Vibration.vibrate(Platform.OS === 'android' ? 120 : 50);
    } catch (e) {}
  }, []);

  const recordEnd = useCallback(() => {
    try {
      Vibration.vibrate([0, 80, 60, 100]);
    } catch (e) {}
  }, []);

  const success = useCallback(() => {
    try {
      Vibration.vibrate([0, 70, 40, 120]);
    } catch (e) {}
  }, []);

  const error = useCallback(() => {
    try {
      Vibration.vibrate([0, 150, 80, 150]);
    } catch (e) {}
  }, []);

  return {
    tick,
    recordStart,
    recordEnd,
    success,
    error,
  };
}
