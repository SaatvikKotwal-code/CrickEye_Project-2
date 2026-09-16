/**
 * CrickEye Mobile — AuthNavigator
 * Authentication flow coordinator switching between Login and Signup screens.
 */

import React, { useState } from 'react';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SignupScreen } from '../screens/auth/SignupScreen';

interface AuthNavigatorProps {
  onLoginSuccess: (user: any, role: 'player' | 'coach') => void;
  serverUrl: string;
}

export const AuthNavigator: React.FC<AuthNavigatorProps> = ({
  onLoginSuccess,
  serverUrl,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  if (authMode === 'signup') {
    return (
      <SignupScreen
        onSignupSuccess={onLoginSuccess}
        onNavigateToLogin={() => setAuthMode('login')}
        serverUrl={serverUrl}
      />
    );
  }

  return (
    <LoginScreen
      onLoginSuccess={onLoginSuccess}
      onNavigateToSignup={() => setAuthMode('signup')}
      serverUrl={serverUrl}
    />
  );
};
