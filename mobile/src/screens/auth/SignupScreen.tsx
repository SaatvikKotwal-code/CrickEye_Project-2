/**
 * CrickEye Mobile — SignupScreen
 * Supabase account registration with player / coach role assignment.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { signUp } from '../../api/supabase';

interface SignupScreenProps {
  onSignupSuccess: (user: any, role: 'player' | 'coach') => void;
  onNavigateToLogin: () => void;
  serverUrl: string;
}

export const SignupScreen: React.FC<SignupScreenProps> = ({
  onSignupSuccess,
  onNavigateToLogin,
  serverUrl,
}) => {
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [role, setRole] = useState<'player' | 'coach'>('player');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSignup = async () => {
    if (!fullName.trim() || !email.trim() || !password) {
      Alert.alert('Missing Fields', 'Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await signUp(email, password, fullName, role, serverUrl);
      if (error) {
        Alert.alert('Registration Failed', error.message);
      } else if (data?.user) {
        Alert.alert('Account Created', 'Welcome to CrickEye Pro!');
        onSignupSuccess(data.user, role);
      }
    } catch (err: any) {
      Alert.alert('Network Error', err.message || 'Unable to connect to Supabase.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.brandContainer}>
          <Text style={styles.brandTitle}>Join CrickEye Pro</Text>
          <Text style={styles.brandSub}>Create your Player or Coach performance profile</Text>
        </View>

        <View style={styles.formCard}>
          {/* Role Switcher */}
          <Text style={styles.inputLabel}>SELECT YOUR ROLE</Text>
          <View style={styles.roleToggleRow}>
            <TouchableOpacity
              style={[styles.roleBtn, role === 'player' && styles.roleBtnActive]}
              onPress={() => setRole('player')}
            >
              <Text style={[styles.roleBtnText, role === 'player' && styles.roleBtnTextActive]}>
                🏏 Batsman / Player
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleBtn, role === 'coach' && styles.roleBtnActiveCoach]}
              onPress={() => setRole('coach')}
            >
              <Text style={[styles.roleBtnText, role === 'coach' && styles.roleBtnTextActiveCoach]}>
                📋 Coach / Trainer
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>FULL NAME</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Virat Kohli"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="e.g. virat@crickeye.pro"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PASSWORD (6+ CHARACTERS)</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSignup}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#070a13" />
            ) : (
              <Text style={styles.submitBtnText}>CREATE ACCOUNT</Text>
            )}
          </TouchableOpacity>

          <View style={styles.loginPrompt}>
            <Text style={styles.loginText}>Already registered? </Text>
            <TouchableOpacity onPress={onNavigateToLogin}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070a13',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  brandTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '900',
  },
  brandSub: {
    color: '#94a3b8',
    fontSize: 12.5,
    marginTop: 4,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: '#0e1424',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 24,
  },
  roleToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  roleBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  roleBtnActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderColor: '#06b6d4',
  },
  roleBtnActiveCoach: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderColor: '#a855f7',
  },
  roleBtnText: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '700',
  },
  roleBtnTextActive: {
    color: '#06b6d4',
    fontWeight: '800',
  },
  roleBtnTextActiveCoach: {
    color: '#a855f7',
    fontWeight: '800',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
    fontSize: 14,
  },
  submitBtn: {
    backgroundColor: '#06b6d4',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    color: '#070a13',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  loginPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  loginText: {
    color: '#94a3b8',
    fontSize: 12.5,
  },
  loginLink: {
    color: '#06b6d4',
    fontSize: 12.5,
    fontWeight: '800',
  },
});
