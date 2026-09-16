/**
 * CrickEye Pro — Dynamic Supabase Identity & Persistence Service
 * 
 * Manages Supabase Auth, PostgreSQL sessions with RLS, and coach roster administration.
 * Configured dynamically via /api/public-config with fallback keys.
 */

import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { UserProfile, SessionRecord } from '../types/session';
import { fetchPublicConfig } from './client';

let supabaseInstance: SupabaseClient | null = null;
let currentSupabaseUrl: string = '';
let currentSupabaseKey: string = '';

// Default fallback credentials from backend/.env for zero-wait auth initialization
const FALLBACK_SUPABASE_URL = 'https://sjisoyaltztonlfaqech.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaXNveWFsdHp0b25sZmFxZWNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NjM4ODIsImV4cCI6MjA5MDUzOTg4Mn0.R7_ugYoqEFOLgmX5E8a7Cdhu4BMXMGIvEuKw-mEwtoM';

export async function getSupabaseClient(serverUrl?: string): Promise<SupabaseClient> {
  if (supabaseInstance && currentSupabaseUrl && currentSupabaseKey) {
    return supabaseInstance;
  }

  let url = FALLBACK_SUPABASE_URL;
  let anonKey = FALLBACK_SUPABASE_ANON_KEY;

  try {
    const config = await fetchPublicConfig(serverUrl);
    if (config?.supabaseUrl && config?.supabaseAnonKey) {
      url = config.supabaseUrl;
      anonKey = config.supabaseAnonKey;
    }
  } catch (e) {
    console.warn('[Supabase] Public config unreachable, using demo config:', e);
  }

  currentSupabaseUrl = url;
  currentSupabaseKey = anonKey;

  supabaseInstance = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return supabaseInstance;
}

// ── Auth Services ─────────────────────────────────────────────────────────────

export async function signIn(email: string, pass: string, serverUrl?: string) {
  const client = await getSupabaseClient(serverUrl);
  return await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: pass,
  });
}

export async function signUp(
  email: string,
  pass: string,
  fullName: string,
  role: 'player' | 'coach' = 'player',
  serverUrl?: string
) {
  const client = await getSupabaseClient(serverUrl);
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password: pass,
    options: {
      data: {
        full_name: fullName.trim(),
        role: role,
      },
    },
  });

  if (error) return { data, error };

  // If user registered, insert initial row into profiles table
  if (data?.user) {
    try {
      await client.from('profiles').insert({
        id: data.user.id,
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        role: role,
      });
    } catch (profileErr) {
      console.warn('[Supabase] Profile insert error:', profileErr);
    }
  }

  return { data, error: null };
}

export async function signOut(serverUrl?: string): Promise<void> {
  const client = await getSupabaseClient(serverUrl);
  await client.auth.signOut();
}

export async function getCurrentUser(serverUrl?: string): Promise<User | null> {
  const client = await getSupabaseClient(serverUrl);
  const { data } = await client.auth.getUser();
  return data?.user || null;
}

export async function getUserProfile(userId: string, serverUrl?: string): Promise<UserProfile | null> {
  const client = await getSupabaseClient(serverUrl);
  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) return null;
    return data as UserProfile;
  } catch (e) {
    return null;
  }
}

// ── Session Database CRUD ─────────────────────────────────────────────────────

export async function fetchUserSessions(userId: string, serverUrl?: string): Promise<SessionRecord[]> {
  const client = await getSupabaseClient(serverUrl);
  try {
    const { data, error } = await client
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data as SessionRecord[];
  } catch (e) {
    console.warn('[Supabase] Fetch sessions error:', e);
    return [];
  }
}

export async function saveSessionRecord(
  session: Partial<SessionRecord>,
  serverUrl?: string
): Promise<SessionRecord | null> {
  const client = await getSupabaseClient(serverUrl);
  try {
    const { data, error } = await client
      .from('sessions')
      .insert(session)
      .select()
      .single();

    if (error) throw error;
    return data as SessionRecord;
  } catch (e) {
    console.warn('[Supabase] Save session error:', e);
    return null;
  }
}

// ── Coach Services ────────────────────────────────────────────────────────────

export async function fetchCoachPlayerRoster(serverUrl?: string): Promise<UserProfile[]> {
  const client = await getSupabaseClient(serverUrl);
  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('role', 'player')
      .eq('hidden_from_coach_dashboard', false)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data as UserProfile[];
  } catch (e) {
    console.warn('[Supabase] Fetch coach roster error:', e);
    return [];
  }
}

export async function fetchPlayerSessionsForCoach(
  playerId: string,
  serverUrl?: string
): Promise<SessionRecord[]> {
  const client = await getSupabaseClient(serverUrl);
  try {
    const { data, error } = await client
      .from('sessions')
      .select('*')
      .eq('user_id', playerId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data as SessionRecord[];
  } catch (e) {
    return [];
  }
}
