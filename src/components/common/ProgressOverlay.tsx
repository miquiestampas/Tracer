import React from 'react';
import { Box, Progress, Text, Overlay } from '@mantine/core';

interface ProgressOverlayProps {
  visible: boolean;
  progress: number;
  label?: string;
  zIndex?: number;
}

export function ProgressOverlay({ visible, progress, label, zIndex = 1000 }: ProgressOverlayProps) {
  if (!visible) return null;

  return (
    <Box
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Overlay color="#000" opacity={0.6} blur={2} />
      <Box
        style={{
          position: 'relative',
          zIndex: 1,
          width: '80%',
          maxWidth: 400,
          padding: 'var(--mantine-spacing-xl)',
          backgroundColor: 'var(--mantine-color-white)',
          borderRadius: 'var(--mantine-radius-lg)',
          boxShadow: 'var(--mantine-shadow-lg)',
        }}
      >
        <Progress
          value={progress}
          size="xl"
          radius="xl"
          style={{ marginBottom: 'var(--mantine-spacing-md)' }}
          animated
        />
        <Text
          size="lg"
          fw={500}
          style={{
            textAlign: 'center',
            color: 'var(--mantine-color-gray-7)',
          }}
        >
          {label || `${Math.round(progress)}%`}
        </Text>
      </Box>
    </Box>
  );
} 