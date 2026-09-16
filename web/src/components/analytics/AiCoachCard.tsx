'use client';

import React from 'react';
import { Sparkles, Target, Brain, CheckCircle2 } from 'lucide-react';
import { AiCoachInsight } from '../../types/crickeye';

interface AiCoachCardProps {
  insights?: AiCoachInsight;
}

export const AiCoachCard: React.FC<AiCoachCardProps> = ({ insights }) => {
  if (!insights) return null;

  return (
    <div className="glass-panel" style={{
      padding: '24px',
      border: '1px solid rgba(0, 240, 255, 0.25)',
      background: 'linear-gradient(145deg, rgba(14, 20, 36, 0.9), rgba(7, 10, 19, 0.95))',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #00f0ff, #10b981)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Sparkles size={18} color="#070a13" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', color: '#f8fafc' }}>Gemini AI Coach Insights</h3>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Real-time Biomechanical Evaluation & Drill Engine</p>
          </div>
        </div>

        {/* Rating Score Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(0, 240, 255, 0.1)',
          border: '1px solid rgba(0, 240, 255, 0.3)',
          padding: '6px 14px',
          borderRadius: '20px',
        }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>RATING</span>
          <span style={{ fontSize: '1.15rem', color: '#00f0ff', fontWeight: 900 }}>{insights.overall_rating}</span>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>/ 10</span>
        </div>
      </div>

      {/* Headline */}
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderLeft: '3px solid #00f0ff',
        padding: '12px 16px',
        borderRadius: '0 8px 8px 0',
        marginBottom: '16px',
      }}>
        <h4 style={{ fontSize: '0.92rem', color: '#f8fafc', fontWeight: 700 }}>
          {insights.headline}
        </h4>
        <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '6px', lineHeight: 1.5 }}>
          {insights.technique_breakdown}
        </p>
      </div>

      {/* Mental Cue */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        marginBottom: '20px',
      }}>
        <Brain size={18} color="#10b981" />
        <span style={{ fontSize: '0.82rem', color: '#10b981', fontWeight: 600 }}>
          Coach's Key Mental Cue: <em>"{insights.mental_cue}"</em>
        </span>
      </div>

      {/* Recommended Drills */}
      <div>
        <h5 style={{ fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
          Recommended Corrective Drills
        </h5>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          {insights.suggested_drills.map((drill, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Target size={16} color="#00f0ff" />
                <strong style={{ fontSize: '0.86rem', color: '#f8fafc' }}>{drill.name}</strong>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.4 }}>
                {drill.description}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                <CheckCircle2 size={13} color="#10b981" />
                <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>
                  {drill.focus_area}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
