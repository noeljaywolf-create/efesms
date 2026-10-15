import type { SxProps, Theme } from '@mui/material'

// Shared slate input styling keeps forms legible across operational sections.
export const lightFieldSx: SxProps<Theme> = {
  '& .MuiInputBase-root': {
    borderRadius: 2,
    bgcolor: '#1B2834',
    '&.Mui-disabled': { bgcolor: '#202E3B' },
  },
  '& .MuiInputBase-input': {
    color: '#EFF4F8',
    caretColor: '#FF7043',
    '&.Mui-disabled': { WebkitTextFillColor: '#A7B3BF', opacity: 1 },
  },
  '& .MuiInputBase-input::placeholder': { color: '#91A0AE', opacity: 1 },
  '& .MuiSelect-select': { color: '#EFF4F8' },
  '& .MuiInputLabel-root': { color: '#A7B3BF', '&.Mui-focused': { color: '#FF9677' } },
  '& .MuiFormHelperText-root': { color: '#91A0AE' },
  '& .MuiOutlinedInput-root': {
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(174,190,204,0.19)' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,112,67,0.55)' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#FF7043' },
  },
}

// Slightly deeper fields are useful for dense job-entry panels.
export const darkFieldSx: SxProps<Theme> = {
  '& .MuiInputBase-root': {
    borderRadius: 2,
    bgcolor: '#17232E',
  },
  '& .MuiInputBase-input': { color: '#EFF4F8', caretColor: '#FF7043' },
  '& .MuiInputBase-input::placeholder': { color: '#91A0AE', opacity: 1 },
  '& .MuiSelect-select': { color: '#EFF4F8' },
  '& .MuiInputLabel-root': { color: '#A7B3BF', '&.Mui-focused': { color: '#FF9677' } },
  '& .MuiOutlinedInput-root': {
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(174,190,204,0.19)' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,112,67,0.55)' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#FF7043' },
  },
}
