/**
 * CrickEye Mobile — StatusBadge Component
 * Header status pill showing server link status and trigger for ServerModal.
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { ConnectionStatus } from '../../types/session';

interface StatusBadgeProps {
  status: ConnectionStatus;
  latencyMs?: number | null;
  onPress: () => void;
  fps?: number;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  latencyMs,
  onPress,
  fps,
}) => {
  const getDotColor = () => {
    switch (status) {
      case 'CONNECTED': return '#10b981';
      case 'CONNECTING': return '#f59e0b';
      default: return '#ef4444';
    }
  };

  return (
    <TouchableOpacity style={styles.badge} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.dot, { backgroundColor: getDotColor() }]} />
      <Text style={styles.label}>
        {status === 'CONNECTED'
          ? latencyMs !== null && latencyMs !== undefined
            ? `${latencyMs}ms`
            : 'ONLINE'
          : status === 'CONNECTING'
          ? 'LINKING'
          : 'OFFLINE'}
      </Text>
      {fps ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.fpsText}>{fps} FPS</Text>
        </>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  label: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 6,
  },
  fpsText: {
    color: '#06b6d4',
    fontSize: 11,
    fontWeight: '800',
  },
});
