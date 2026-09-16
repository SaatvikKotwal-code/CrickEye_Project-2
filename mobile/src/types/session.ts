/**
 * CrickEye Pro — Pure React Native Session & Pipeline Types
 * Complete specification matching backend models, WebSocket telemetry, and Supabase schema.
 */

export type UserRole = 'player' | 'coach';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  age?: number;
  gender?: string;
  role: UserRole;
  created_at?: string;
  hidden_from_coach_dashboard?: boolean;
}

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface ServerPreset {
  id: string;
  name: string;
  url: string;
  description: string;
  icon?: string;
}

export interface PublicConfigResponse {
  supabaseUrl: string;
  supabaseAnonKey: string;
  analysisCacheVersion: string;
}

// ── Ball Analytics Models ─────────────────────────────────────────────────────

export interface BallCalibration {
  segment_m: number;
  axis_a_norm: [number, number];
  axis_b_norm: [number, number];
  batter_end: string;
  is_estimated: boolean;
  note?: string;
}

export interface BallLength {
  label: string; // 'yorker' | 'full' | 'good_length' | 'short' | 'full_toss' | 'Good Length'
  distance_m: number | null;
  confidence: number;
  uncertain?: boolean;
  reason?: string | null;
}

export interface BallBounce {
  frame: number | null;
  confidence: number;
  method_note?: string;
  point_norm: {
    nx: number; // 0..1 (horizontal pitch lateral fraction)
    ny: number; // 0..1 (longitudinal pitch length fraction)
    distance_from_batter_m?: number;
  } | null;
}

export interface BallTrajectoryPoint {
  frame: number;
  nx: number;
  ny: number;
  along_t?: number;
  distance_from_batter_m?: number;
  conf?: number;
}

export interface BallDelivery {
  delivery_id: string;
  shot_num?: number | null;
  display_num?: number | null;
  peak_frame?: number | null;
  speed_kmh_est?: number | null;
  speed_is_estimated?: boolean;
  speed_reliability_score?: number;
  speed_warnings?: string[];
  pace_band?: string; // 'slow' | 'medium' | 'fast' | 'very_fast' | 'unknown'
  bounce: BallBounce;
  length: BallLength;
  pitch_plot?: {
    trajectory?: BallTrajectoryPoint[];
    bounce?: BallBounce['point_norm'];
    length_zone?: string;
  };
  quality_flags?: string[];
  shot_confirmed?: boolean;
  fx?: number; // 0-1 horizontal
  fy?: number; // 0-1 vertical
  zone?: string; // 'yorker'|'full'|'good'|'back'|'short'
  outcome?: string; // 'dot'|'1'|'2'|'4'|'6'|'W'
}

export interface BallAnalyticsPayload {
  enabled: boolean;
  deliveries: BallDelivery[];
  mean_speed_kmh_est?: number | null;
  pace_band_counts?: Record<string, number>;
  length_zone_counts?: Record<string, number>;
  insights?: {
    batsman?: { summary?: string };
    bowler?: { length_distribution?: Record<string, number>; notes?: string[] };
  };
  session_aggregates?: {
    delivery_count: number;
    confirmed_shot_count?: number;
    mean_speed_kmh_est: number | null;
    pace_band_counts: Record<string, number>;
    length_zone_counts: Record<string, number>;
  };
}

// ── Shot & Biomechanics Models ────────────────────────────────────────────────

export interface ShotData {
  shot_num: number;
  label: string; // 'cover' | 'pull' | 'straight' | 'flick' | 'sweep'
  shot_name?: string;
  shot_score?: number;
  shot_quality?: string; // 'Top class' | 'Good' | 'Fair' | 'Needs work'
  timestamp?: string;
  bat_speed_kmh?: number;
  elbow_elevation_deg?: number;
  elbow_angle_deg?: number;
  head_stability_score?: number;
  head_quality_score?: number;
  symmetry_score?: number;
  footwork_score?: number;
  swing_intensity?: number;
  swing_path_score?: number;
  execution_score?: number;
  timing_score?: number;
  middling_score?: number;
  impact_score?: number;
  confidence?: number;
  zone?: string;
  hand?: 'RHB' | 'LHB';
}

export interface BiomechFlagsSummary {
  HEAD_LATERAL_DRIFT_count?: number;
  HEAD_VERTICAL_DRIFT_count?: number;
  HEAD_DUCKING_PULL_count?: number;
  STANCE_ASYMMETRIC_count?: number;
  ELBOW_COLLAPSE_count?: number;
  ELBOW_REACHING_count?: number;
  ELBOW_BEHIND_PAD_count?: number;
  FLAT_FOOTED_count?: number;
  LATE_PLANT_count?: number;
  FOOTWORK_LINE_MISMATCH_count?: number;
  BAT_SPEED_SESSION_LOCK_count?: number;
}

export interface TrendAnalysis {
  first_half_swing_intensity?: number;
  second_half_swing_intensity?: number;
  first_half_swing_path_score?: number;
  second_half_swing_path_score?: number;
  first_half_execution_score?: number;
  second_half_execution_score?: number;
  first_half_head_quality_score?: number;
  second_half_head_quality_score?: number;
  first_half_symmetry_score?: number;
  second_half_symmetry_score?: number;
  first_half_footwork_score?: number;
  second_half_footwork_score?: number;
}

export interface SessionSummary {
  shots_confirmed: number;
  shots_total_detected: number;
  avg_bat_speed_kmh: number;
  avg_head_quality_score: number;
  avg_symmetry_score: number;
  avg_footwork_score: number;
  avg_swing_intensity: number;
  avg_swing_path_score: number;
  avg_execution_score: number;
  avg_shot_score: number;
  feet_active_rate?: number;
  fatigue_detected?: boolean;
  swing_path_fatigue?: boolean;
  trend?: TrendAnalysis;
  flags_summary?: BiomechFlagsSummary;
  by_shot_type?: Record<string, any>;
}

// ── Gemini AI Coach Models ────────────────────────────────────────────────────

export interface SuggestedDrill {
  name: string;
  description: string;
  focus_area: string;
}

export interface AiCoachInsight {
  overall_rating: number; // 1..10
  headline: string;
  technique_breakdown: string;
  suggested_drills: SuggestedDrill[];
  mental_cue: string;
  summary?: string;
  technical_flaws?: string[];
  recommended_drills?: string[];
}

// ── Full Pipeline Results ─────────────────────────────────────────────────────

export interface SessionResults {
  session_id: string;
  overall_score: number;
  rating: string; // 'Top class' | 'Good' | 'Fair' | 'Needs work'
  total_frames?: number;
  fps?: number;
  session_handedness?: 'RHB' | 'LHB';
  shots: ShotData[];
  ball_analytics?: BallAnalyticsPayload;
  session_summary?: SessionSummary;
  llm_insights?: AiCoachInsight;
  annotated_video_url?: string;
  video_url?: string;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  video_url: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  results?: SessionResults | null;
  created_at: string;
  file_hash?: string;
}
