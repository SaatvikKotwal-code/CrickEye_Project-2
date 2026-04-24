/**
 * Ball Analytics — session_report.json `ball_analytics` and WebSocket `complete.ball_analytics`.
 * All speeds/lengths are estimates from single-camera tracking unless noted.
 */

export interface BallCalibration {
  segment_m: number;
  axis_a_norm: [number, number];
  axis_b_norm: [number, number];
  batter_end: string;
  is_estimated: boolean;
  note?: string;
}

export interface BallLength {
  label: string;
  distance_m: number | null;
  confidence: number;
  /** Legacy reports only; new pipeline always assigns a concrete zone. */
  uncertain?: boolean;
  reason: string | null;
}

export interface BallBounce {
  frame: number | null;
  confidence: number;
  method_note: string;
  point_norm: { nx: number; ny: number; distance_from_batter_m: number } | null;
}

export interface BallTrajectoryPoint {
  frame: number;
  nx: number;
  ny: number;
  along_t: number;
  distance_from_batter_m: number;
  conf: number;
}

export interface BallDelivery {
  delivery_id: string;
  shot_num?: number | null;
  display_num?: number | null;
  peak_frame?: number | null;
  ball_track_matched?: boolean;
  track_id: number | null;
  start_frame: number | null;
  end_frame: number | null;
  frame_count: number;
  track_confidence_score: number;
  speed_kmh_est: number | null;
  speed_is_estimated: boolean;
  speed_reliability_score: number;
  speed_warnings: string[];
  pace_band: string;
  bounce: BallBounce;
  length: BallLength;
  pitch_plot: {
    trajectory: BallTrajectoryPoint[];
    bounce: BallBounce["point_norm"];
    length_zone: string | undefined;
  };
  quality_flags: string[];
  matched_confirmed_shot_num?: number | null;
  match_source?: 'shot_time_window' | 'greedy_segment';
  /** false = classifier below confirm threshold; trajectory stripped server-side and not drawn here. */
  shot_confirmed?: boolean;
  shot_classifier_conf?: number;
}

export interface BallVideoTrajectory {
  track_id: number;
  bgr: [number, number, number];
  points: Array<{ frame: number; x: number; y: number }>;
}

export interface BallFrameOverlay {
  frame: number;
  boxes: Array<{
    cx: number;
    cy: number;
    w: number;
    h: number;
    conf: number;
    track_id: number;
    delivery_id: string;
  }>;
}

export interface BallAnalyticsPayload {
  enabled: boolean;
  model_path?: string;
  calibration?: BallCalibration;
  pace_bands_config?: Record<string, unknown>;
  deliveries: BallDelivery[];
  frame_overlays: BallFrameOverlay[];
  video_trajectories?: BallVideoTrajectory[];
  insights?: {
    batsman?: { by_pace_and_outcome?: unknown[]; summary?: string };
    bowler?: { length_distribution?: Record<string, number>; pace_consistency_std_kmh?: number; notes?: string[] };
  };
  session_aggregates?: {
    delivery_count: number;
    confirmed_shot_count?: number;
    moving_track_segments?: number;
    raw_track_segments?: number;
    unmatched_moving_tracks_after_assignment?: number;
    unmatched_tracks_after_assignment?: number;
    shot_assignment_pool?: 'motion_validated' | 'raw_longest' | 'empty';
    shot_ball_mapping?: string;
    video_overlay_segments?: number;
    video_trajectory_layers?: number;
    delivery_count_raw_tracks?: number;
    delivery_count_unmatched_tracks?: number;
    pace_band_counts: Record<string, number>;
    length_zone_counts: Record<string, number>;
    mean_speed_kmh_est: number | null;
    uncertainty_note?: string;
  };
  error?: string;
  skipped?: boolean;
  reason?: string;
  debug?: Record<string, unknown>;
}
