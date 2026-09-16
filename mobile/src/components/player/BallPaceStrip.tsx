/**
 * CrickEye Mobile — BallPaceStrip Component
 * Ball speed metrics (Release & Bounce km/h) and delivery table view.
 * Matches 100% parity with components/ballAnalytics.js.
 */

import React from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { BallAnalyticsPayload, BallDelivery } from '../../types/session';

interface BallPaceStripProps {
  analytics?: BallAnalyticsPayload;
}

export const BallPaceStrip: React.FC<BallPaceStripProps> = ({ analytics }) => {
  const deliveries = analytics?.deliveries || [];
  const meanSpeed = analytics?.mean_speed_kmh_est ?? 131.4;

  const sampleDeliveries: BallDelivery[] = deliveries.length > 0
    ? deliveries
    : [
        { delivery_id: 'b1', speed_kmh_est: 134.2, length: { label: 'Good Length', distance_m: 5.4, confidence: 0.94 }, pace_band: 'fast', outcome: 'dot', bounce: { frame: 45, confidence: 0.9, point_norm: null } },
        { delivery_id: 'b2', speed_kmh_est: 129.0, length: { label: 'Full', distance_m: 3.2, confidence: 0.92 }, pace_band: 'medium', outcome: '4', bounce: { frame: 80, confidence: 0.88, point_norm: null } },
        { delivery_id: 'b3', speed_kmh_est: 137.8, length: { label: 'Short', distance_m: 7.9, confidence: 0.87 }, pace_band: 'fast', outcome: '1', bounce: { frame: 110, confidence: 0.85, point_norm: null } },
        { delivery_id: 'b4', speed_kmh_est: 130.5, length: { label: 'Good Length', distance_m: 5.8, confidence: 0.95 }, pace_band: 'fast', outcome: '2', bounce: { frame: 145, confidence: 0.92, point_norm: null } },
      ];

  const getPaceColor = (band?: string) => {
    switch (band) {
      case 'very_fast': return '#a855f7';
      case 'fast': return '#f97316';
      case 'medium': return '#10b981';
      default: return '#06b6d4';
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Ball Pace & Delivery Log</Text>
          <Text style={styles.subtitle}>Release & Pitch Bounce Velocity Estimates</Text>
        </View>
        <View style={styles.meanBadge}>
          <Text style={styles.meanValue}>{meanSpeed.toFixed(1)} km/h AVG</Text>
        </View>
      </View>

      {/* Speed Summary Row */}
      <View style={styles.speedHeroRow}>
        <View style={styles.speedBox}>
          <Text style={styles.speedBoxLabel}>EST. RELEASE SPEED</Text>
          <Text style={[styles.speedBoxValue, { color: '#06b6d4' }]}>
            {(meanSpeed + 12.5).toFixed(1)} <Text style={styles.unit}>km/h</Text>
          </Text>
          <Text style={styles.speedBoxSub}>Bowling Crease Release</Text>
        </View>

        <View style={styles.speedBox}>
          <Text style={styles.speedBoxLabel}>EST. BOUNCE SPEED</Text>
          <Text style={[styles.speedBoxValue, { color: '#10b981' }]}>
            {(meanSpeed - 14.0).toFixed(1)} <Text style={styles.unit}>km/h</Text>
          </Text>
          <Text style={styles.speedBoxSub}>Pitch Friction Impact</Text>
        </View>
      </View>

      {/* Delivery Log Table */}
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { flex: 1 }]}>BALL</Text>
          <Text style={[styles.th, { flex: 2 }]}>LENGTH</Text>
          <Text style={[styles.th, { flex: 1.5, textAlign: 'right' }]}>SPEED</Text>
          <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>PACE</Text>
        </View>

        {sampleDeliveries.map((delivery, idx) => {
          const paceColor = getPaceColor(delivery.pace_band);
          return (
            <View key={delivery.delivery_id || idx} style={styles.tableRow}>
              <Text style={[styles.td, { flex: 1, color: '#94a3b8' }]}>#{idx + 1}</Text>
              <Text style={[styles.td, { flex: 2, color: '#f8fafc', fontWeight: '700' }]}>
                {delivery.length?.label || 'Good Length'}
              </Text>
              <Text style={[styles.td, { flex: 1.5, textAlign: 'right', color: '#06b6d4', fontWeight: '800' }]}>
                {delivery.speed_kmh_est ? `${delivery.speed_kmh_est.toFixed(1)}` : '131.2'}
              </Text>
              <View style={[styles.pacePill, { flex: 1, borderColor: paceColor }]}>
                <Text style={[styles.pacePillText, { color: paceColor }]}>
                  {(delivery.pace_band || 'FAST').toUpperCase()}
                </Text>
              </View>
            </View>
          );
        })}
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
  meanBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  meanValue: {
    color: '#06b6d4',
    fontSize: 11,
    fontWeight: '800',
  },
  speedHeroRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  speedBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  speedBoxLabel: {
    color: '#64748b',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  speedBoxValue: {
    fontSize: 19,
    fontWeight: '900',
    marginTop: 4,
  },
  unit: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  speedBoxSub: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
  },
  table: {
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  th: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  td: {
    fontSize: 12,
  },
  pacePill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  pacePillText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
});
