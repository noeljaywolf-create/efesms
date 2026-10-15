import type { ThemeOptions } from '@mui/material/styles'

// EFESMS — calm operational surfaces with the existing fire-orange brand accent.
export const brandTheme: ThemeOptions = {
  palette: {
    mode: 'dark',
    primary: {
      main: '#E84B1C',
      light: '#FF7043',
      dark: '#B93613',
      contrastText: '#ffffff',
    },
    secondary: { main: '#38A7A0', light: '#67C7BE', dark: '#237B76' },
    success: { main: '#48B987' },
    warning: { main: '#E7A844' },
    error: { main: '#E56A6F' },
    info: { main: '#69AEEB' },
    background: {
      default: '#101820',
      paper: '#18232E',
    },
    text: {
      primary: '#EFF4F8',
      secondary: '#A7B3BF',
    },
    divider: 'rgba(174,190,204,0.14)',
  },
  typography: {
    fontSize: 14,
    fontFamily: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h1: { fontWeight: 750, letterSpacing: '-0.035em' },
    h2: { fontWeight: 750, letterSpacing: '-0.035em' },
    h3: { fontWeight: 750, letterSpacing: '-0.035em' },
    h4: { fontWeight: 750, letterSpacing: '-0.025em' },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 14 },
  components: {
    // Keep app-surface and text decisions in one place. Screen components can
    // still own layout, while print templates retain their paper-specific CSS.
    MuiCssBaseline: {
      styleOverrides: {
        'html, body, #root': { backgroundColor: '#101820' },
        body: { color: '#EFF4F8' },
      },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 11,
          backgroundColor: 'rgba(174,190,204,0.035)',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(174,190,204,0.19)' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(174,190,204,0.38)' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#FF7043', borderWidth: 1 },
        },
        input: {
          '&::placeholder': { color: '#91A0AE', opacity: 1 },
          '&:-webkit-autofill': {
            WebkitBoxShadow: '0 0 0 100px #1B2834 inset',
            WebkitTextFillColor: '#EFF4F8',
            caretColor: '#EFF4F8',
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: { root: { color: '#A7B3BF', '&.Mui-focused': { color: '#FF9677' } } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: 'rgba(174,190,204,0.12)', padding: '13px 16px' },
        head: { color: '#A7B3BF', fontSize: 11, fontWeight: 700, letterSpacing: '0.055em', textTransform: 'uppercase' },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { '&:hover': { backgroundColor: 'rgba(174,190,204,0.045)' } },
      },
    },
    MuiMenu: {
      styleOverrides: { paper: { backgroundColor: '#1B2834', border: '1px solid rgba(174,190,204,0.14)' } },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(174,190,204,0.13)',
          background: '#18232E',
          boxShadow: '0 5px 18px rgba(3,10,18,0.16)',
          transition: 'border-color .18s ease, box-shadow .18s ease',
          '&:hover': {
            borderColor: 'rgba(232,75,28,0.42)',
            boxShadow: '0 8px 24px rgba(3,10,18,0.22)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '&:hover fieldset': { borderColor: 'rgba(232,75,28,0.55)' },
            '&.Mui-focused fieldset': { borderWidth: 1, borderColor: '#FF7043' },
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 650,
          borderRadius: 10,
          minHeight: 40,
          boxShadow: 'none',
          transition: 'background-color .16s ease, border-color .16s ease, color .16s ease',
        },
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { border: '1px solid rgba(174,190,204,0.15)', backgroundImage: 'none' } },
    },
  },
}
