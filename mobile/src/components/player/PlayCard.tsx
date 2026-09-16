/**
 * CrickEye Mobile — PlayCard Component
 * High-impact delivery and session scorecard matching web PlayCard.js & ReportModal.js.
 */

import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { SessionResults } from '../../types/session';
import { MetricRing } from '../canvas/MetricRing';

interface PlayCardProps {
  results?: SessionResults | null;
}

export const PlayCard: React.FC<PlayCardProps> = ({ results }) => {
  const score = results?.overall_score ?? 84;
  const rating = results?.rating ?? 'Top class';
  const totalShots = results?.shots?.length ?? (results?.session_summary?.shots_confirmed ?? 1);
  const avgBatSpeed = results?.session_summary?.avg_bat_speed_kmh ?? 86.4;

  const getStarRating = (s: number) => {
    if (s >= 85) return '★★★★★';
    if (s >= 70) return '★★★★☆';
    if (s >= 55) return '★★★☆☆';
    return '★★☆☆☆';
  };

  const getVerdictBadgeStyle = (r: string) => {
    const lower = r.toLowerCase();
    if (lower.includes('top') || lower.includes('elite')) {
      return { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', text: '#10b981' };
    }
    if (lower.includes('good')) {
      return { bg: 'rgba(6, 182, 212, 0.15)', border: '#06b6d4', text: '#06b6d4' };
    }
    return { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#f59e0b' };
  };

  const badgeStyle = getVerdictBadgeStyle(rating);

  return (
    <View style={styles.card}>
      {/* Header with Title and Verdict Pill */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Session Performance</Text>
          <Text style={styles.stars}>{getStarRating(score)}</Text>
        </View>
        <View style={[styles.verdictBadge, { backgroundColor: badgeStyle.bg, borderColor: badgeStyle.border }]}>
          <Text style={[styles.verdictText, { color: badgeStyle.text }]}>{rating.toUpperCase()}</Text>
        </View>
      </View>

      {/* Main Score Hero Section */}
      <View style={styles.heroSection}>
        <View style={styles.scoreCircle}>
          <Text style={styles.scoreNumber}>{score}</Text>
          <Text style={styles.scoreMax}>/ 100</Text>
        </View>
        <View style={styles.heroMeta}>
          <Text style={styles.heroLabel}>OVERALL TECHNIQUE SCORE</Text>
          <Text style={styles.heroSub}>
            Evaluated from {totalShots} deliveries • Pose & Stance Tracking
          </Text>
        </View>
      </View>

      {/* 4 Core Circular Metric Rings */}
      <View style={styles.ringsRow}>
        <MetricRing label="Timing" score={88} color="#06b6d4" />
        <MetricRing label="Middling" score={82} color="#10b981" />
        <MetricRing label="Impact" score={91} color="#a855f7" />
        <MetricRing label="Bat Pace" score={avgBatSpeed} color="#f97316" unit="k" />
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
    padding: 18,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  stars: {
    color: '#f59e0b',
    fontSize: 14,
    marginTop: 2,
    letterSpacing: 2,
  },
  verdictBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  verdictText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  scoreCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 2,
    borderColor: '#06b6d4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  scoreNumber: {
    color: '#06b6d4',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 26,
  },
  scoreMax: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
  },
  heroMeta: {
    flex: 1,
  },
  heroLabel: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 6,
  },
});
