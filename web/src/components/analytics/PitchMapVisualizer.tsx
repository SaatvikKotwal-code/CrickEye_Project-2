'use client';

import React from 'react';
import { PitchBounceInfo } from '../../types/crickeye';

interface PitchMapVisualizerProps {
  pitchBounce?: PitchBounceInfo;
}

export const PitchMapVisualizer: React.FC<PitchMapVisualizerProps> = ({ pitchBounce }) => {
  const getLengthColor = (category?: string) => {
    switch (category) {
      case 'Yorker': return '#f43f5e';
      case 'Full': return '#00f0ff';
      case 'Good Length': return '#10b981';
      case 'Short': return '#f59e0b';
      case 'Bouncer': return '#ef4444';
      default: return '#10b981';
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Pitch Bounce & Trajectory Map
        </h3>
        {pitchBounce && (
          <span className="badge-neon-cyan">
            {pitchBounce.speed_kmh ? `${pitchBounce.speed_kmh} km/h` : 'TRACKED'}
          </span>
        )}
      </div>

      {/* 2D Pitch Graphic */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '240px',
        backgroundColor: '#1c2438',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
        boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.6)',
      }}>
        {/* Pitch Surface Turf */}
        <div style={{
          position: 'absolute',
          left: '20%',
          right: '20%',
          top: 0,
          bottom: 0,
          backgroundColor: '#3b3225', // cricket clay/turf pitch color
          borderLeft: '2px solid rgba(255, 255, 255, 0.15)',
          borderRight: '2px solid rgba(255, 255, 255, 0.15)',
        }}>
          {/* Popping Crease (Batsman end) */}
          <div style={{
            position: 'absolute',
            bottom: '35px',
            left: 0,
            right: 0,
            height: '2px',
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
          }} />

          {/* Stumps indicator */}
          <div style={{
            position: 'absolute',
            bottom: '18px',
            left: '42%',
            width: '16%',
            height: '4px',
            backgroundColor: '#f59e0b',
            borderRadius: '2px',
          }} />

          {/* Length Zones Overlay */}
          <div style={{ position: 'absolute', top: '25%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255, 255, 255, 0.2)' }}>
            <span style={{ fontSize: '0.65rem', color: '#94a3b8', paddingLeft: '4px' }}>Short</span>
          </div>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255, 255, 255, 0.2)' }}>
            <span style={{ fontSize: '0.65rem', color: '#10b981', paddingLeft: '4px' }}>Good</span>
          </div>
          <div style={{ position: 'absolute', top: '75%', left: 0, right: 0, height: '1px', borderTop: '1px dashed rgba(255, 255, 255, 0.2)' }}>
            <span style={{ fontSize: '0.65rem', color: '#00f0ff', paddingLeft: '4px' }}>Full</span>
          </div>

          {/* Bounce Spot Marker */}
          {pitchBounce && (
            <div style={{
              position: 'absolute',
              left: `${pitchBounce.bounce_x * 100}%`,
              top: `${pitchBounce.bounce_y * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: getLengthColor(pitchBounce.length_category),
              boxShadow: `0 0 15px ${getLengthColor(pitchBounce.length_category)}`,
              border: '2px solid #ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#ffffff' }} />
            </div>
          )}
        </div>
      </div>

      {/* Metrics Legend */}
      {pitchBounce && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Length</span>
            <p style={{ fontSize: '0.95rem', fontWeight: 800, color: getLengthColor(pitchBounce.length_category) }}>
              {pitchBounce.length_category}
            </p>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Line</span>
            <p style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f8fafc' }}>
              {pitchBounce.line_category}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
