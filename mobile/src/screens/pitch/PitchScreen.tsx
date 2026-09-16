/**
 * CrickEye Mobile — PitchScreen
 * Hawkeye 2D Pitch Map, 360° Wagon Wheel, and Ball Pace delivery log.
 */

import React from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { PitchMapCanvas } from '../../components/canvas/PitchMapCanvas';
import { WagonWheelCanvas } from '../../components/canvas/WagonWheelCanvas';
import { BallPaceStrip } from '../../components/player/BallPaceStrip';
import { SessionResults } from '../../types/session';

interface PitchScreenProps {
  results?: SessionResults | null;
}

export const PitchScreen: React.FC<PitchScreenProps> = ({ results }) => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hawkeye 2D Pitch Bounce Map */}
      <PitchMapCanvas deliveries={results?.ball_analytics?.deliveries} />

      {/* 360° Radial Wagon Wheel & Sector Coverage */}
      <WagonWheelCanvas
        shots={results?.shots}
        handedness={results?.session_handedness || 'RHB'}
      />

      {/* Ball Speed Estimates & Delivery Log */}
      <BallPaceStrip analytics={results?.ball_analytics} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070a13',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
});
