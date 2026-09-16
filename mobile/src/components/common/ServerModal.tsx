/**
 * CrickEye Mobile — ServerModal Component
 * Dual-Transport connection switcher: Cloudflare Tunnel vs Localhost / LAN.
 * Matches 100% parity with web #serverSettingsModal.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useServerUrl } from '../../hooks/useServerUrl';

interface ServerModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ServerModal: React.FC<ServerModalProps> = ({ visible, onClose }) => {
  const {
    serverUrl,
    setServerUrl,
    presets,
    selectPreset,
    status,
    latencyMs,
    lastPingError,
    checkHealth,
  } = useServerUrl();

  const [inputUrl, setInputUrl] = useState<string>(serverUrl);
  const [isPinging, setIsPinging] = useState<boolean>(false);

  const handleTestPing = async () => {
    setIsPinging(true);
    await checkHealth(inputUrl);
    setIsPinging(false);
  };

  const handleSave = async () => {
    await setServerUrl(inputUrl);
    onClose();
  };

  const handlePresetSelect = (presetId: string, url: string) => {
    setInputUrl(url);
    selectPreset(presetId);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          {/* Title */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Backend Connection Setup</Text>
              <Text style={styles.subtitle}>Dual-Transport: Cloudflare & Local Network</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Presets Chips */}
          <Text style={styles.sectionLabel}>NETWORK PRESETS</Text>
          <View style={styles.presetList}>
            {presets.map((preset) => {
              const isSelected = inputUrl.trim().toLowerCase() === preset.url.trim().toLowerCase();
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[styles.presetChip, isSelected && styles.presetChipActive]}
                  onPress={() => handlePresetSelect(preset.id, preset.url)}
                >
                  <Text style={[styles.presetName, isSelected && styles.presetNameActive]}>
                    {preset.name}
                  </Text>
                  <Text style={styles.presetSub} numberOfLines={1}>
                    {preset.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Custom URL Input */}
          <Text style={styles.sectionLabel}>CUSTOM BACKEND URL</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              value={inputUrl}
              onChangeText={setInputUrl}
              placeholder="http://192.168.1.xxx:8000"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Ping Diagnostics Status Box */}
          <View style={styles.statusBox}>
            <View style={styles.statusLeft}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      status === 'CONNECTED' ? '#10b981' : status === 'CONNECTING' ? '#f59e0b' : '#ef4444',
                  },
                ]}
              />
              <Text style={styles.statusTitle}>
                {status === 'CONNECTED'
                  ? `Connected (${latencyMs !== null ? `${latencyMs} ms` : 'OK'})`
                  : status === 'CONNECTING'
                  ? 'Testing Link...'
                  : 'Unreachable'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.pingBtn}
              onPress={handleTestPing}
              disabled={isPinging}
            >
              {isPinging ? (
                <ActivityIndicator size="small" color="#06b6d4" />
              ) : (
                <Text style={styles.pingBtnText}>Test Ping</Text>
              )}
            </TouchableOpacity>
          </View>

          {lastPingError && (
            <Text style={styles.errorText} numberOfLines={2}>
              {lastPingError}
            </Text>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Connect & Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 16, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0e1424',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#64748b',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 6,
  },
  presetList: {
    gap: 8,
    marginBottom: 14,
  },
  presetChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  presetChipActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    borderColor: '#06b6d4',
  },
  presetName: {
    color: '#f8fafc',
    fontSize: 12.5,
    fontWeight: '700',
  },
  presetNameActive: {
    color: '#06b6d4',
    fontWeight: '800',
  },
  presetSub: {
    color: '#94a3b8',
    fontSize: 10.5,
    marginTop: 2,
  },
  inputContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  textInput: {
    color: '#f8fafc',
    fontSize: 13,
    paddingVertical: 10,
  },
  statusBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  pingBtn: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#06b6d4',
  },
  pingBtnText: {
    color: '#06b6d4',
    fontSize: 11,
    fontWeight: '800',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 10.5,
    marginTop: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: '#06b6d4',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#070a13',
    fontSize: 13,
    fontWeight: '900',
  },
});
