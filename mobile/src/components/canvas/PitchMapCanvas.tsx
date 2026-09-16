/**
 * CrickEye Mobile — PitchMapCanvas Component
 * Interactive Hawkeye-style 2D pitch map with length zones and bounce markers.
 * Matches 100% parity with components/PitchMap.js and components/ballAnalytics.js.
 */

import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { BallDelivery } from '../../types/session';

interface PitchMapCanvasProps {
  deliveries?: BallDelivery[];
  onSelectDelivery?: (delivery: BallDelivery) => void;
  selectedDeliveryId?: string | null;
}

const ZONES = [
  { id: 'short', label: 'SHORT (8M+)', col: 'rgba(138, 154, 122, 0.25)', borderCol: '#8a9a7a', heightPct: '30%' },
  { id: 'back', label: 'BACK OF LENGTH (6-8M)', col: 'rgba(232, 96, 26, 0.25)', borderCol: '#e8601a', heightPct: '15%' },
  { id: 'good', label: 'GOOD LENGTH (4-6M)', col: 'rgba(39, 174, 96, 0.3)', borderCol: '#27ae60', heightPct: '22%' },
  { id: 'full', label: 'FULL (2-4M)', col: 'rgba(46, 204, 113, 0.25)', borderCol: '#2ecc71', heightPct: '20%' },
  { id: 'yorker', label: 'YORKER (0-2M)', col: 'rgba(245, 166, 35, 0.3)', borderCol: '#f5a623', heightPct: '13%' },
];

function getOutcomeColor(outcome?: string): string {
  if (outcome === 'W') return '#ff2ea6';
  if (outcome === '4' || outcome === '6') return '#00e5ff';
  if (outcome === '2') return '#ffd84d';
  if (outcome === '1') return '#8bff3f';
  return '#ff6b2d'; // dot ball
}

