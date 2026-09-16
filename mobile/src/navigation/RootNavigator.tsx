/**
 * CrickEye Mobile — RootNavigator
 * Root application coordinator routing between Auth, Player Tabs, and Coach Dashboard.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AuthNavigator } from './AuthNavigator';
import { PlayerTabNavigator } from './PlayerTabNavigator';
import { CoachScreen } from '../screens/coach/CoachScreen';
import { useServerUrl } from '../hooks/useServerUrl';
import { UserRole } from '../types/session';

export const RootNavigator: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  const { serverUrl } = useServerUrl();

  const handleLoginSuccess = (user: any, role: UserRole) => {
    setCurrentUser(user);
    setUserRole(role);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUserRole(null);
  };

  if (!currentUser || !userRole) {
    return (
      <View style={styles.container}>
        <AuthNavigator
          onLoginSuccess={handleLoginSuccess}
          serverUrl={serverUrl}
        />
      </View>
    );
  }

  if (userRole === 'coach') {
    return (
      <View style={styles.container}>
        <CoachScreen
          serverUrl={serverUrl}
          onLogout={handleLogout}
          onSelectPlayer={(player) => {
            console.log('[Coach] Inspecting player:', player.full_name);
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PlayerTabNavigator
        user={currentUser}
        onLogout={handleLogout}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070a13',
  },
});
