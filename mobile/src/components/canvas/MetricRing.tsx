/**
 * CrickEye Mobile — MetricRing Component
 * Circular score & biomechanical metric progress ring.
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Animated } from 'react-native';

interface MetricRingProps {
  label: string;
  score: number; // 0..100
  size?: number;
  strokeWidth?: number;
  color?: string;
  unit?: string;
}

export const MetricRing: React.FC<MetricRingProps> = ({
  label,
  score,
  size = 76,
  strokeWidth = 6,
  color = '#06b6d4',
  unit = '%',
}) => {
  const animatedVal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedVal, {
      toValue: score,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [score, animatedVal]);

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.ringOuter,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: 'rgba(255, 255, 255, 0.08)',
          },
        ]}
      >
        {/* Accent highlight ring segment */}
        <View
          style={[
            styles.ringFill,
            {
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: color,
              opacity: boundedScore / 100,
            },
          ]}
        />

        <View style={styles.centerContent}>
          <Text style={[styles.scoreText, { color }]}>{boundedScore}</Text>
          {unit ? <Text style={styles.unitText}>{unit}</Text> : null}
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginHorizontal: 6,
  },
  ringOuter: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  ringFill: {
    ...StyleSheet.absoluteFillObject,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '900',
  },
  unitText: {
    fontSize: 8,
    color: '#64748b',
    fontWeight: '700',
    marginTop: -2,
  },
  label: {
    marginTop: 6,
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