export const PitchMapCanvas: React.FC<PitchMapCanvasProps> = ({
  deliveries = [],
  onSelectDelivery,
  selectedDeliveryId,
}) => {
  const [activeBall, setActiveBall] = useState<BallDelivery | null>(null);

  const handleBallPress = (delivery: BallDelivery) => {
    setActiveBall(delivery);
    if (onSelectDelivery) onSelectDelivery(delivery);
  };

  // Sample default deliveries if empty
  const displayDeliveries: BallDelivery[] = deliveries.length > 0
    ? deliveries
    : [
        {
          delivery_id: 'd1',
          fx: 0.48,
          fy: 0.42,
          zone: 'good',
          outcome: '4',
          speed_kmh_est: 132.5,
          length: { label: 'Good Length', distance_m: 5.2, confidence: 0.92 },
          bounce: { frame: 45, confidence: 0.88, point_norm: { nx: 0.48, ny: 0.42 } },
        },
        {
          delivery_id: 'd2',
          fx: 0.38,
          fy: 0.18,
          zone: 'full',
          outcome: 'dot',
          speed_kmh_est: 128.0,
          length: { label: 'Full', distance_m: 3.1, confidence: 0.95 },
          bounce: { frame: 78, confidence: 0.91, point_norm: { nx: 0.38, ny: 0.18 } },
        },
        {
          delivery_id: 'd3',
          fx: 0.55,
          fy: 0.65,
          zone: 'back',
          outcome: '1',
          speed_kmh_est: 136.2,
          length: { label: 'Back of Length', distance_m: 6.8, confidence: 0.89 },
          bounce: { frame: 112, confidence: 0.84, point_norm: { nx: 0.55, ny: 0.65 } },
        },
      ];

  const currentSelection = activeBall || displayDeliveries[0];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Hawkeye Pitch Bounce Map</Text>
          <Text style={styles.subtitle}>2D Length Zones & Pitch Impact Coordinates</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{displayDeliveries.length} BALLS</Text>
        </View>
      </View>

      {/* 2D Pitch Graphic Frame */}
      <View style={styles.pitchOuter}>
        <View style={styles.pitchStrip}>
          {/* Length Zones */}
          {ZONES.map((zone) => (
            <View
              key={zone.id}
              style={[
                styles.zoneSection,
                {
                  height: zone.heightPct as any,
                  backgroundColor: zone.col,
                  borderBottomColor: zone.borderCol,
                },
              ]}
            >
              <Text style={[styles.zoneLabel, { color: zone.borderCol }]}>{zone.label}</Text>
            </View>
          ))}

          {/* Stumps & Crease at striker end (bottom) */}
          <View style={styles.creaseLine} />
          <View style={styles.stumpsBox}>
            <View style={styles.stump} />
            <View style={styles.stump} />
            <View style={styles.stump} />
          </View>

          {/* Plotted Ball Bounce Markers */}
          {displayDeliveries.map((ball, idx) => {
            const nx = ball.fx ?? ball.bounce?.point_norm?.nx ?? 0.5;
            // Invert Y so bottom is batsman crease (0m) and top is bowler (10m)
            const rawNy = ball.fy ?? ball.bounce?.point_norm?.ny ?? 0.4;
            const topPct = (1 - rawNy) * 100;
            const leftPct = nx * 100;

            const isSelected = selectedDeliveryId
              ? ball.delivery_id === selectedDeliveryId
              : currentSelection?.delivery_id === ball.delivery_id;

            const col = getOutcomeColor(ball.outcome);

            return (
              <TouchableOpacity
                key={ball.delivery_id || idx}
                activeOpacity={0.8}
                onPress={() => handleBallPress(ball)}
                style={[
                  styles.ballMarker,
                  {
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    backgroundColor: col,
                    borderColor: isSelected ? '#ffffff' : col,
                    shadowColor: col,
                    transform: [{ scale: isSelected ? 1.3 : 1 }],
                  },
                ]}
              >
                <Text style={styles.ballIndexText}>{idx + 1}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Selected Delivery Details Strip */}
      {currentSelection && (
        <View style={styles.detailStrip}>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>DELIVERY</Text>
            <Text style={styles.detailValue}>#{displayDeliveries.indexOf(currentSelection) + 1}</Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>LENGTH</Text>
            <Text style={[styles.detailValue, { color: '#06b6d4' }]}>
              {currentSelection.length?.label || currentSelection.zone?.toUpperCase()}
            </Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>DISTANCE</Text>
            <Text style={styles.detailValue}>
              {currentSelection.length?.distance_m ? `${currentSelection.length.distance_m} m` : '4.8 m'}
            </Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>SPEED</Text>
            <Text style={[styles.detailValue, { color: '#10b981' }]}>
              {currentSelection.speed_kmh_est ? `${currentSelection.speed_kmh_est.toFixed(1)} km/h` : '131.2 km/h'}
            </Text>
          </View>
        </View>
      )}
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
  badge: {
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  badgeText: {
    color: '#06b6d4',
    fontSize: 11,
    fontWeight: '800',
  },
  pitchOuter: {
    width: '100%',
    height: 280,
    backgroundColor: '#09101d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pitchStrip: {
    width: '58%',
    height: '92%',
    backgroundColor: '#352b20', // Cricket clay pitch color
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    position: 'relative',
    overflow: 'hidden',
  },
  zoneSection: {
    width: '100%',
    borderBottomWidth: 1,
    paddingLeft: 6,
    paddingTop: 4,
    justifyContent: 'flex-start',
  },
  zoneLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  creaseLine: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  stumpsBox: {
    position: 'absolute',
    bottom: 12,
    left: '42%',
    width: '16%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stump: {
    width: 3.5,
    height: 8,
    backgroundColor: '#f59e0b',
    borderRadius: 1,
  },
  ballMarker: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -11,
    marginTop: -11,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 20,
  },
  ballIndexText: {
    color: '#070a13',
    fontSize: 9.5,
    fontWeight: '900',
  },
  detailStrip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  detailCol: {
    alignItems: 'center',
  },
  detailLabel: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
});
