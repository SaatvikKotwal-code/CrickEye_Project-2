export interface Keypoint {
  x: number; // Normalized 0..1 or pixel coordinates
  y: number;
  confidence: number;
  name: string;
}

export interface FramePose {
  frame_idx: number;
  timestamp: number;
  keypoints: { [key: string]: [number, number, number] }; // [x, y, conf]
  head_stability_score?: number;
  elbow_angle_deg?: number;
  bat_angle_deg?: number;
  is_optimal_elbow?: boolean;
}

export interface BallTrajectoryPoint {
  frame: number;
  x: number;
  y: number;
  z?: number;
}

export interface PitchBounceInfo {
  bounce_frame: number;
  bounce_x: number;
  bounce_y: number;
  length_category: 'Yorker' | 'Full' | 'Good Length' | 'Short' | 'Bouncer';
  line_category: 'Outside Off' | 'Off Stump' | 'Middle Stump' | 'Leg Stump' | 'Down Leg';
  speed_kmh?: number;
}

export interface BiomechanicsSummary {
  max_bat_speed_kmh: number;
  impact_elbow_angle_deg: number;
  head_tilt_at_impact_deg: number;
  balance_rating_percent: number;
  technique_compliance: 'Optimal' | 'Minor Defect' | 'Major Defect';
  flaws_detected: string[];
}

export interface AiCoachInsight {
  overall_rating: number; // 1..10
  headline: string;
  technique_breakdown: string;
  suggested_drills: {
    name: string;
    description: string;
    focus_area: string;
  }[];
  mental_cue: string;
}

export interface SessionData {
  id: string;
  created_at: string;
  player_id: string;
  player_name: string;
  shot_type: string;
  video_url: string;
  annotated_video_url?: string;
  total_frames: number;
  fps: number;
  biomechanics: BiomechanicsSummary;
  pitch_bounce?: PitchBounceInfo;
  trajectory: BallTrajectoryPoint[];
  frames: FramePose[];
  ai_coach?: AiCoachInsight;
}
