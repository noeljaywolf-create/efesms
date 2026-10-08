import type { SxProps, Theme } from '@mui/material'

// Shared dark input styling for forms throughout the authenticated workspace.
// A restrained orange focus ring carries the login brand into every form.
export const lightFieldSx: SxProps<Theme> = {
  '& .MuiInputBase-root': {
    borderRadius: 2,
    bgcolor: '#20212b',
    '&.Mui-disabled': { bgcolor: '#272832' },
  },
  '& .MuiInputBase-input': {
    color: '#f5f5f7',
    caretColor: '#FF3D00',
    '&.Mui-disabled': { WebkitTextFillColor: '#c7c9d2', opacity: 1 },
  },
  '& .MuiInputBase-input::placeholder': { color: '#b0b4c1', opacity: 1 },
  '& .MuiSelect-select': { color: '#f2f2f7' },
  '& .MuiInputLabel-root': { color: '#b0b4c1', '&.Mui-focused': { color: '#FF6E40' } },
  '& .MuiFormHelperText-root': { color: '#9aa0b0' },
  '& .MuiOutlinedInput-root': {
    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3b3c49' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#FF6E40' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#FF3D00' },
  },
}

// Black field / white text — uniform dark inputs as requested
export const darkFieldSx: SxProps<Theme> = {
  '& .MuiInputBase-root': {
    borderRadius: 2,
    bgcolor: '#1c1d26',
  },
  '& .MuiInputBase-input': { color: '#ffffff', caretColor: '#FF3D00' },
  '& .MuiInputBase-input::placeholder': { color: '#9aa0b0', opacity: 1 },
  '& .MuiSelect-select': { color: '#ffffff' },
  '& .MuiInputLabel-root': { color: '#9aa0b0', '&.Mui-focused': { color: '#FF3D00' } },
  '& .MuiOutlinedInput-root': {
    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2a2a33' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#FF3D00' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#FF3D00' },
  },
}
