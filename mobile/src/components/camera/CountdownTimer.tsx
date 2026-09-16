/**
 * CrickEye Mobile — CountdownTimer Overlay
 * Visual 3-2-1 countdown overlay with tactile haptic cues.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Animated } from 'react-native';
import { useHaptics } from '../../hooks/useHaptics';

interface CountdownTimerProps {
  initialCount?: number;
  onComplete: () => void;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  initialCount = 3,
  onComplete,
}) => {
  const [count, setCount] = useState<number>(initialCount);
  const [scaleAnim] = useState(new Animated.Value(0.5));
  const [opacityAnim] = useState(new Animated.Value(0));
  const { tick, recordStart } = useHaptics();

  useEffect(() => {
    let current = initialCount;
    tick();

    const runAnimation = () => {
      scaleAnim.setValue(1.6);
      opacityAnim.setValue(0.2);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    };

    runAnimation();

    const interval = setInterval(() => {
      current -= 1;
      if (current > 0) {
        setCount(current);
        tick();
        runAnimation();
      } else {
        clearInterval(interval);
        recordStart();
        onComplete();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [initialCount, onComplete, tick, recordStart, scaleAnim, opacityAnim]);

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View
        style={[
          styles.circle,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <Text style={styles.countText}>{count}</Text>
        <Text style={styles.subText}>GET READY</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 10, 19, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  circle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 3,
    borderColor: '#06b6d4',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 20,
    elevation: 10,
  },
  countText: {
    color: '#06b6d4',
    fontSize: 90,
    fontWeight: '900',
    lineHeight: 96,
  },
  subText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: -4,
  },
});
