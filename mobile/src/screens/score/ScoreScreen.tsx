/**
 * CrickEye Mobile — ScoreScreen
 * Delivery scorecard: PlayCard summary, slow-motion video player, and Gemini AI coaching insights.
 */

import React from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { PlayCard } from '../../components/player/PlayCard';
import { VideoScrubber } from '../../components/video/VideoScrubber';
import { AiCoachCard } from '../../components/player/AiCoachCard';
import { SessionResults } from '../../types/session';

interface ScoreScreenProps {
  results?: SessionResults | null;
  serverUrl: string;
}

export const ScoreScreen: React.FC<ScoreScreenProps> = ({ results, serverUrl }) => {
  const videoUrl = results?.annotated_video_url || results?.video_url
    ? `${serverUrl.replace(/\/+$/, '')}/${(results.annotated_video_url || results.video_url!).replace(/^\/+/, '')}`
    : undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Session Hero PlayCard */}
      <PlayCard results={results} />

      {/* HTTP 206 Synchronized Video Player */}
      <VideoScrubber
        videoUrl={videoUrl}
        totalFrames={results?.total_frames ?? 150}
        fps={results?.fps ? Math.round(results.fps) : 30}
      />

      {/* Gemini AI Coaching Engine Card */}
      <AiCoachCard insights={results?.llm_insights} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070a13',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
});
