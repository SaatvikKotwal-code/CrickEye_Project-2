/**
 * CrickEye Mobile — Stance & Crease Alignment HUD
 * Batsman positioning guide with head zone circle and popping crease alignment.
 */

import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

export const StanceGuide: React.FC = () => {
  return (
    <View style={styles.overlay} pointerEvents="none">
      {/* Top Head / Stance Alignment Target */}
      <View style={styles.headGuideContainer}>
        <View style={styles.headCircle}>
          <View style={styles.crosshairH} />
          <View style={styles.crosshairV} />
        </View>
        <Text style={styles.guideBadge}>BATSMAN HEAD ZONE</Text>
      </View>

      {/* Popping Crease Alignment Bar */}
      <View style={styles.creaseContainer}>
        <View style={styles.creaseLine} />
        <Text style={styles.creaseBadge}>POPPING CREASE ALIGNMENT</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 100,
    zIndex: 10,
  },
  headGuideContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  headCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    borderColor: '#06b6d4',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.05)',
  },
  crosshairH: {
    position: 'absolute',
    width: 14,
    height: 1.5,
    backgroundColor: 'rgba(6, 182, 212, 0.6)',
  },
  crosshairV: {
    position: 'absolute',
    width: 1.5,
    height: 14,
    backgroundColor: 'rgba(6, 182, 212, 0.6)',
  },
  guideBadge: {
    marginTop: 8,
    color: '#06b6d4',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
  },
  creaseContainer: {
    width: '88%',
    alignItems: 'center',
    marginBottom: 40,
  },
  creaseLine: {
    width: '100%',
    height: 2.5,
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  creaseBadge: {
    marginTop: 6,
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
});
