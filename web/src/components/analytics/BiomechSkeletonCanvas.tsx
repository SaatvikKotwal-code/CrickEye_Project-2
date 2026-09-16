'use client';

import React, { useRef, useEffect } from 'react';
import { FramePose } from '../../types/crickeye';

interface BiomechSkeletonCanvasProps {
  currentFrame?: FramePose;
  width?: number;
  height?: number;
}

// COCO Pose skeleton connection pairs
const SKELETON_PAIRS: [string, string][] = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

export const BiomechSkeletonCanvas: React.FC<BiomechSkeletonCanvasProps> = ({
  currentFrame,
  width = 640,
  height = 480,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    if (!currentFrame || !currentFrame.keypoints) return;

    const kp = currentFrame.keypoints;

    // Helper to get pixel coordinates from normalized or raw coords
    const getPos = (name: string): [number, number] | null => {
      const p = kp[name];
      if (!p || p[2] < 0.3) return null; // check confidence
      const x = p[0] <= 1 ? p[0] * width : p[0];
      const y = p[1] <= 1 ? p[1] * height : p[1];
      return [x, y];
    };

    // Draw Skeleton Bone Connectors
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    SKELETON_PAIRS.forEach(([p1Name, p2Name]) => {
      const pos1 = getPos(p1Name);
      const pos2 = getPos(p2Name);

      if (pos1 && pos2) {
        ctx.beginPath();
        ctx.moveTo(pos1[0], pos1[1]);
        ctx.lineTo(pos2[0], pos2[1]);

        // Highlight leading arm in emerald green if optimal elbow, else neon cyan
        if (
          (p1Name.includes('left_elbow') || p2Name.includes('left_elbow')) &&
          currentFrame.is_optimal_elbow
        ) {
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 4;
        } else if (
          (p1Name.includes('left_elbow') || p2Name.includes('left_elbow')) &&
          currentFrame.is_optimal_elbow === false
        ) {
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 4;
        } else {
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
          ctx.lineWidth = 3;
        }
        ctx.stroke();
      }
    });

    // Draw Keypoint Joints
    Object.keys(kp).forEach((name) => {
      const pos = getPos(name);
      if (!pos) return;

      ctx.beginPath();
      ctx.arc(pos[0], pos[1], 5, 0, Math.PI * 2);

      if (name.includes('elbow')) {
        ctx.fillStyle = currentFrame.is_optimal_elbow ? '#10b981' : '#f43f5e';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
      } else if (name === 'nose') {
        ctx.fillStyle = '#00f0ff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.9)';
        ctx.lineWidth = 1.5;
      }

      ctx.fill();
      ctx.stroke();
    });

    // Draw Angle Readout Overlay near left elbow
    const elbowPos = getPos('left_elbow');
    if (elbowPos && currentFrame.elbow_angle_deg !== undefined) {
      ctx.font = '700 12px Outfit, sans-serif';
      ctx.fillStyle = currentFrame.is_optimal_elbow ? '#10b981' : '#f43f5e';
      ctx.fillText(
        `ELBOW: ${currentFrame.elbow_angle_deg.toFixed(1)}°`,
        elbowPos[0] + 12,
        elbowPos[1] - 8
      );
    }
  }, [currentFrame, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
};
