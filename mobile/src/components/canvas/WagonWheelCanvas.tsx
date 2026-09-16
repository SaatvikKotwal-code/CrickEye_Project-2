/**
 * CrickEye Mobile — WagonWheelCanvas Component
 * Interactive 360° cricket wagon wheel and field dispersion visualizer.
 * Matches 100% parity with components/wagonWheel.js.
 */

import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { ShotData } from '../../types/session';

interface WagonWheelCanvasProps {
  shots?: ShotData[];
  handedness?: 'RHB' | 'LHB';
}

interface ShotVectorConfig {
  angleDeg: number;
  color: string;
  label: string;
  distanceM: number;
}

const SHOT_ANGLES_RHB: Record<string, { angle: number; color: string }> = {
  straight: { angle: -90, color: '#06B6D4' },
  cover:    { angle: -140, color: '#10B981' },
  pull:     { angle: 40,  color: '#F97316' },
  flick:    { angle: 10,  color: '#A855F7' },
  sweep:    { angle: 70,  color: '#EAB308' },
};

const SHOT_ANGLES_LHB: Record<string, { angle: number; color: string }> = {
  straight: { angle: -90, color: '#06B6D4' },
  cover:    { angle: -40, color: '#10B981' },
  pull:     { angle: 140, color: '#F97316' },
  flick:    { angle: 170, color: '#A855F7' },
  sweep:    { angle: 110, color: '#EAB308' },
};

export const WagonWheelCanvas: React.FC<WagonWheelCanvasProps> = ({
  shots = [],
  handedness: initialHand = 'RHB',
}) => {
  const [hand, setHand] = useState<'RHB' | 'LHB'>(initialHand);

  // Fallback sample shots if none provided
  const displayShots: ShotData[] = shots.length > 0
    ? shots
    : [
        { shot_num: 1, label: 'cover', shot_name: 'Cover Drive', bat_speed_kmh: 88, shot_score: 8.5 },
        { shot_num: 2, label: 'pull', shot_name: 'Pull Shot', bat_speed_kmh: 94, shot_score: 7.9 },
        { shot_num: 3, label: 'straight', shot_name: 'Straight Drive', bat_speed_kmh: 84, shot_score: 8.8 },
        { shot_num: 4, label: 'cover', shot_name: 'Cover Drive', bat_speed_kmh: 91, shot_score: 8.2 },
        { shot_num: 5, label: 'flick', shot_name: 'Flick', bat_speed_kmh: 86, shot_score: 7.5 },
      ];

  const angleConfig = hand === 'RHB' ? SHOT_ANGLES_RHB : SHOT_ANGLES_LHB;

  // Compute coverage counts
  let offside = 0;
  let straight = 0;
  let legside = 0;

  displayShots.forEach((s) => {
    const l = s.label.toLowerCase();
    if (l === 'straight') {
      straight += 1;
    } else if (l === 'cover') {
      if (hand === 'RHB') offside += 1; else legside += 1;
    } else {
      if (hand === 'RHB') legside += 1; else offside += 1;
    }
  });

  const total = displayShots.length || 1;
  const offPct = Math.round((offside / total) * 100);
  const straightPct = Math.round((straight / total) * 100);
  const legPct = Math.round((legside / total) * 100);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>360° Wagon Wheel</Text>
          <Text style={styles.subtitle}>Field Dispersion & Shot Trajectory Vectors</Text>
        </View>

        {/* Handedness Switcher */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, hand === 'RHB' && styles.toggleBtnActive]}
            onPress={() => setHand('RHB')}
          >
            <Text style={[styles.toggleText, hand === 'RHB' && styles.toggleTextActive]}>RHB</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, hand === 'LHB' && styles.toggleBtnActive]}
            onPress={() => setHand('LHB')}
          >
            <Text style={[styles.toggleText, hand === 'LHB' && styles.toggleTextActive]}>LHB</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Field Graphics */}
      <View style={styles.fieldOuter}>
        {/* Boundary Circle */}
        <View style={styles.boundaryRing}>
          {/* 30-Yard Circle */}
          <View style={styles.thirtyYardRing} />

          {/* Center Pitch Strip */}
          <View style={styles.pitchStrip} />

          {/* Sector Labels */}
          <Text style={[styles.sectorLabel, { top: 8, alignSelf: 'center' }]}>STRAIGHT</Text>
          <Text style={[styles.sectorLabel, { left: 8, top: '48%' }]}>
            {hand === 'RHB' ? 'OFF-SIDE' : 'LEG-SIDE'}
          </Text>
          <Text style={[styles.sectorLabel, { right: 8, top: '48%' }]}>
            {hand === 'RHB' ? 'LEG-SIDE' : 'OFF-SIDE'}
          </Text>
          <Text style={[styles.sectorLabel, { bottom: 8, alignSelf: 'center' }]}>FINE LEG</Text>

          {/* Shot Trajectory Spokes */}
          {displayShots.map((shot, idx) => {
            const l = shot.label.toLowerCase();
            const conf = angleConfig[l] || angleConfig.straight;
            // Slight jitter for overlapping shots
            const jitter = (idx % 3 - 1) * 8;
            const rotation = `${conf.angle + jitter}deg`;

            return (
              <View
                key={idx}
                style={[
                  styles.spoke,
                  {
                    backgroundColor: conf.color,
                    shadowColor: conf.color,
                    transform: [{ rotate: rotation }],
                  },
                ]}
              >
                <View style={[styles.spokeHead, { backgroundColor: conf.color }]} />
              </View>
            );
          })}
        </View>
      </View>

      {/* Sector Coverage Bars */}
      <View style={styles.coverageBox}>
        <View style={styles.barItem}>
          <View style={styles.barHeader}>
            <Text style={styles.barTitle}>OFF-SIDE</Text>
            <Text style={styles.barCount}>{offside} ({offPct}%)</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${offPct}%`, backgroundColor: '#10B981' }]} />
          </View>
        </View>

        <View style={styles.barItem}>
          <View style={styles.barHeader}>
            <Text style={styles.barTitle}>STRAIGHT</Text>
            <Text style={styles.barCount}>{straight} ({straightPct}%)</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${straightPct}%`, backgroundColor: '#06B6D4' }]} />
          </View>
        </View>

        <View style={styles.barItem}>
          <View style={styles.barHeader}>
            <Text style={styles.barTitle}>LEG-SIDE</Text>
            <Text style={styles.barCount}>{legside} ({legPct}%)</Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${legPct}%`, backgroundColor: '#F97316' }]} />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0e1424',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#06b6d4',
  },
  toggleText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  toggleTextActive: {
    color: '#070a13',
    fontWeight: '900',
  },
  fieldOuter: {
    width: '100%',
    height: 270,
    backgroundColor: '#07160e', // Grass stadium tone
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  boundaryRing: {
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  thirtyYardRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  pitchStrip: {
    position: 'absolute',
    width: 12,
    height: 38,
    backgroundColor: '#b45309',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  sectorLabel: {
    position: 'absolute',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  spoke: {
    position: 'absolute',
    width: 88,
    height: 2.5,
    left: '50%',
    top: '50%',
    transformOrigin: '0% 50%',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  spokeHead: {
    position: 'absolute',
    right: -3,
    top: -3.5,
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  coverageBox: {
    marginTop: 14,
    gap: 8,
  },
  barItem: {
    gap: 4,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barTitle: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  barCount: {
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '700',
  },
  barTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});
