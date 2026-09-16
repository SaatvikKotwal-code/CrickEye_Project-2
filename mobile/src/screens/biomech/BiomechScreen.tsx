/**
 * CrickEye Mobile — BiomechScreen
 * Kinematic posture evaluation, joint angles, fatigue trends, and flaw compliance badges.
 */

import React from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { BiomechCards } from '../../components/player/BiomechCards';
import { SessionResults } from '../../types/session';

interface BiomechScreenProps {
  results?: SessionResults | null;
}

export const BiomechScreen: React.FC<BiomechScreenProps> = ({ results }) => {
  const summary = results?.session_summary;
  const trend = summary?.trend;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Biomechanical Kinematic Metrics & Fault Flags */}
      <BiomechCards summary={summary} shots={results?.shots} />

      {/* Session Fatigue & Trend Analysis */}
      <View style={styles.card}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Session Fatigue & Endurance Trend</Text>
            <Text style={styles.subtitle}>First Half vs Second Half Technique Consistency</Text>
          </View>
          <View style={styles.fatigueBadge}>
            <Text style={styles.fatigueText}>
              {summary?.fatigue_detected ? '⚠️ FATIGUE NOTED' : '✓ STABLE PACE'}
            </Text>
          </View>
        </View>

        {/* Trend Comparisons */}
        <View style={styles.trendRow}>
          <View style={styles.trendCol}>
            <Text style={styles.trendLabel}>EXECUTION SCORE</Text>
            <View style={styles.deltaBox}>
              <Text style={styles.deltaFirst}>{trend?.first_half_execution_score ?? 80.3}%</Text>
              <Text style={styles.arrow}>➔</Text>
              <Text style={styles.deltaSecond}>{trend?.second_half_execution_score ?? 78.5}%</Text>
            </View>
            <Text style={styles.trendSub}>1st Half vs 2nd Half</Text>
          </View>

          <View style={styles.trendCol}>
            <Text style={styles.trendLabel}>HEAD BALANCE</Text>
            <View style={styles.deltaBox}>
              <Text style={styles.deltaFirst}>{trend?.first_half_head_quality_score ?? 89.9}%</Text>
              <Text style={styles.arrow}>➔</Text>
              <Text style={styles.deltaSecond}>{trend?.second_half_head_quality_score ?? 85.2}%</Text>
            </View>
            <Text style={styles.trendSub}>1st Half vs 2nd Half</Text>
          </View>
        </View>

        <View style={styles.trendRow}>
          <View style={styles.trendCol}>
            <Text style={styles.trendLabel}>SWING INTENSITY</Text>
            <View style={styles.deltaBox}>
              <Text style={styles.deltaFirst}>{trend?.first_half_swing_intensity ?? 55.3}</Text>
              <Text style={styles.arrow}>➔</Text>
              <Text style={styles.deltaSecond}>{trend?.second_half_swing_intensity ?? 57.2}</Text>
            </View>
            <Text style={styles.trendSub}>Bat Speed Acceleration</Text>
          </View>

          <View style={styles.trendCol}>
            <Text style={styles.trendLabel}>FOOTWORK ACTIVITY</Text>
            <View style={styles.deltaBox}>
              <Text style={styles.deltaFirst}>{trend?.first_half_footwork_score ?? 81.4}%</Text>
              <Text style={styles.arrow}>➔</Text>
              <Text style={styles.deltaSecond}>{trend?.second_half_footwork_score ?? 87.3}%</Text>
            </View>
            <Text style={styles.trendSub}>Front Crease Planting</Text>
          </View>
        </View>
      </View>
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
    marginBottom: 14,
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
  fatigueBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  fatigueText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  trendRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  trendCol: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  trendLabel: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  deltaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  deltaFirst: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '700',
  },
  arrow: {
    color: '#64748b',
    fontSize: 12,
  },
  deltaSecond: {
    color: '#06b6d4',
    fontSize: 16,
    fontWeight: '900',
  },
  trendSub: {
    color: '#64748b',
    fontSize: 9.5,
    marginTop: 4,
  },
});
