import { SessionData } from '../types/crickeye';

export const MOCK_SESSIONS: SessionData[] = [
  {
    id: 'session-001',
    created_at: '2026-09-14T10:30:00Z',
    player_id: 'player-101',
    player_name: 'Virat K.',
    shot_type: 'Cover Drive',
    video_url: '/data/sample_video.mp4',
    total_frames: 180,
    fps: 30,
    biomechanics: {
      max_bat_speed_kmh: 42.5,
      impact_elbow_angle_deg: 96.4,
      head_tilt_at_impact_deg: 4.1,
      balance_rating_percent: 88,
      technique_compliance: 'Optimal',
      flaws_detected: [],
    },
    pitch_bounce: {
      bounce_frame: 42,
      bounce_x: 0.62,
      bounce_y: 0.38,
      length_category: 'Full',
      line_category: 'Outside Off',
      speed_kmh: 132.4,
    },
    trajectory: [
      { frame: 10, x: 0.50, y: 0.20 },
      { frame: 25, x: 0.56, y: 0.30 },
      { frame: 42, x: 0.62, y: 0.38 }, // Bounce
      { frame: 58, x: 0.68, y: 0.44 },
      { frame: 75, x: 0.74, y: 0.50 }, // Impact
    ],
    frames: [
      {
        frame_idx: 75,
        timestamp: 2.5,
        keypoints: {
          nose: [0.55, 0.25, 0.95],
          left_shoulder: [0.58, 0.32, 0.92],
          right_shoulder: [0.52, 0.32, 0.94],
          left_elbow: [0.63, 0.40, 0.88],
          right_elbow: [0.47, 0.39, 0.91],
          left_wrist: [0.68, 0.48, 0.85],
          right_wrist: [0.50, 0.47, 0.89],
          left_hip: [0.57, 0.55, 0.92],
          right_hip: [0.51, 0.55, 0.93],
          left_knee: [0.62, 0.70, 0.90],
          right_knee: [0.49, 0.72, 0.91],
          left_ankle: [0.65, 0.88, 0.87],
          right_ankle: [0.48, 0.89, 0.89],
        },
        head_stability_score: 92,
        elbow_angle_deg: 96.4,
        bat_angle_deg: 42.0,
        is_optimal_elbow: true,
      }
    ],
    ai_coach: {
      overall_rating: 8.8,
      headline: 'Exemplary Front-Foot Flow with High Elbow Position',
      technique_breakdown: 'Weight transferred decisively into the line of the off-stump ball. Leading elbow was held elevated at 96°, ensuring full face presentation and ground-hugging trajectory through cover.',
      suggested_drills: [
        {
          name: 'Stationary Drop-Ball Drive Drill',
          description: 'Place ball on cone on outside-off line. Practice leading with shoulder and checking through cover.',
          focus_area: 'Shoulder Dip & High Elbow Elevation',
        },
        {
          name: 'Front-Knee Flexion Hold',
          description: '3 sets of 10 holds in impact position to train quadriceps endurance at contact.',
          focus_area: 'Lower Body Balance & Foundation',
        }
      ],
      mental_cue: 'Lead with the head and elbow, let the hands follow beneath your eyes.',
    }
  },
  {
    id: 'session-002',
    created_at: '2026-09-14T11:15:00Z',
    player_id: 'player-102',
    player_name: 'Rohit S.',
    shot_type: 'Pull Shot',
    video_url: '/data/sample_video.mp4',
    total_frames: 180,
    fps: 30,
    biomechanics: {
      max_bat_speed_kmh: 46.2,
      impact_elbow_angle_deg: 74.2,
      head_tilt_at_impact_deg: 8.5,
      balance_rating_percent: 74,
      technique_compliance: 'Minor Defect',
      flaws_detected: ['Early Head Fall to Off-side', 'Elbow Collapsing on Contact'],
    },
    pitch_bounce: {
      bounce_frame: 36,
      bounce_x: 0.48,
      bounce_y: 0.22,
      length_category: 'Short',
      line_category: 'Off Stump',
      speed_kmh: 138.1,
    },
    trajectory: [
      { frame: 10, x: 0.50, y: 0.15 },
      { frame: 36, x: 0.48, y: 0.22 }, // Bounce
      { frame: 60, x: 0.46, y: 0.38 },
      { frame: 72, x: 0.44, y: 0.48 }, // Impact
    ],
    frames: [
      {
        frame_idx: 72,
        timestamp: 2.4,
        keypoints: {
          nose: [0.58, 0.28, 0.91],
          left_shoulder: [0.55, 0.34, 0.89],
          right_shoulder: [0.49, 0.34, 0.90],
          left_elbow: [0.60, 0.44, 0.82],
          right_elbow: [0.44, 0.41, 0.85],
          left_wrist: [0.58, 0.50, 0.80],
          right_wrist: [0.46, 0.48, 0.84],
          left_hip: [0.53, 0.58, 0.88],
          right_hip: [0.48, 0.58, 0.89],
          left_knee: [0.56, 0.73, 0.86],
          right_knee: [0.47, 0.74, 0.87],
          left_ankle: [0.58, 0.90, 0.85],
          right_ankle: [0.46, 0.91, 0.86],
        },
        head_stability_score: 72,
        elbow_angle_deg: 74.2,
        bat_angle_deg: 18.0,
        is_optimal_elbow: false,
      }
    ],
    ai_coach: {
      overall_rating: 6.4,
      headline: 'Quick Hip Rotation Compromised by Collapsing Elbow',
      technique_breakdown: 'Extremely fast hands generated 46.2 km/h bat speed, but the front elbow dropped prematurely to 74°, risking a top-edge over mid-wicket.',
      suggested_drills: [
        {
          name: 'High-Arm Extension Pull Drill',
          description: 'Hitting underarm throws across chest height while keeping arms extended through finish.',
          focus_area: 'Arm Extension & High Finish',
        },
        {
          name: 'Targeted Head Stillness Drill',
          description: 'Focus eyes on release point without opening chest before swivel.',
          focus_area: 'Head Alignment on Short Balls',
        }
      ],
      mental_cue: 'Roll the wrists over the ball, finish high above shoulder level.',
    }
  }
];
