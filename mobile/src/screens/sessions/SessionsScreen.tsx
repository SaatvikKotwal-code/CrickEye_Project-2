/**
 * CrickEye Mobile — SessionsScreen
 * Session history list and side-by-side session comparison launcher.
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SessionRecord, SessionResults } from '../../types/session';
import { fetchUserSessions } from '../../api/supabase';
import { CompareModal } from './CompareModal';

interface SessionsScreenProps {
  userId?: string;
  serverUrl: string;
  onSelectSession: (results: SessionResults) => void;
}

export const SessionsScreen: React.FC<SessionsScreenProps> = ({
  userId = 'demo-player-id',
  serverUrl,
  onSelectSession,
}) => {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [compareModalVisible, setCompareModalVisible] = useState<boolean>(false);
  const [selectedSessionA, setSelectedSessionA] = useState<SessionRecord | null>(null);
  const [selectedSessionB, setSelectedSessionB] = useState<SessionRecord | null>(null);

  const loadSessions = async () => {
    try {
      const records = await fetchUserSessions(userId, serverUrl);
      if (records && records.length > 0) {
        setSessions(records);
      } else {
        // Sample baseline records for testing
        setSessions([
          {
            id: 'sess-001',
            user_id: userId,
            video_url: '/uploads/sess-001/video.mp4',
            status: 'completed',
            created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
            results: {
              session_id: 'sess-001',
              overall_score: 86,
              rating: 'Top class',
              shots: [
                { shot_num: 1, label: 'cover', bat_speed_kmh: 92, shot_score: 8.8 },
                { shot_num: 2, label: 'straight', bat_speed_kmh: 85, shot_score: 8.4 },
              ],
              session_summary: {
                shots_confirmed: 2,
                shots_total_detected: 2,
                avg_bat_speed_kmh: 88.5,
                avg_head_quality_score: 85,
                avg_symmetry_score: 76,
                avg_footwork_score: 84,
                avg_swing_intensity: 60,
                avg_swing_path_score: 62,
                avg_execution_score: 82,
                avg_shot_score: 8.6,
              },
            },
          },
          {
            id: 'sess-002',
            user_id: userId,
            video_url: '/uploads/sess-002/video.mp4',
            status: 'completed',
            created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
            results: {
              session_id: 'sess-002',
              overall_score: 78,
              rating: 'Good',
              shots: [
                { shot_num: 1, label: 'pull', bat_speed_kmh: 84, shot_score: 7.9 },
              ],
              session_summary: {
                shots_confirmed: 1,
                shots_total_detected: 1,
                avg_bat_speed_kmh: 82.4,
                avg_head_quality_score: 76,
                avg_symmetry_score: 68,
                avg_footwork_score: 78,
                avg_swing_intensity: 54,
                avg_swing_path_score: 58,
                avg_execution_score: 75,
                avg_shot_score: 7.8,
              },
            },
          },
        ]);
      }
    } catch (e) {
      console.warn('[SessionsScreen] Load error:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [userId, serverUrl]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadSessions();
  };

  const handleCompare = (session: SessionRecord) => {
    setSelectedSessionA(sessions[1] || session);
    setSelectedSessionB(session);
    setCompareModalVisible(true);
  };

  const renderSessionCard = ({ item, index }: { item: SessionRecord; index: number }) => {
    const score = item.results?.overall_score ?? 80;
    const rating = item.results?.rating ?? 'Good';
    const dateStr = new Date(item.created_at).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View style={styles.sessionCard}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.sessionIndex}>DELIVERY #{sessions.length - index}</Text>
            <Text style={styles.sessionDate}>{dateStr}</Text>
          </View>
          <View style={styles.scorePill}>
            <Text style={styles.scoreText}>{score}</Text>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>
            Verdict: <Text style={styles.metaVerdict}>{rating}</Text> •{' '}
            {item.results?.shots?.length || 1} Shots Tracked
          </Text>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.inspectBtn}
            onPress={() => item.results && onAnalysisComplete(item.results)}
          >
            <Text style={styles.inspectText}>Load Analytics</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.compareBtn}
            onPress={() => handleCompare(item)}
          >
            <Text style={styles.compareText}>Compare Delta</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const onAnalysisComplete = (results: SessionResults) => {
    onSelectSession(results);
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#06b6d4" />
        <Text style={styles.loadingText}>Fetching Delivery Sessions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSessionCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#06b6d4"
          />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.title}>Delivery History</Text>
            <Text style={styles.subtitle}>
              Recorded Sessions & Progression Analytics
            </Text>
          </View>
        }
      />

      <CompareModal
        visible={compareModalVisible}
        onClose={() => setCompareModalVisible(false)}
        sessionA={selectedSessionA}
        sessionB={selectedSessionB}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070a13',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#070a13',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 13,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  listHeader: {
    marginBottom: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  sessionCard: {
    backgroundColor: '#0e1424',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sessionIndex: {
    color: '#06b6d4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sessionDate: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  scorePill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1.5,
    borderColor: '#06b6d4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    color: '#06b6d4',
    fontSize: 15,
    fontWeight: '900',
  },
  cardMeta: {
    marginBottom: 12,
  },
  metaText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  metaVerdict: {
    color: '#10b981',
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    paddingTop: 12,
  },
  inspectBtn: {
    flex: 1,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: '#06b6d4',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  inspectText: {
    color: '#06b6d4',
    fontSize: 12,
    fontWeight: '800',
  },
  compareBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  compareText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
});
