'use client';

import React from 'react';
import Link from 'next/link';
import { Activity, Radio, BarChart3, ShieldCheck, Video } from 'lucide-react';

interface NavbarProps {
  currentRole?: 'player' | 'coach';
  onRoleToggle?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentRole = 'player', onRoleToggle }) => {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 32px',
      backgroundColor: 'rgba(7, 10, 19, 0.85)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Brand Logo */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #00f0ff, #10b981)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 15px rgba(0, 240, 255, 0.4)',
        }}>
          <Activity size={22} color="#070a13" strokeWidth={2.5} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.02em' }}>CRICKEYE</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#00f0ff', background: 'rgba(0, 240, 255, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>PRO</span>
          </div>
          <p style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Biomechanics & Net Tracking</p>
        </div>
      </Link>

      {/* Navigation items */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f8fafc', fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none' }}>
          <BarChart3 size={18} color="#00f0ff" />
          Dashboard
        </Link>
        <Link href="/sessions/session-001" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none' }}>
          <Video size={18} />
          Session Analyzer
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} className="badge-neon-emerald">
          <Radio size={14} className="animate-pulse" />
          FASTAPI READY
        </div>
      </nav>

      {/* Role Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {onRoleToggle && (
          <button
            onClick={onRoleToggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '20px',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#f8fafc',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <ShieldCheck size={15} color={currentRole === 'coach' ? '#10b981' : '#00f0ff'} />
            ROLE: {currentRole.toUpperCase()}
          </button>
        )}
        <a
          href="http://localhost:8000/download/apk"
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
          style={{ padding: '8px 16px', fontSize: '0.8rem' }}
        >
          Android APK
        </a>
      </div>
    </header>
  );
};
