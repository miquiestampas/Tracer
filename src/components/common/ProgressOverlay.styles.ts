import { createStyles } from '@mantine/core';

export const useStyles = createStyles((theme) => ({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    width: '80%',
    maxWidth: 400,
    padding: theme.spacing.xl,
    backgroundColor: theme.white,
    borderRadius: theme.radius.lg,
    boxShadow: theme.shadows.lg,
  },
  progress: {
    marginBottom: theme.spacing.md,
  },
  text: {
    textAlign: 'center',
    color: theme.colors.gray[7],
  },
})); 