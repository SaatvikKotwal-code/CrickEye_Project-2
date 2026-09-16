'use client';

import React, { useState, useRef, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Gauge,
  Activity,
  CheckCircle,
  AlertTriangle,
  Flame,
} from 'lucide-react';
import { MOCK_SESSIONS } from '../../../data/mockSessions';
import { BiomechSkeletonCanvas } from '../../../components/analytics/BiomechSkeletonCanvas';
import { PitchMapVisualizer } from '../../../components/analytics/PitchMapVisualizer';
import { WagonWheelVisualizer } from '../../../components/analytics/WagonWheelVisualizer';
import { AiCoachCard } from '../../../components/analytics/AiCoachCard';

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.id;

  const session = MOCK_SESSIONS.find((s) => s.id === sessionId) || MOCK_SESSIONS[0];

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(75);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const stepFrame = (frames: number) => {
    const frameTime = 1 / session.fps;
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + frames * frameTime);
      setCurrentTime(videoRef.current.currentTime);
      setCurrentFrameIdx(Math.floor(videoRef.current.currentTime * session.fps));
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      setCurrentFrameIdx(Math.floor(videoRef.current.currentTime * session.fps));
    }
  };

  // Find pose keypoints corresponding to the active frame
  const activePose = session.frames[0]; // Active demonstration pose

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 32px' }}>
      {/* Navigation Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link href="/" className="btn-secondary" style={{ padding: '8px 14px' }}>
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.4rem', color: '#f8fafc' }}>
                Delivery Analysis: {session.player_name}
              </h1>
              <span className="badge-neon-cyan">{session.shot_type}</span>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Session ID: {session.id} • Recorded: {new Date(session.created_at).toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="badge-neon-emerald">
            <CheckCircle size={14} />
            {session.biomechanics.technique_compliance}
          </div>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: '24px' }}>
        {/* Left Column: Synchronized Video & Canvas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="glass-panel" style={{ padding: '16px', overflow: 'hidden' }}>
            {/* Synchronized Viewport */}
            <div style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16/9',
              backgroundColor: '#000000',
              borderRadius: '10px',
              overflow: 'hidden',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)',
            }}>
              <video
                ref={videoRef}
                src={session.video_url}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onTimeUpdate={handleTimeUpdate}
                playsInline
                loop
              />

              {/* Biomechanical Skeleton 2D Overlay */}
              <BiomechSkeletonCanvas
                currentFrame={activePose}
                width={854}
                height={480}
              />

              {/* HUD Telemetry Tag on top of video */}
              <div style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                display: 'flex',
                gap: '8px',
              }}>
                <span style={{
                  backgroundColor: 'rgba(7, 10, 19, 0.85)',
                  backdropFilter: 'blur(8px)',
                  color: '#00f0ff',
                  fontFamily: 'JetBrains Mono',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                }}>
                  FRAME: {currentFrameIdx} / {session.total_frames}
                </span>
                <span style={{
                  backgroundColor: 'rgba(7, 10, 19, 0.85)',
                  backdropFilter: 'blur(8px)',
                  color: '#10b981',
                  fontFamily: 'JetBrains Mono',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}>
                  {session.fps} FPS
                </span>
              </div>
            </div>

            {/* Video Controls Bar */}
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Timeline scrubber slider */}
              <input
                type="range"
                min="0"
                max={session.total_frames / session.fps}
                step="0.01"
                value={currentTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (videoRef.current) videoRef.current.currentTime = val;
                  setCurrentTime(val);
                }}
                style={{
                  width: '100%',
                  accentColor: '#00f0ff',
                  cursor: 'pointer',
                }}
              />

              {/* Playback action buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => stepFrame(-1)} className="btn-secondary" style={{ padding: '6px 10px' }}>
                    <SkipBack size={16} />
                  </button>
                  <button onClick={togglePlay} className="btn-primary" style={{ padding: '6px 18px' }}>
                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                    {isPlaying ? 'PAUSE' : 'PLAY'}
                  </button>
                  <button onClick={() => stepFrame(1)} className="btn-secondary" style={{ padding: '6px 10px' }}>
                    <SkipForward size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '14px', fontSize: '0.8rem', fontFamily: 'JetBrains Mono', color: '#94a3b8' }}>
                  <span>TIME: <strong style={{ color: '#f8fafc' }}>{currentTime.toFixed(2)}s</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* AI Coach Insights component */}
          <AiCoachCard insights={session.ai_coach} />
        </div>

        {/* Right Column: Key Metrics, Pitch Map & Wagon Wheel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Biomechanical Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
            <div className="glass-panel" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.75rem', marginBottom: '6px' }}>
                <Flame size={16} color="#00f0ff" />
                MAX BAT SPEED
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#00f0ff' }}>
                  {session.biomechanics.max_bat_speed_kmh}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>km/h</span>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.75rem', marginBottom: '6px' }}>
                <Activity size={16} color="#10b981" />
                IMPACT ELBOW
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981' }}>
                  {session.biomechanics.impact_elbow_angle_deg}°
                </span>
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>OPTIMAL</span>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.75rem', marginBottom: '6px' }}>
                <Gauge size={16} color="#f59e0b" />
                HEAD TILT DEVIATION
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f59e0b' }}>
                  {session.biomechanics.head_tilt_at_impact_deg}°
                </span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>STABLE</span>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.75rem', marginBottom: '6px' }}>
                <CheckCircle size={16} color="#00f0ff" />
                BALANCE RATING
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f8fafc' }}>
                  {session.biomechanics.balance_rating_percent}%
                </span>
              </div>
            </div>
          </div>

          {/* Pitch Map component */}
          <PitchMapVisualizer pitchBounce={session.pitch_bounce} />

          {/* Wagon Wheel component */}
          <WagonWheelVisualizer shotType={session.shot_type} />
        </div>
      </div>
    </div>
  );
}
