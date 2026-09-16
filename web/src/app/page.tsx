'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Flame,
  Activity,
  Award,
  Video,
  ChevronRight,
  TrendingUp,
  Download,
  CheckCircle2,
  AlertCircle,
  Radio,
} from 'lucide-react';
import { MOCK_SESSIONS } from '../data/mockSessions';
import { Navbar } from '../components/navigation/Navbar';

export default function DashboardHome() {
  const [role, setRole] = useState<'player' | 'coach'>('player');

  const toggleRole = () => {
    setRole(r => (r === 'player' ? 'coach' : 'player'));
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar currentRole={role} onRoleToggle={toggleRole} />

      <main style={{ flex: 1, maxWidth: '1440px', margin: '0 auto', width: '100%', padding: '32px' }}>
        {/* Hero Section */}
        <section style={{ marginBottom: '32px' }}>
          <div className="glass-panel" style={{
            padding: '36px',
            background: 'linear-gradient(135deg, rgba(14, 20, 36, 0.95), rgba(7, 10, 19, 0.95))',
            border: '1px solid rgba(0, 240, 255, 0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Glow accent */}
            <div style={{
              position: 'absolute',
              top: '-80px',
              right: '-80px',
              width: '280px',
              height: '280px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0, 240, 255, 0.15) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span className="badge-neon-cyan">
                  <Radio size={12} className="animate-pulse" />
                  CRICKET NET AI ANALYTICS
                </span>
                <span className="badge-neon-emerald">
                  ROLE: {role.toUpperCase()}
                </span>
              </div>
              <h1 style={{ fontSize: '2.2rem', color: '#f8fafc', marginBottom: '10px' }}>
                {role === 'player' ? 'Player Biomechanical Hub' : 'Academy Coach Command Center'}
              </h1>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem', maxWidth: '640px', lineHeight: 1.6 }}>
                Real-time computer vision tracking YOLOv8 pose keypoints, bat swing speed,
                trajectory pitch bounce zones, and Gemini-powered corrective coaching drills.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '14px' }}>
              <Link href="/sessions/session-001" className="btn-primary">
                <Video size={18} />
                Open Live Analyzer
              </Link>
              <a
                href="http://localhost:8000/download/apk"
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                <Download size={18} />
                Download APK
              </a>
            </div>
          </div>
        </section>

        {/* Aggregate Metrics Grid */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '36px' }}>
          <div className="glass-panel" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Bat Speed</span>
              <Flame size={18} color="#00f0ff" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '2.1rem', fontWeight: 900, color: '#f8fafc' }}>44.3</span>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>km/h</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', color: '#10b981', fontSize: '0.75rem' }}>
              <TrendingUp size={14} />
              <span>+3.2 km/h from last net session</span>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>High Elbow Compliance</span>
              <Activity size={18} color="#10b981" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '2.1rem', fontWeight: 900, color: '#10b981' }}>82%</span>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Optimal</span>
            </div>
            <p style={{ marginTop: '6px', color: '#94a3b8', fontSize: '0.75rem' }}>
              Front elbow maintained ≥90° at drive impact
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Head Stillness Rating</span>
              <Award size={18} color="#f59e0b" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '2.1rem', fontWeight: 900, color: '#f59e0b' }}>88 / 100</span>
            </div>
            <p style={{ marginTop: '6px', color: '#94a3b8', fontSize: '0.75rem' }}>
              Minimal lateral head tilt through ball release
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Inference Status</span>
              <Radio size={18} color="#00f0ff" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '2.1rem', fontWeight: 900, color: '#00f0ff' }}>18 ms</span>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>latency</span>
            </div>
            <p style={{ marginTop: '6px', color: '#10b981', fontSize: '0.75rem' }}>
              PyTorch CUDA / YOLOv8 Active
            </p>
          </div>
        </section>

        {/* Sessions Queue / Roster Section */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', color: '#f8fafc' }}>
                {role === 'player' ? 'Recent Net Deliveries' : 'Academy Player Queue'}
              </h2>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Select a delivery to launch the frame-by-frame synchronized biomechanical analyzer
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {MOCK_SESSIONS.map((session) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="glass-panel"
                style={{
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textDecoration: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(0, 240, 255, 0.1)',
                    border: '1px solid rgba(0, 240, 255, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Video size={22} color="#00f0ff" />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <strong style={{ fontSize: '1.05rem', color: '#f8fafc' }}>{session.player_name}</strong>
                      <span className="badge-neon-cyan">{session.shot_type}</span>
                      {session.biomechanics.technique_compliance === 'Optimal' ? (
                        <span className="badge-neon-emerald">
                          <CheckCircle2 size={13} />
                          Optimal Technique
                        </span>
                      ) : (
                        <span className="badge-neon-amber">
                          <AlertCircle size={13} />
                          Flaws Flagged
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>
                      Session: {session.id} • {session.pitch_bounce ? `${session.pitch_bounce.length_category} Delivery (${session.pitch_bounce.speed_kmh} km/h)` : 'Live Feed'}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Bat Speed</span>
                    <p style={{ fontSize: '1.15rem', fontWeight: 800, color: '#00f0ff' }}>
                      {session.biomechanics.max_bat_speed_kmh} <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>km/h</span>
                    </p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Elbow Angle</span>
                    <p style={{ fontSize: '1.15rem', fontWeight: 800, color: session.biomechanics.impact_elbow_angle_deg >= 90 ? '#10b981' : '#f59e0b' }}>
                      {session.biomechanics.impact_elbow_angle_deg}°
                    </p>
                  </div>

                  <div className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.82rem' }}>
                    Analyze
                    <ChevronRight size={16} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{
        marginTop: 'auto',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '24px 32px',
        backgroundColor: 'rgba(7, 10, 19, 0.95)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.78rem',
        color: '#64748b',
      }}>
        <div>
          <strong>CrickEye Pro</strong> — AI-Powered Cricket Biomechanics & Delivery Tracking Platform
        </div>
        <div>
          Next.js App Router • FastAPI PyTorch YOLOv8 • Node.js Gemini LLM • Supabase RLS
        </div>
      </footer>
    </div>
  );
}
