import { Platform } from 'react-native';

/** Ink and electric lime: a training-app HUD over a full-bleed camera. */
export const color = {
  ink: '#0B0D0C',
  panel: 'rgba(14,17,15,0.82)',
  panelSolid: '#141816',
  raised: '#1D2320',
  hairline: 'rgba(255,255,255,0.08)',
  text: '#F4F7F2',
  muted: '#8C968F',
  faint: '#4A524D',
  lime: '#C6FF3D',
  limeInk: '#11160A',
  coral: '#FF6B4A',
  cyan: '#3DD6FF',
  amber: '#FFC23D',
};

export const type = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }) as string,
  label: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
  },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
