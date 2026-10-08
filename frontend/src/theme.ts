import type { ThemeOptions } from '@mui/material/styles'

// EFESMS — charcoal and fire-orange brand system shared after sign-in.
export const brandTheme: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: {
      main: '#FF3D00',
      light: '#FF6E40',
      dark: '#DD2C00',
      contrastText: '#ffffff',
    },
    secondary: { main: '#FF6E40', light: '#FF8A65', dark: '#DD2C00' },
    success: { main: '#2e7d32' },
    warning: { main: '#ff9800' },
    error: { main: '#d32f2f' },
    info: { main: '#FF6E40' },
    background: {
      default: '#0a0a0f',
      paper: '#14141c',
    },
    text: {
      primary: '#f2f2f7',
      secondary: '#a7a7b2',
    },
    divider: 'rgba(255,255,255,0.08)',
  },
  typography: {
    fontSize: 14,
    fontFamily: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.03em' },
    h2: { fontWeight: 800, letterSpacing: '-0.03em' },
    h3: { fontWeight: 800, letterSpacing: '-0.03em' },
    h4: { fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    // Keep app-surface and text decisions in one place. Screen components can
    // still own layout, while print templates retain their paper-specific CSS.
    MuiCssBaseline: {
      styleOverrides: {
        'html, body, #root': { backgroundColor: '#0a0a0f' },
        body: { color: '#f2f2f7' },
      },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(255,255,255,0.08)',
          background: '#14141c',
          boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
          transition: 'transform .25s ease, border-color .25s ease, box-shadow .25s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            borderColor: 'rgba(255,61,0,0.45)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.5), 0 0 24px rgba(255,61,0,0.12)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600 },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '&:hover fieldset': { borderColor: 'rgba(255,61,0,0.4)' },
          },
        },
      },
    },
  },
}
