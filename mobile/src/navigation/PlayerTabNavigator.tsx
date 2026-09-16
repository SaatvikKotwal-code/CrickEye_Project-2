/**
 * CrickEye Mobile — PlayerTabNavigator
 * Primary 5-tab navigation: Capture, Score, Pitch & Wagon, Biomechanics, Sessions.
 * Implements camera sensor lifecycle sleep (isActive={false}) when leaving Capture tab.
 */

import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { CaptureScreen } from '../screens/capture/CaptureScreen';
import { ScoreScreen } from '../screens/score/ScoreScreen';
import { PitchScreen } from '../screens/pitch/PitchScreen';
import { BiomechScreen } from '../screens/biomech/BiomechScreen';
import { SessionsScreen } from '../screens/sessions/SessionsScreen';
import { StatusBadge } from '../components/common/StatusBadge';
import { ServerModal } from '../components/common/ServerModal';
import { useServerUrl } from '../hooks/useServerUrl';
import { SessionResults } from '../types/session';

export type PlayerTabKey = 'capture' | 'score' | 'pitch' | 'biomech' | 'sessions';

interface PlayerTabNavigatorProps {
  user: any;
  onLogout: () => void;
}

export const PlayerTabNavigator: React.FC<PlayerTabNavigatorProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<PlayerTabKey>('capture');
  const [currentResults, setCurrentResults] = useState<SessionResults | null>(null);
  const [serverModalVisible, setServerModalVisible] = useState<boolean>(false);

  const { serverUrl, status, latencyMs } = useServerUrl();

  const handleAnalysisComplete = (results: SessionResults) => {
    setCurrentResults(results);
    setActiveTab('score'); // Auto-navigate to score tab upon analysis completion
  };

  const handleSelectSession = (results: SessionResults) => {
    setCurrentResults(results);
    setActiveTab('score');
  };

  const tabs: Array<{ key: PlayerTabKey; label: string; icon: string }> = [
    { key: 'capture', label: 'Capture', icon: '📹' },
    { key: 'score', label: 'Score', icon: '⭐' },
    { key: 'pitch', label: 'Pitch & Wagon', icon: '🎯' },
    { key: 'biomech', label: 'Biomech', icon: '🏃' },
    { key: 'sessions', label: 'Sessions', icon: '📜' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Universal Top Header */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <Text style={styles.brandIcon}>⚡</Text>
          <Text style={styles.brandTitle}>CrickEye Pro</Text>
        </View>

        <View style={styles.headerRight}>
          <StatusBadge
            status={status}
            latencyMs={latencyMs}
            onPress={() => setServerModalVisible(true)}
            fps={activeTab === 'capture' ? 120 : undefined}
          />
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <Text style={styles.logoutText}>🚪</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Tab Screen Area */}
      <View style={styles.screenContainer}>
        {activeTab === 'capture' && (
          <CaptureScreen
            serverUrl={serverUrl}
            isActive={activeTab === 'capture'} // Sensor turns OFF when not on capture tab
            onAnalysisComplete={handleAnalysisComplete}
            onOpenServerModal={() => setServerModalVisible(true)}
          />
        )}
        {activeTab === 'score' && (
          <ScoreScreen results={currentResults} serverUrl={serverUrl} />
        )}
        {activeTab === 'pitch' && (
          <PitchScreen results={currentResults} />
        )}
        {activeTab === 'biomech' && (
          <BiomechScreen results={currentResults} />
        )}
        {activeTab === 'sessions' && (
          <SessionsScreen
            userId={user?.id || 'demo-player-id'}
            serverUrl={serverUrl}
            onSelectSession={handleSelectSession}
          />
        )}
      </View>

      {/* Bottom Floating Glass Tab Bar */}
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
                {tab.icon}
              </Text>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Global Server Connection Switcher Modal */}
      <ServerModal
        visible={serverModalVisible}
        onClose={() => setServerModalVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070a13',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0a0f1d',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandIcon: {
    fontSize: 18,
  },
  brandTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutBtn: {
    padding: 6,
  },
  logoutText: {
    fontSize: 16,
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0a0f1d',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'space-around',
  },
  tabItem: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
  },
  tabIcon: {
    fontSize: 18,
    opacity: 0.6,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#06b6d4',
    fontWeight: '900',
  },
});
