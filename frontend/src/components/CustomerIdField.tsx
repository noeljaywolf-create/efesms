import { useEffect, useRef, useState } from 'react'
import { Box, Chip, CircularProgress, TextField, Typography, type SxProps, type Theme } from '@mui/material'
import { api } from '../api/client'

export interface CustomerMatch {
  id: number
  customerId: string
  name: string
  address?: string | null
  phone?: string | null
  whatsApp?: string | null
  email?: string | null
  nextServiceDate?: string | null
}

interface Row {
  id: number
  customerId: string
  name: string
  address?: string | null
  billingAddress?: string | null
  phone?: string | null
  whatsApp?: string | null
  email?: string | null
  nextServiceDate?: string | null
}

// One customer, one ID: resolve the permanent customer number against the
// customer register so jobs cannot create a second, disconnected identity.
export default function CustomerIdField({
  value,
  match,
  onChange,
  onMatch,
  label = 'Customer ID (CUS-######)',
  sx,
}: {
  value: string
  match: CustomerMatch | null
  onChange: (v: string) => void
  onMatch: (m: CustomerMatch | null) => void
  label?: string
  sx?: SxProps<Theme>
}) {
  const [candidates, setCandidates] = useState<Row[]>([])
  const [checking, setChecking] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const q = value.trim()
    if (!q) {
      setCandidates([])
      setChecking(false)
      onMatch(null)
      return
    }
    setChecking(true)
    const my = ++seq.current
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<Row[]>(`/customers?search=${encodeURIComponent(q)}`)
        if (seq.current !== my) return
        const list = (data ?? []).slice(0, 5)
        setCandidates(list)
        const exact = list.find((c) => c.customerId.toLowerCase() === q.toLowerCase()) ?? null
        onMatch(exact ? { id: exact.id, customerId: exact.customerId, name: exact.name, address: exact.billingAddress ?? exact.address, phone: exact.phone, whatsApp: exact.whatsApp, email: exact.email, nextServiceDate: exact.nextServiceDate } : null)
      } catch {
        if (seq.current === my) {
          setCandidates([])
          onMatch(null)
        }
      } finally {
        if (seq.current === my) setChecking(false)
      }
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const typed = value.trim() !== ''
  return (
    <Box>
      <TextField
        label={label}
        size="small"
        fullWidth
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="Type a customer ID, e.g. CUS-000001"
        slotProps={{ input: { endAdornment: checking ? <CircularProgress size={16} /> : undefined } }}
        sx={sx}
      />
      {typed && match && (
        <Chip
          size="small"
          label={`Files under ${match.customerId} Â· ${match.name}`}
          sx={{ mt: 1, bgcolor: '#2e7d3218', color: '#2e7d32', fontWeight: 800 }}
        />
      )}
      {typed && !checking && !match && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#d32f2f', fontWeight: 700 }}>
          No customer with this ID — choose an existing customer or create one in Customers first.
        </Typography>
      )}
      {typed && !match && candidates.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
          <Typography variant="caption" sx={{ color: '#6b7280', width: '100%' }}>Did you mean:</Typography>
          {candidates.map((c) => (
            <Chip
              key={c.id}
              size="small"
              label={`${c.customerId} Â· ${c.name}`}
              onClick={() => onChange(c.customerId)}
              sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 700, cursor: 'pointer' }}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}
