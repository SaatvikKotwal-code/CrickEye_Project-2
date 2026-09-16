/**
 * CrickEye Mobile — AiCoachCard Component
 * Automated Gemini LLM technique diagnosis, flaw detection, and corrective drill engine.
 * Matches 100% parity with web AiCoachCard.tsx and /llm-insights.
 */

import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { AiCoachInsight } from '../../types/session';

interface AiCoachCardProps {
  insights?: AiCoachInsight | null;
}

export const AiCoachCard: React.FC<AiCoachCardProps> = ({ insights }) => {
  const defaultInsights: AiCoachInsight = {
    overall_rating: 8.7,
    headline: 'High Front Elbow Dominance & Crisp Off-Drive Execution',
    technique_breakdown:
      'Strong forward stride into the pitch of the ball with front elbow elevated at 142°. Minor lateral head fall towards off-stump on fuller deliveries outside off.',
    mental_cue: 'Lead with the head and elbow, not hands.',
    suggested_drills: [
      {
        name: 'Stationary Cone Drive Drill',
        description: 'Place a ball on a low cone; drive through extra cover while maintaining a locked head position for 2 seconds post-impact.',
        focus_area: 'Head & Balance',
      },
      {
        name: 'Drop-Feed High Elbow Routine',
        description: 'Partner drop-feeds from waist height; emphasize keeping the bottom hand light with top-hand wrist cocking.',
        focus_area: 'Elbow Elevation',
      },
    ],
  };

  const data = insights || defaultInsights;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.sparkleIcon}>
            <Text style={styles.sparkleText}>✨</Text>
          </View>
          <View>
            <Text style={styles.title}>Gemini AI Coach Insights</Text>
            <Text style={styles.subtitle}>Biomechanical Technique & Drill Engine</Text>
          </View>
        </View>

        <View style={styles.ratingBadge}>
          <Text style={styles.ratingLabel}>RATING</Text>
          <Text style={styles.ratingScore}>{data.overall_rating}</Text>
          <Text style={styles.ratingMax}>/ 10</Text>
        </View>
      </View>

      {/* Technique Headline & Breakdown */}
      <View style={styles.headlineBox}>
        <Text style={styles.headlineText}>{data.headline}</Text>
        <Text style={styles.breakdownText}>{data.technique_breakdown}</Text>
      </View>

      {/* Coach's Key Mental Cue */}
      <View style={styles.cueBox}>
        <Text style={styles.cueIcon}>🧠</Text>
        <Text style={styles.cueText}>
          Coach's Cue: <Text style={styles.cueHighlight}>"{data.mental_cue}"</Text>
        </Text>
      </View>

      {/* Recommended Corrective Drills */}
      <View style={styles.drillsContainer}>
        <Text style={styles.drillsTitle}>RECOMMENDED CORRECTIVE DRILLS</Text>
        {data.suggested_drills.map((drill, idx) => (
          <View key={idx} style={styles.drillItem}>
            <View style={styles.drillHeader}>
              <Text style={styles.drillTarget}>🎯</Text>
              <Text style={styles.drillName}>{drill.name}</Text>
            </View>
            <Text style={styles.drillDesc}>{drill.description}</Text>
            <View style={styles.focusChip}>
              <Text style={styles.focusText}>✓ {drill.focus_area}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0e1424',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    padding: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sparkleIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: '#06b6d4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkleText: {
    fontSize: 14,
  },
  title: {
    color: '#f8fafc',
    fontSize: 14.5,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 10.5,
    marginTop: 1,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
  },
  ratingLabel: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '700',
  },
  ratingScore: {
    color: '#06b6d4',
    fontSize: 15,
    fontWeight: '900',
  },
  ratingMax: {
    color: '#64748b',
    fontSize: 9,
  },
  headlineBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderLeftWidth: 3,
    borderLeftColor: '#06b6d4',
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
  },
  headlineText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
  },
  breakdownText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  cueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
    marginBottom: 14,
  },
  cueIcon: {
    fontSize: 14,
  },
  cueText: {
    color: '#10b981',
    fontSize: 11.5,
    fontWeight: '700',
    flex: 1,
  },
  cueHighlight: {
    fontStyle: 'italic',
    color: '#f8fafc',
  },
  drillsContainer: {
    gap: 10,
  },
  drillsTitle: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  drillItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  drillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  drillTarget: {
    fontSize: 12,
  },
  drillName: {
    color: '#f8fafc',
    fontSize: 12.5,
    fontWeight: '700',
  },
  drillDesc: {
    color: '#94a3b8',
    fontSize: 11.5,
    lineHeight: 16,
  },
  focusChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 8,
  },
  focusText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '700',
  },
});
