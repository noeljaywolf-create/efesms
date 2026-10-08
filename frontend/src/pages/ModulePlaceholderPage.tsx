import { Alert, Box, Breadcrumbs, Typography } from '@mui/material'
import { Link, useLocation } from 'react-router-dom'

// Generic screen for modules not yet implemented (SRS §37 — build-out tracker)
export default function ModulePlaceholderPage({ title }: { title: string }) {
  const location = useLocation()
  return (
    <Box>
      <Breadcrumbs sx={{ mb: 1 }}>
        <Link to="/dashboard" style={{ color: 'inherit' }}>Home</Link>
        <Typography color="text.primary">{title}</Typography>
      </Breadcrumbs>
      <Typography variant="h4" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Alert severity="info">
        Module under construction — route <code>{location.pathname}</code> ready in the navigation shell.
      </Alert>
    </Box>
  )
}