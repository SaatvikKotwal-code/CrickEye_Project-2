'use client';

import React from 'react';

interface WagonWheelProps {
  shotType: string;
}

export const WagonWheelVisualizer: React.FC<WagonWheelProps> = ({ shotType }) => {
  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1rem', color: '#f8fafc' }}>
          Wagon Wheel & Field Dispersion
        </h3>
        <span className="badge-neon-emerald">{shotType}</span>
      </div>

      <div style={{
        position: 'relative',
        width: '100%',
        height: '240px',
        backgroundColor: '#0a1612', // deep turf grass tone
        borderRadius: '12px',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.7)',
      }}>
        {/* Ground Boundary Circle */}
        <div style={{
          width: '210px',
          height: '210px',
          borderRadius: '50%',
          border: '2px dashed rgba(255, 255, 255, 0.25)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {/* 30-Yard Circle */}
          <div style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }} />

          {/* Pitch Strip in center */}
          <div style={{
            position: 'absolute',
            width: '10px',
            height: '34px',
            backgroundColor: '#854d0e',
            borderRadius: '2px',
          }} />

          {/* Dynamic Shot Trajectory Line */}
          {shotType.toLowerCase().includes('cover') && (
            <div style={{
              position: 'absolute',
              width: '95px',
              height: '3px',
              backgroundColor: '#00f0ff',
              boxShadow: '0 0 10px #00f0ff',
              transformOrigin: '0% 50%',
              left: '50%',
              top: '50%',
              transform: 'rotate(-40deg)',
              borderRadius: '2px',
            }}>
              <div style={{
                position: 'absolute',
                right: '-4px',
                top: '-4px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#00f0ff',
                boxShadow: '0 0 8px #00f0ff',
              }} />
            </div>
          )}

          {shotType.toLowerCase().includes('pull') && (
            <div style={{
              position: 'absolute',
              width: '95px',
              height: '3px',
              backgroundColor: '#f59e0b',
              boxShadow: '0 0 10px #f59e0b',
              transformOrigin: '0% 50%',
              left: '50%',
              top: '50%',
              transform: 'rotate(135deg)',
              borderRadius: '2px',
            }}>
              <div style={{
                position: 'absolute',
                right: '-4px',
                top: '-4px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#f59e0b',
                boxShadow: '0 0 8px #f59e0b',
              }} />
            </div>
          )}

          {/* Field Sector labels */}
          <span style={{ position: 'absolute', top: '10px', fontSize: '0.62rem', color: '#64748b' }}>STRAIGHT</span>
          <span style={{ position: 'absolute', right: '10px', fontSize: '0.62rem', color: '#64748b' }}>COVER</span>
          <span style={{ position: 'absolute', left: '10px', fontSize: '0.62rem', color: '#64748b' }}>MID-WICKET</span>
          <span style={{ position: 'absolute', bottom: '10px', fontSize: '0.62rem', color: '#64748b' }}>FINE LEG</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#94a3b8' }}>
        <span>Estimated Distance: <strong style={{ color: '#f8fafc' }}>64.8 m</strong></span>
        <span>Launch Elevation: <strong style={{ color: '#f8fafc' }}>Ground</strong></span>
      </div>
    </div>
  );
};
