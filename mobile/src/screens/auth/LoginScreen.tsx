/**
 * CrickEye Mobile — LoginScreen
 * Supabase email/password authentication with role routing and guest bypass.
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
import { signIn } from '../../api/supabase';

interface LoginScreenProps {
  onLoginSuccess: (user: any, role: 'player' | 'coach') => void;
  onNavigateToSignup: () => void;
  serverUrl: string;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onNavigateToSignup,
  serverUrl,
}) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing Fields', 'Please enter both your email address and password.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await signIn(email, password, serverUrl);
      if (error) {
        Alert.alert('Login Failed', error.message);
      } else if (data?.user) {
        const isCoach =
          email.toLowerCase().includes('coach') ||
          data.user.user_metadata?.role === 'coach';
        onLoginSuccess(data.user, isCoach ? 'coach' : 'player');
      }
    } catch (err: any) {
      Alert.alert('Network Error', err.message || 'Unable to connect to Supabase authentication.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = (role: 'player' | 'coach') => {
    const mockUser = {
      id: role === 'coach' ? 'demo-coach-id' : 'demo-player-id',
      email: role === 'coach' ? 'coach9259@gmail.com' : 'player.demo@crickeye.pro',
      user_metadata: { role, full_name: role === 'coach' ? 'Coach Vikram' : 'Rohit (Player)' },
    };
    onLoginSuccess(mockUser, role);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Brand Logo & Headline */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>⚡</Text>
          </View>
          <Text style={styles.brandTitle}>CrickEye Pro</Text>
          <Text style={styles.brandSub}>AI Vision Tracking & High-Speed Biomechanics</Text>
        </View>

        {/* Login Form */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Sign In</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="e.g. player@crickeye.pro"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PASSWORD</Text>
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
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#070a13" />
            ) : (
              <Text style={styles.submitBtnText}>SIGN IN</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR QUICK DEMO</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Quick Access Demo Buttons */}
          <View style={styles.demoButtonsRow}>
            <TouchableOpacity
              style={styles.demoBtn}
              onPress={() => handleGuestLogin('player')}
            >
              <Text style={styles.demoBtnText}>Enter as Player</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.demoBtn, styles.demoCoachBtn]}
              onPress={() => handleGuestLogin('coach')}
            >
              <Text style={[styles.demoBtnText, styles.demoCoachText]}>Enter as Coach</Text>
            </TouchableOpacity>
          </View>

          {/* Navigation to Signup */}
          <View style={styles.signupPrompt}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <TouchableOpacity onPress={onNavigateToSignup}>
              <Text style={styles.signupLink}>Create Account</Text>
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
    marginBottom: 28,
  },
  logoBadge: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1.5,
    borderColor: '#06b6d4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoIcon: {
    fontSize: 28,
  },
  brandTitle: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.5,
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
  formTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 20,
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  dividerText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    marginHorizontal: 12,
  },
  demoButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  demoBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  demoBtnText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  demoCoachBtn: {
    borderColor: 'rgba(168, 85, 247, 0.4)',
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
  },
  demoCoachText: {
    color: '#a855f7',
  },
  signupPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 22,
  },
  signupText: {
    color: '#94a3b8',
    fontSize: 12.5,
  },
  signupLink: {
    color: '#06b6d4',
    fontSize: 12.5,
    fontWeight: '800',
  },
});
