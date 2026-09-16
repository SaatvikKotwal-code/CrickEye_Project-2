/**
 * CrickEye Pro — Mobile Application Entry Point
 * Native 60–120 FPS cricket capture, dual-transport networking, and real-time telemetry.
 */

import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#070a13"
        translucent={false}
      />
      <RootNavigator />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#070a13',
  },
});
