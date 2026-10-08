import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Popover,
  Select,
  Snackbar,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import SearchIcon from '@mui/icons-material/Search'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import PhoneIcon from '@mui/icons-material/Phone'
import MailIcon from '@mui/icons-material/Mail'
import VisibilityIcon from '@mui/icons-material/Visibility'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import GoogleIcon from '@mui/icons-material/Google'
import FacebookIcon from '@mui/icons-material/Facebook'
import InstagramIcon from '@mui/icons-material/Instagram'
import TwitterIcon from '@mui/icons-material/Twitter'
import PublicIcon from '@mui/icons-material/Public'
import TravelExploreIcon from '@mui/icons-material/TravelExplore'
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter'
import PlaceIcon from '@mui/icons-material/Place'
import PrintIcon from '@mui/icons-material/Print'
import { api } from '../api/client'
import { lightFieldSx } from '../lib/fieldSx'
import CustomerProfileDialog from './CustomerProfileDialog'
import { type Contact, CUSTOMER_TYPES, type Customer, type DuplicateCandidate, FREQUENCIES, type Profile, PRIORITIES, PRIORITY_COLORS, PREFERRED_CONTACTS, SERVICE_COLORS, SITE_TYPES, type Site, STATUSES, STATUS_COLORS } from './customerTypes'
import { useTablePrint } from '../components/print'

const TYPE_INFO: Record<string, string> = {
  Commercial: 'Private / trading businesses purchasing or leasing fire equipment and services.',
  Industrial: 'Factories, plants, warehouses and process facilities with heavy-duty requirements.',
  Institutional: 'Schools, hospitals, care centres and public institutions.',
  Residential: 'Homes, estates and residential complexes.',
  Government: 'National, provincial, municipal and para-statal entities.',
}

const STATUS_INFO: Record<string, string> = {
  Prospect: 'Lead / potential client — no active work yet.',
  Active: 'Existing client with active service agreements or recent work.',
  Inactive: 'No recent activity — retained on the register.',
  Blacklisted: 'Blocked from further business (e.g. non-payment).',
}

type Filters = { search: string; status: string; type: string; quick: string }

type FormCustomer = {
  name: string
  alternativeName: string
  legalName: string
  customerType: string
  vatNumber: string
  tinNumber: string
  registrationNumber: string
  phone: string
  whatsapp: string
  email: string
  website: string
  status: string
  priority: string
  category: string
  accountManager: string
  customerSince: string
  serviceFrequencyMonths: string
  preferredContact: string
  specialRequirements: string
  billingAddress: string
  paymentTerms: string
  creditInfo: string
  contractRef: string
  contractStartDate: string
  contractEndDate: string
  contractValue: string
  contractStatus: string
  notes: string
  contacts: Contact[]
  sites: Site[]
}

const EMPTY_FORM: FormCustomer = {
  name: '',
  alternativeName: '',
  legalName: '',
  customerType: 'Commercial',
  vatNumber: '',
  tinNumber: '',
  registrationNumber: '',
  phone: '',
  whatsapp: '',
  email: '',
  website: '',
  status: 'Prospect',
  priority: 'Normal',
  category: '',
  accountManager: '',
  customerSince: '',
  serviceFrequencyMonths: '6',
  preferredContact: 'Phone',
  specialRequirements: '',
  billingAddress: '',
  paymentTerms: '',
  creditInfo: '',
  contractRef: '',
  contractStartDate: '',
  contractEndDate: '',
  contractValue: '',
  contractStatus: 'None',
  notes: '',
  contacts: [],
  sites: [],
}

const QUICK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'duesoon', label: 'Due soon' },
  { key: 'due', label: 'Due' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'noservice', label: 'No service' },
  { key: 'new', label: 'New' },
]

const isValidEmail = (v?: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const isValidVat = (v?: string) => !v || /^\d{10}$/.test(v)

// Department / role policy (INTELLIGENT CUSTOMER MANAGEMENT — master record)
const currentRole = () => localStorage.getItem('efesms_role') ?? 'admin'
const currentDept = () => localStorage.getItem('efesms_dept') ?? 'Administration'
const isAdminUser = () => ['admin', 'administrator'].includes(currentRole())
const canDeleteCustomer = () => ['admin','administrator'].includes(currentRole().toLowerCase())
const canEditAccounts = () => isAdminUser() || currentDept() === 'Accounts'
const canEditContracts = () => isAdminUser() || currentDept() === 'Contracts'

const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`
const waHref = (p: string) => `https://wa.me/${p.replace(/[^\d]/g, '')}`

function PhoneRow({ phone, onCopy }: { phone: string; onCopy: (t: string) => void }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <PhoneIcon sx={{ fontSize: 14, color: '#1d4ed8' }} />
      <Box
        component="a"
        href={telHref(phone)}
        onClick={(e) => e.stopPropagation()}
        sx={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2, '&:hover': { color: '#1e40af' } }}
      >
        {phone}
      </Box>
      <Box
        component="a"
        href={waHref(phone)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color: '#25d366', fontSize: 12, fontWeight: 800, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
      >
        <WhatsAppIcon sx={{ fontSize: 13 }} /> WhatsApp
      </Box>
      <Tooltip title="Copy number">
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onCopy(phone) }} sx={{ color: '#6b7280', minWidth: 40, minHeight: 40 }}>
          <ContentCopyIcon sx={{ fontSize: 13 }} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}

function EmailRow({ email, onCopy }: { email: string; onCopy: (t: string) => void }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <MailIcon sx={{ fontSize: 14, color: '#1d4ed8' }} />
      <Box
        component="a"
        href={`mailto:${email}`}
        onClick={(e) => e.stopPropagation()}
        sx={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2, '&:hover': { color: '#1e40af' } }}
      >
        {email}
      </Box>
      <Tooltip title="Copy email">
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onCopy(email) }} sx={{ color: '#6b7280', minWidth: 40, minHeight: 40 }}>
          <ContentCopyIcon sx={{ fontSize: 13 }} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}

type FT = {
  title: string
  description: string
  wikidataUrl: string
  website?: string
  phone?: string
  socials?: { username?: string; facebook?: string; instagram?: string; email?: string } | null
}
type OSM = {
  name: string
  address: string
  lat: number
  lon: number
  phone?: string
  website?: string
  socials?: { username?: string; facebook?: string; instagram?: string; email?: string } | null
}
type DirectoryDto = { query: string; scope: string; featured: FT | null; osmResults: OSM[] }

const xHref = (u: string) => `https://x.com/${u}`
const fbHref = (f: string) => `https://www.facebook.com/${f}`
const igHref = (i: string) => `https://www.instagram.com/${i}`
const mapsHref = (os: OSM) => `https://www.openstreetmap.org/?mlat=${os.lat}&mlon=${os.lon}`

function SocialChips({ socials }: { socials?: FT['socials'] }) {
  if (!socials) return null
  const chips: React.ReactNode[] = []
  if (socials.username) chips.push(<Chip key="x" icon={<TwitterIcon />} label={`@${socials.username}`} component="a" href={xHref(socials.username)} target="_blank" rel="noopener noreferrer" clickable size="small" sx={{ color: '#000', borderColor: '#e0e0e0', '&:hover': { bgcolor: '#f5f5f5' } }} />)
  if (socials.facebook) chips.push(<Chip key="fb" icon={<FacebookIcon />} label={socials.facebook} component="a" href={fbHref(socials.facebook)} target="_blank" rel="noopener noreferrer" clickable size="small" sx={{ color: '#1877F2', borderColor: '#1877F255' }} />)
  if (socials.instagram) chips.push(<Chip key="ig" icon={<InstagramIcon />} label={`@${socials.instagram}`} component="a" href={igHref(socials.instagram)} target="_blank" rel="noopener noreferrer" clickable size="small" sx={{ color: '#E4405F', borderColor: '#E4405F55' }} />)
  if (socials.email) chips.push(<Chip key="em" icon={<MailIcon />} label={socials.email} component="a" href={`mailto:${socials.email}`} clickable size="small" sx={{ color: '#1d4ed8', borderColor: '#1d4ed855' }} />)
  if (chips.length === 0) return null
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>{chips}</Box>
}

function WebLookupPanel({ query }: { query: string }) {
  const [data, setData] = useState<DirectoryDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [engine, setEngine] = useState<'bing' | 'google'>('bing')
  const [tab, setTab] = useState(0)
  const q = encodeURIComponent(query)
  const engineSrc = engine === 'bing'
    ? `https://www.bing.com/search?q=${q}`
    : `https://www.google.com/search?q=${q}`

  useEffect(() => {
    let alive = true
    setLoading(true)
    setFailed(false)
    setData(null)
    const timer = setTimeout(async () => {
      try {
        const { data: d } = await api.get<DirectoryDto>(`/directory/search?q=${q}`)
        if (alive) setData(d)
      } catch {
        if (alive) setFailed(true)
      } finally {
        if (alive) setLoading(false)
      }
    }, 400)
    return () => { alive = false; clearTimeout(timer) }
  }, [q])

  const busy = loading && !data
  const featured = data?.featured ?? null
  const osm = data?.osmResults ?? []

  const PanelEmpty = ({ children }: { children: React.ReactNode }) => (
    <Box sx={{ py: 5, textAlign: 'center' }}>
      <TravelExploreIcon sx={{ fontSize: 40, color: '#d1d5db', mb: 1 }} />
      <Typography variant="body2" sx={{ color: darkText.secondary }}>{children}</Typography>
    </Box>
  )

  return (
    <Box
      sx={{
        bgcolor: '#ffffff',
        border: '1px solid #eef0f4',
        borderRadius: 3,
        boxShadow: '0 2px 16px rgba(0,0,0,0.04)',
        p: 3,
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <GoogleIcon sx={{ color: '#4285F4' }} />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" sx={{ color: darkText.primary, fontWeight: 800 }}>
            “{query}” isn't in the customer register
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ color: darkText.secondary }}>
              Live web search inside EFESMS — plus a public profile from Wikidata &amp; OpenStreetMap.
            </Typography>
            {data && (
              <Chip
                label={data.scope}
                size="small"
                icon={<PublicIcon />}
                sx={{ bgcolor: '#0288d113', color: '#0288d1', fontSize: 11, height: 20, fontWeight: 800 }}
              />
            )}
          </Box>
        </Box>
      </Box>

      {failed && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>Public profile lookup is unavailable — Live Search still works.</Alert>
      )}

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: '1px solid #eef0f4', '& .MuiTab-root': { textTransform: 'none', fontWeight: 700 } }}
      >
        <Tab icon={<TravelExploreIcon />} iconPosition="start" label="Live Search" />
        <Tab icon={<BusinessCenterIcon />} iconPosition="start" label="Public Profile" />
        <Tab icon={<PlaceIcon />} iconPosition="start" label="Maps & Address" />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="caption" sx={{ color: darkText.secondary, fontWeight: 800, flexGrow: 1 }}>
              LIVE SEARCH RESULTS
            </Typography>
            <ToggleButtonGroup size="small" exclusive value={engine} onChange={(_, next) => next && setEngine(next)}>
              <ToggleButton value="bing">Bing</ToggleButton>
              <ToggleButton value="google">Google</ToggleButton>
            </ToggleButtonGroup>
            <Button size="small" component="a" href={engineSrc} target="_blank" rel="noopener noreferrer" startIcon={<OpenInNewIcon fontSize="small" />}>
              Open full
            </Button>
          </Box>
          <Box sx={{ border: '1px solid #e8e8ee', borderRadius: 2, overflow: 'hidden', bgcolor: '#fff', height: { xs: 340, sm: 520 } }}>
            <iframe
              key={engine}
              title={`${engine} search — ${query}`}
              src={engineSrc}
              allow="clipboard-write"
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff', display: 'block' }}
            />
          </Box>
          <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block', mt: 1 }}>
            Results stream live from {engine === 'bing' ? 'Microsoft Bing' : 'Google'} — no new tabs needed.
          </Typography>
        </Box>
      )}

      {tab === 1 && (
        <Box sx={{ mt: 2 }}>
          {busy ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4, justifyContent: 'center' }}>
              <CircularProgress size={20} /> <Typography sx={{ color: darkText.secondary }}>Looking it up…</Typography>
            </Box>
          ) : featured ? (
            <Box sx={{ border: '1px solid #e8e8ee', borderRadius: 2, p: 2, bgcolor: '#fafbfc' }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontWeight: 800, color: darkText.primary, fontSize: 17 }}>{featured.title}</Typography>
                <Chip label="Verified profile" size="small" sx={{ bgcolor: '#FF3D0014', color: '#FF3D00', fontSize: 11, height: 20, fontWeight: 700 }} />
              </Box>
              {featured.description && (
                <Typography variant="body2" sx={{ color: darkText.secondary, mt: 0.5 }}>{featured.description}</Typography>
              )}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1.5 }}>
                {featured.website && <ContactLink label="Website" href={featured.website} />}
                {featured.phone && <ContactLink label="Phone" href={telHref(featured.phone)} />}
                <ContactLink label="Wikidata" href={featured.wikidataUrl} />
              </Box>
              <SocialChips socials={featured.socials} />
            </Box>
          ) : (
            <PanelEmpty>No public profile found on Wikidata for “{query}” yet.</PanelEmpty>
          )}
        </Box>
      )}

      {tab === 2 && (
        <Box sx={{ mt: 2 }}>
          {busy ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4, justifyContent: 'center' }}>
              <CircularProgress size={20} /> <Typography sx={{ color: darkText.secondary }}>Looking it up…</Typography>
            </Box>
          ) : osm.length > 0 ? (
            <Box>
              <Typography variant="caption" sx={{ color: darkText.secondary, fontWeight: 700, display: 'block', mb: 1 }}>
                AFRICA MAPS / ADDRESS RESULTS
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {osm.map((os, i) => (
                  <Box key={i} sx={{ border: '1px solid #eef0f4', borderRadius: 2, p: 2 }}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontWeight: 700, color: darkText.primary }}>{os.name}</Typography>
                      <Chip label="View on map" icon={<OpenInNewIcon sx={{ fontSize: 13 }} />} component="a" href={mapsHref(os)} target="_blank" rel="noopener noreferrer" clickable size="small" sx={{ color: '#0288d1', borderColor: '#0288d155' }} />
                    </Box>
                    <Typography variant="body2" sx={{ color: darkText.secondary, mt: 0.5 }}>{os.address}</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
                      {os.phone && <ContactLink label="Phone" href={telHref(os.phone)} />}
                      {os.website && <ContactLink label="Website" href={os.website} />}
                    </Box>
                    <SocialChips socials={os.socials} />
                  </Box>
                ))}
              </Box>
            </Box>
          ) : (
            <PanelEmpty>{data ? `No map locations found in ${data.scope} for “${query}”.` : 'Loading…'}</PanelEmpty>
          )}
        </Box>
      )}
    </Box>
  )
}

function ContactLink({ label, href }: { label: string; href: string }) {
  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: '#1d4ed8', fontWeight: 600, fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 2, '&:hover': { color: '#1e40af' } }}
    >
      <OpenInNewIcon sx={{ fontSize: 14 }} /> {label}
    </Box>
  )
}

const darkText = { primary: '#0f0f13', secondary: '#6b7280' }

export default function CustomersPage() {
  const isMobile = useMediaQuery('(max-width: 700px)')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<Filters>({ search: '', status: '', type: '', quick: 'all' })
  const printable = useTablePrint()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormCustomer>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [pop, setPop] = useState<{ kind: '' | 'type' | 'status' | 'contact'; anchor: HTMLElement | null; customer: Customer | null }>({ kind: '', anchor: null, customer: null })
  const [profile, setProfile] = useState<Customer | null>(null)
  const [original, setOriginal] = useState<FormCustomer | null>(null)
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null)
  const [dupCandidates, setDupCandidates] = useState<DuplicateCandidate[]>([])
  const [dupReason, setDupReason] = useState('')
  const [dupOpen, setDupOpen] = useState(false)
  const [dupResolved, setDupResolved] = useState(false)
  const [conflict, setConflict] = useState<{ latest: Customer | null; fields: string; message: string } | null>(null)

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {})
    setToast(`Copied: ${text}`)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (filters.search) params.set('search', filters.search)
      if (filters.type) params.set('type', filters.type)
      const statusKeys = new Set(['active', 'inactive'])
      if (filters.quick && statusKeys.has(filters.quick)) params.set('status', filters.quick.charAt(0).toUpperCase() + filters.quick.slice(1))
      const serviceKeys = new Set(['duesoon', 'due', 'overdue', 'noservice'])
      if (filters.quick && serviceKeys.has(filters.quick)) params.set('service', filters.quick)
      const { data } = await api.get<Customer[]>(`/customers?${params.toString()}`)
      let list = data
      if (filters.quick === 'new') {
        const cutoff = Date.now() - 30 * 86400000
        list = data.filter((c) => new Date(c.createdAt).getTime() >= cutoff)
      }
      setCustomers(list)
    } catch {
      setError('Could not load customers. Check that the service is running.')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setOriginal(null)
    setBaseUpdatedAt(null)
    setDupCandidates([])
    setDupReason('')
    setDupResolved(false)
    setDialogOpen(true)
  }

  const formFromCustomer = (c: Customer): FormCustomer => ({
    name: c.name,
    alternativeName: c.alternativeName ?? '',
    legalName: c.legalName ?? '',
    customerType: c.customerType,
    vatNumber: c.vatNumber ?? '',
    tinNumber: c.tinNumber ?? '',
    registrationNumber: c.registrationNumber ?? '',
    phone: c.phone,
    whatsapp: c.whatsapp ?? '',
    email: c.email ?? '',
    website: c.website ?? '',
    status: c.status,
    priority: c.priority,
    category: c.category ?? '',
    accountManager: c.accountManager ?? '',
    customerSince: c.customerSince ? c.customerSince.slice(0, 10) : '',
    serviceFrequencyMonths: String(c.serviceFrequencyMonths ?? ''),
    preferredContact: c.preferredContact,
    specialRequirements: c.specialRequirements ?? '',
    billingAddress: c.billingAddress ?? '',
    paymentTerms: c.paymentTerms ?? '',
    creditInfo: c.creditInfo ?? '',
    contractRef: c.contractRef ?? '',
    contractStartDate: c.contractStartDate ? c.contractStartDate.slice(0, 10) : '',
    contractEndDate: c.contractEndDate ? c.contractEndDate.slice(0, 10) : '',
    contractValue: c.contractValue != null ? String(c.contractValue) : '',
    contractStatus: c.contractStatus ?? 'None',
    notes: c.notes ?? '',
    contacts: c.contacts.map((k) => ({ ...k })),
    sites: (c as Customer & { sites?: Site[] }).sites ?? [],
  })

  const openEdit = (c: Customer) => {
    setEditingId(c.id)
    setForm(formFromCustomer(c))
    setOriginal(formFromCustomer(c))
    setBaseUpdatedAt(c.updatedAt)
    setFieldErrors({})
    setDupCandidates([])
    setDupReason('')
    setDupResolved(false)
    setDialogOpen(true)
  }

  const openProfileFromCandidate = async (cand: DuplicateCandidate) => {
    try {
      const { data } = await api.get<Profile>(`/customers/${cand.id}`)
      setProfile(data.customer)
    } catch {
      setToast('Could not load that record')
    }
  }

  const openEditFromCandidate = async (cand: DuplicateCandidate) => {
    try {
      const { data } = await api.get<Profile>(`/customers/${cand.id}`)
      setDupOpen(false)
      openEdit(data.customer)
    } catch {
      setToast('Could not load that record')
    }
  }

  const requestReview = async (cand: DuplicateCandidate) => {
    if (!dupReason.trim()) { setFieldErrors({ form: 'Please explain why this needs an administrator review.' }); return }
    setSaving(true)
    try {
      await api.post(`/customers/${cand.id}/review-requests`, { reason: dupReason.trim() })
      setDupOpen(false)
      setDialogOpen(false)
      setToast('Review request sent to an administrator')
    } catch {
      setToast('Could not send the review request')
    } finally {
      setSaving(false)
    }
  }

  const setContact = (i: number, patch: Partial<Contact>) => {
    setForm((f) => {
      const contacts = f.contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
      if (patch.isPrimary) contacts.forEach((c) => (c.isPrimary = c === contacts[i]))
      return { ...f, contacts }
    })
  }

  const setSite = (i: number, patch: Partial<Site>) => {
    setForm((f) => {
      const sites = f.sites.map((s, idx) => (idx === i ? { ...s, ...patch } : s))
      if (patch.isPrimary) sites.forEach((s) => (s.isPrimary = s === sites[i]))
      return { ...f, sites }
    })
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Customer name is required'
    if (!form.phone.trim()) e.phone = 'Contact phone is required'
    if (!isValidEmail(form.email)) e.email = 'Enter a valid email address'
    if (!isValidVat(form.vatNumber)) e.vatNumber = 'Enter a valid 10-digit VAT number'
    if (form.contacts.length > 0 && form.contacts.some((c) => !c.name.trim() || !c.phone.trim()))
      e.contacts = 'Every contact needs a name and phone'
    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  const buildPayload = () => ({
    name: form.name,
    alternativeName: form.alternativeName || null,
    legalName: form.legalName || null,
    customerType: form.customerType,
    vatNumber: form.vatNumber || null,
    tinNumber: form.tinNumber || null,
    registrationNumber: form.registrationNumber || null,
    phone: form.phone,
    whatsapp: form.whatsapp || null,
    email: form.email || null,
    website: form.website || null,
    status: form.status,
    priority: form.priority,
    category: form.category || null,
    accountManager: form.accountManager || null,
    customerSince: form.customerSince ? new Date(`${form.customerSince}T00:00:00`).toISOString() : null,
    serviceFrequencyMonths: form.serviceFrequencyMonths ? Number(form.serviceFrequencyMonths) : null,
    preferredContact: form.preferredContact,
    specialRequirements: form.specialRequirements || null,
    billingAddress: form.billingAddress || null,
    paymentTerms: form.paymentTerms || null,
    creditInfo: form.creditInfo || null,
    contractRef: form.contractRef || null,
    contractStartDate: form.contractStartDate ? new Date(`${form.contractStartDate}T00:00:00`).toISOString() : null,
    contractEndDate: form.contractEndDate ? new Date(`${form.contractEndDate}T00:00:00`).toISOString() : null,
    contractValue: form.contractValue ? Number(form.contractValue) : null,
    contractStatus: form.contractStatus || 'None',
    notes: form.notes || null,
    contacts: form.contacts.map((c) => ({
      name: c.name,
      role: c.role || null,
      phone: c.phone,
      email: c.email || null,
      isPrimary: c.isPrimary,
    })),
    sites: form.sites.map((s) => ({
      name: s.name,
      siteType: s.siteType,
      address: s.address || null,
      city: s.city || null,
      contactPerson: s.contactPerson || null,
      phone: s.phone || null,
      email: s.email || null,
      isPrimary: s.isPrimary,
      notes: s.notes || null,
    })),
  })

  const changedFields = (): string[] => {
    if (!original) return []
    const scalars: (keyof FormCustomer)[] = [
      'name', 'alternativeName', 'legalName', 'customerType', 'vatNumber', 'tinNumber', 'registrationNumber', 'phone', 'whatsapp', 'email',
      'website', 'status', 'priority', 'category', 'accountManager', 'customerSince', 'serviceFrequencyMonths', 'preferredContact',
      'specialRequirements', 'billingAddress', 'paymentTerms', 'creditInfo', 'contractRef', 'contractStartDate', 'contractEndDate',
      'contractValue', 'contractStatus', 'notes',
    ]
    const changed = scalars.filter((k) => (form[k] ?? '') !== (original?.[k] ?? ''))
    if (JSON.stringify(form.contacts) !== JSON.stringify(original.contacts)) changed.push('contacts')
    if (JSON.stringify(form.sites) !== JSON.stringify(original.sites)) changed.push('sites')
    return changed
  }

  const save = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload: any = buildPayload()
      if (editingId) {
        payload.baseUpdatedAt = baseUpdatedAt
        payload.changed = changedFields()
        payload.reason = dupReason.trim() || null
        await api.put(`/customers/${editingId}`, payload)
      } else {
        if (!dupResolved) {
          const { data: matches } = await api.post<DuplicateCandidate[]>('/customers/check-duplicates', {
            name: form.name,
            alternativeName: form.alternativeName || null,
            legalName: form.legalName || null,
            phone: form.phone,
            whatsapp: form.whatsapp || null,
            email: form.email || null,
            vatNumber: form.vatNumber || null,
            tinNumber: form.tinNumber || null,
            contactPerson: form.contacts[0]?.name ?? null,
            siteAddress: form.sites[0]?.address ?? null,
          })
          if (matches.length > 0) {
            setDupCandidates(matches)
            setDupOpen(true)
            setSaving(false)
            return
          }
        }
        payload.reason = dupReason.trim() || null
        await api.post('/customers', payload, {
          headers: isAdminUser() && dupResolved ? { 'X-Override-Duplicate': '1' } : {},
        })
      }
      setDialogOpen(false)
      setToast(editingId ? 'Customer updated' : 'Customer created')
      load()
    } catch (err: any) {
      const d = err?.response?.data
      if (err?.response?.status === 409) {
        if (d?.error === 'DUPLICATE') {
          setDupCandidates(d.candidates ?? [])
          setDupOpen(true)
        } else if (d?.error === 'CONFLICT') {
          setConflict({ latest: d.latest ?? null, fields: (d.fields ?? []).join(', ') || 'that information', message: d.message ?? 'Another user changed this record first.' })
        } else if (d?.error === 'MERGED') {
          setDialogOpen(false)
          setToast(d.message ?? 'This record was merged into another. Edit the master record instead.')
          load()
        } else {
          setFieldErrors({ form: 'This record changed on the server. Please reload it before saving again.' })
        }
      } else {
        setFieldErrors({ form: 'Save failed. Check the data and try again.' })
      }
    } finally {
      setSaving(false)
    }
  }

  const reloadLatest = async () => {
    if (!editingId) return
    try {
      const { data } = await api.get<Profile>(`/customers/${editingId}`)
      setForm(formFromCustomer(data.customer))
      setOriginal(formFromCustomer(data.customer))
      setBaseUpdatedAt(data.customer.updatedAt)
      setConflict(null)
      setToast('Loaded the latest saved values — nothing was overwritten')
    } catch {
      setToast('Could not reload the record')
    }
  }

  const remove = async (c: Customer) => {
    if (!canDeleteCustomer()) { setToast('Only an admin can delete customers.'); return }
    if (!window.confirm(`Delete ${c.name}? This removes its contacts too.`)) return
    try {
      await api.delete(`/customers/${c.id}`)
      setToast('Customer deleted')
      load()
    } catch {
      setToast('Delete failed')
    }
  }

  const primaryContact = (c: Customer) => c.contacts.find((k) => k.isPrimary) ?? c.contacts[0]

  const accountsLocked = !!editingId && !canEditAccounts()
  const contractsLocked = !!editingId && !canEditContracts()

  return (
    <Box sx={{ minHeight: '100%' }}>
      {/* header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#f2f2f7', letterSpacing: '-0.02em' }}>
            Customers
          </Typography>
          <Typography variant="body2" sx={{ color: '#9aa0b0', fontWeight: 500 }}>
            Client register · sites · equipment · service history
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<PrintIcon />} disabled={customers.length === 0} onClick={() => printable.print({
          title: 'Customer Register',
          subtitle: `${customers.length} customers · grouped by service status`,
          cols: [{ label: 'Customer' }, { label: 'ID' }, { label: 'Type' }, { label: 'Phone' }, { label: 'Email' }, { label: 'Service' }, { label: 'Status' }],
          rows: customers.map((c) => {
            const pc = primaryContact(c)
            return [
              c.name,
              c.customerId,
              c.customerType || '—',
              c.phone || (pc?.phone ?? '—'),
              c.email || (pc?.email ?? '—'),
              c.serviceStatus || '—',
              c.status || '—',
            ]
          }),
          groupBy: 5,
          note: 'Client register covering all sites, equipment and service history on record.',
        })} sx={{ borderRadius: 2 }}>Print</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 2, px: 3, py: 1 }}>
          Add Customer
        </Button>
      </Box>

      {printable.node}

      {/* filters */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          mb: 2,
          p: 2,
          bgcolor: '#ffffff',
          border: '1px solid #eef0f4',
          borderRadius: 2,
          boxShadow: '0 2px 16px rgba(0,0,0,0.04)',
        }}
      >
        <TextField
          size="small"
          placeholder="Search name, ID, phone, email, site…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            width: { xs: '100%', sm: 'auto' },
            minWidth: { xs: 0, sm: 260 },
            borderRadius: 1.5,
            bgcolor: '#ffffff',
            '& .MuiOutlinedInput-root': { bgcolor: '#ffffff' },
            '& .MuiInputBase-input': { color: '#0f0f13', '&::placeholder': { color: '#9ca3af', opacity: 1 } },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e5e7eb' },
            '& .MuiSvgIcon-root': { color: '#6b7280' },
          }}
        />
        <FormControl size="small" sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { xs: 0, sm: 150 } }}>
          <InputLabel sx={{ color: '#6b7280' }}>Type</InputLabel>
          <Select label="Type" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} sx={{ bgcolor: '#ffffff', '& .MuiSelect-select': { color: '#0f0f13' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e5e7eb' }, '& .MuiSvgIcon-root': { color: '#6b7280' } }}>
            <MenuItem value="">All types</MenuItem>
            {CUSTOMER_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* quick filters */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {QUICK_FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            clickable
            onClick={() => setFilters((prev) => ({ ...prev, quick: f.key, status: '', type: prev.type }))}
            sx={{
              bgcolor: filters.quick === f.key ? '#12121a' : '#ffffff',
              color: filters.quick === f.key ? '#ffffff' : '#374151',
              border: '1px solid',
              borderColor: filters.quick === f.key ? '#12121a' : '#e5e7eb',
              fontWeight: 700,
              '&:hover': { bgcolor: filters.quick === f.key ? '#1f2937' : '#f8fafc' },
              cursor: 'pointer',
            }}
          />
        ))}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!error && customers.length === 0 && !loading && (
        <Box sx={{ py: 3 }}>
          {filters.search.trim() ? (
            <WebLookupPanel query={filters.search.trim()} />
          ) : (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography variant="h6" sx={{ color: darkText.primary }}>No customers yet</Typography>
              <Typography variant="body2" sx={{ color: darkText.secondary }}>Add your first customer to start building the register.</Typography>
            </Box>
          )}
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        customers.length > 0 && (
          isMobile ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {customers.map((c) => {
                const pc = primaryContact(c)
                return (
                  <Box
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setProfile(c)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setProfile(c) }}
                    sx={{
                      bgcolor: '#ffffff',
                      border: '1px solid #eef0f4',
                      borderRadius: 2.5,
                      p: 2,
                      boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                      cursor: 'pointer',
                      '&:active': { bgcolor: '#fff7f2' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ bgcolor: '#ff8a0014', color: '#ff8a00', fontWeight: 700 }}>{c.name.charAt(0).toUpperCase()}</Avatar>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, color: darkText.primary }} noWrap>{c.name}</Typography>
                        <Typography variant="caption" sx={{ color: '#9ca3af', fontFamily: 'monospace', fontWeight: 700, display: 'block' }}>{c.customerId}</Typography>
                        {c.vatNumber && <Typography variant="caption" sx={{ color: darkText.secondary }}>VAT {c.vatNumber}</Typography>}
                        {c.completion != null && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
                            <LinearProgress variant="determinate" value={c.completion.percent} sx={{ flexGrow: 1, height: 4, borderRadius: 2 }} />
                            <Typography variant="caption" sx={{ color: c.completion.percent >= 80 ? '#2e7d32' : '#f57c00', fontWeight: 800 }}>{c.completion.percent}%</Typography>
                          </Box>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                        <Chip label={c.status} size="small" sx={{ bgcolor: `${STATUS_COLORS[c.status]}18`, color: STATUS_COLORS[c.status], fontWeight: 700 }} />
                        <Chip label={SERVICE_COLORS[c.serviceStatus].label} size="small" sx={{ bgcolor: `${SERVICE_COLORS[c.serviceStatus].color}18`, color: SERVICE_COLORS[c.serviceStatus].color, fontWeight: 700 }} />
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.25 }}>
                      <Chip label={c.customerType} size="small" sx={{ bgcolor: '#f1f5f9', color: '#334155', fontWeight: 600, '&:hover': { bgcolor: '#e2e8f0' } }} onClick={(e) => { e.stopPropagation(); setPop({ kind: 'type', anchor: e.currentTarget, customer: c }) }} />
                      {c.priority !== 'Normal' && <Chip label={c.priority} size="small" sx={{ bgcolor: `${PRIORITY_COLORS[c.priority]}18`, color: PRIORITY_COLORS[c.priority], fontWeight: 700 }} />}
                      {pc && (
                        <Typography variant="caption" sx={{ color: '#1d4ed8', fontWeight: 600 }}>
                          {pc.name} · {c.contacts.length} contact{c.contacts.length === 1 ? '' : 's'} ↗
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, mt: 1.25 }}>
                      <PhoneRow phone={c.phone} onCopy={copy} />
                      {c.whatsapp && c.whatsapp !== c.phone && <PhoneRow phone={c.whatsapp} onCopy={copy} />}
                      {c.email && <EmailRow email={c.email} onCopy={copy} />}
                    </Box>
                    {c.nextServiceDate && (
                      <Typography variant="caption" sx={{ color: SERVICE_COLORS[c.serviceStatus].color, fontWeight: 700, mt: 0.75, display: 'block' }}>
                        Next service: {new Date(c.nextServiceDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mt: 0.5 }} onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="View profile"><IconButton size="small" sx={{ minWidth: 40, minHeight: 40 }} onClick={() => setProfile(c)}><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Edit"><IconButton size="small" sx={{ minWidth: 40, minHeight: 40 }} onClick={() => openEdit(c)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                      {canDeleteCustomer() && (
                        <Tooltip title="Delete"><IconButton size="small" color="error" sx={{ minWidth: 40, minHeight: 40 }} onClick={() => remove(c)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                      )}
                    </Box>
                  </Box>
                )
              })}
              <Typography variant="caption" sx={{ color: '#9ca3af', px: 1 }}>
                {customers.length} customer{customers.length === 1 ? '' : 's'}
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ bgcolor: '#ffffff', border: '1px solid #eef0f4', borderRadius: 2, boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
            <Table>
              <TableHead>
                <TableRow sx={{ '& th': { color: '#0f0f13', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', bgcolor: '#f8fafc' } }}>
                  <TableCell>Customer</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Contact</TableCell>
                  <TableCell>Service</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {customers.map((c) => {
                  const pc = primaryContact(c)
                  return (
                    <TableRow
                      key={c.id}
                      hover
                      sx={{
                        cursor: 'pointer',
                        '& td': { color: darkText.primary, borderColor: '#f0f2f6' },
                        '&:hover td': { bgcolor: '#fff7f2' },
                      }}
                      onClick={() => setProfile(c)}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar sx={{ bgcolor: '#ff8a0014', color: '#ff8a00', fontWeight: 700 }}>{c.name.charAt(0).toUpperCase()}</Avatar>
                          <Box>
                            <Typography sx={{ fontWeight: 700, color: darkText.primary }}>{c.name}</Typography>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontFamily: 'monospace', fontWeight: 700, display: 'block' }}>{c.customerId}</Typography>
                            {c.vatNumber && <Typography variant="caption" sx={{ color: darkText.secondary }}>VAT {c.vatNumber}</Typography>}
                            {c.completion != null && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, width: 130 }}>
                                <LinearProgress variant="determinate" value={c.completion.percent} sx={{ flexGrow: 1, height: 4, borderRadius: 2 }} />
                                <Typography variant="caption" sx={{ color: c.completion.percent >= 80 ? '#2e7d32' : '#f57c00', fontWeight: 800 }}>{c.completion.percent}%</Typography>
                              </Box>
                            )}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={c.customerType}
                          size="small"
                          sx={{ bgcolor: '#f1f5f9', color: '#334155', fontWeight: 600, cursor: 'pointer', '&:hover': { bgcolor: '#e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' } }}
                          onClick={(e) => { e.stopPropagation(); setPop({ kind: 'type', anchor: e.currentTarget, customer: c }) }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box
                          sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); setPop({ kind: 'contact', anchor: e.currentTarget, customer: c }) }}
                        >
                          <PhoneRow phone={c.phone} onCopy={copy} />
                          {c.whatsapp && c.whatsapp !== c.phone && <PhoneRow phone={c.whatsapp} onCopy={copy} />}
                          {c.email && <EmailRow email={c.email} onCopy={copy} />}
                          {pc && (
                            <Typography variant="caption" sx={{ color: '#1d4ed8', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}>
                              {pc.name} · {c.contacts.length} contact{c.contacts.length === 1 ? '' : 's'} ↗
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-start' }}>
                          <Chip
                            label={SERVICE_COLORS[c.serviceStatus].label}
                            size="small"
                            sx={{ bgcolor: `${SERVICE_COLORS[c.serviceStatus].color}18`, color: SERVICE_COLORS[c.serviceStatus].color, fontWeight: 700, cursor: 'pointer', '&:hover': { boxShadow: `0 2px 10px ${SERVICE_COLORS[c.serviceStatus].color}55` } }}
                            onClick={(e) => { e.stopPropagation(); setProfile(c) }}
                          />
                          {c.nextServiceDate && (
                            <Typography variant="caption" sx={{ color: darkText.secondary }}>
                              {new Date(c.nextServiceDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={c.status}
                          size="small"
                          sx={{ bgcolor: `${STATUS_COLORS[c.status]}18`, color: STATUS_COLORS[c.status], fontWeight: 700, cursor: 'pointer', '&:hover': { boxShadow: `0 2px 10px ${STATUS_COLORS[c.status]}55` } }}
                          onClick={(e) => { e.stopPropagation(); setPop({ kind: 'status', anchor: e.currentTarget, customer: c }) }}
                        />
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="View profile">
                          <IconButton onClick={() => setProfile(c)}><VisibilityIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton onClick={() => openEdit(c)}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        {canDeleteCustomer() && (
                          <Tooltip title="Delete">
                            <IconButton color="error" onClick={() => remove(c)}><DeleteIcon fontSize="small" /></IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid #f0f2f6', color: '#9ca3af', typography: 'caption' }}>
              {customers.length} customer{customers.length === 1 ? '' : 's'}
            </Box>
            </TableContainer>
          )
        )
      )}

      {/* add / edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1, bgcolor: isMobile ? '#12121a' : 'transparent', color: isMobile ? '#f2f2f7' : 'inherit' }}>
          {editingId ? 'Edit Customer' : 'Add Customer'}
          {isMobile && <IconButton size="small" onClick={() => setDialogOpen(false)} sx={{ ml: 'auto', color: '#f2f2f7' }}><CloseIcon /></IconButton>}
        </DialogTitle>
        <DialogContent dividers>
          {fieldErrors.form && <Alert severity="error" sx={{ mb: 2 }}>{fieldErrors.form}</Alert>}
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <TextField label="Customer name *" value={form.name} error={!!fieldErrors.name} helperText={fieldErrors.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} sx={lightFieldSx} />
            <TextField label="Legal / trading name" value={form.legalName}
              onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))} sx={lightFieldSx} />
            <TextField label="Alternative / former name" value={form.alternativeName}
              onChange={(e) => setForm((f) => ({ ...f, alternativeName: e.target.value }))} sx={lightFieldSx} />
            <FormControl sx={lightFieldSx}>
              <InputLabel>Customer type</InputLabel>
              <Select label="Customer type" value={form.customerType}
                onChange={(e) => setForm((f) => ({ ...f, customerType: e.target.value }))}>
                {CUSTOMER_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl sx={lightFieldSx}>
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Phone *" value={form.phone} error={!!fieldErrors.phone} helperText={fieldErrors.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} sx={lightFieldSx} />
            <TextField label="WhatsApp" value={form.whatsapp}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} sx={lightFieldSx} />
            <TextField label="Email" value={form.email} error={!!fieldErrors.email} helperText={fieldErrors.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} sx={lightFieldSx} />
            <FormControl sx={lightFieldSx}>
              <InputLabel>Priority</InputLabel>
              <Select label="Priority" value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl sx={lightFieldSx}>
              <InputLabel>Preferred contact</InputLabel>
              <Select label="Preferred contact" value={form.preferredContact}
                onChange={(e) => setForm((f) => ({ ...f, preferredContact: e.target.value }))}>
                {PREFERRED_CONTACTS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl sx={lightFieldSx}>
              <InputLabel>Service cycle (months)</InputLabel>
              <Select label="Service cycle (months)" value={form.serviceFrequencyMonths}
                onChange={(e) => setForm((f) => ({ ...f, serviceFrequencyMonths: e.target.value }))}>
                {FREQUENCIES.map((fq) => <MenuItem key={fq} value={String(fq)}>{fq} months</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Customer since" type="date" value={form.customerSince}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={lightFieldSx}
              onChange={(e) => setForm((f) => ({ ...f, customerSince: e.target.value }))} />
            <TextField label="Category" value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} sx={lightFieldSx} />
            <TextField label="Account manager" value={form.accountManager}
              onChange={(e) => setForm((f) => ({ ...f, accountManager: e.target.value }))} sx={lightFieldSx} />
            <TextField label="VAT number (10 digits)" value={form.vatNumber} error={!!fieldErrors.vatNumber}
              helperText={fieldErrors.vatNumber || (accountsLocked ? 'Accounts department & admins can edit.' : undefined)}
              slotProps={{ input: { readOnly: accountsLocked } }}
              onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))} sx={lightFieldSx} />
            <TextField label="TIN number" value={form.tinNumber}
              helperText={accountsLocked ? 'Accounts department & admins can edit.' : undefined}
              slotProps={{ input: { readOnly: accountsLocked } }}
              onChange={(e) => setForm((f) => ({ ...f, tinNumber: e.target.value }))} sx={lightFieldSx} />
            <TextField label="Company registration no." value={form.registrationNumber}
              helperText={accountsLocked ? 'Accounts department & admins can edit.' : undefined}
              slotProps={{ input: { readOnly: accountsLocked } }}
              onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))} sx={lightFieldSx} />
            <TextField label="Payment terms" value={form.paymentTerms}
              helperText={accountsLocked ? 'Accounts department & admins can edit.' : undefined}
              slotProps={{ input: { readOnly: accountsLocked } }}
              onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))} sx={lightFieldSx} />
            <TextField label="Credit information" value={form.creditInfo}
              helperText={accountsLocked ? 'Accounts department & admins can edit.' : undefined}
              slotProps={{ input: { readOnly: accountsLocked } }}
              onChange={(e) => setForm((f) => ({ ...f, creditInfo: e.target.value }))} sx={lightFieldSx} />
            <TextField label="Website" value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} sx={lightFieldSx} />
            <TextField label="Billing address" value={form.billingAddress}
              onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))} sx={lightFieldSx} />
            <Typography variant="h6" sx={{ mt: 2, color: darkText.primary, gridColumn: { sm: '1 / -1' } }}>
              Contract details
            </Typography>
            <TextField label="Contract reference" value={form.contractRef}
              helperText={contractsLocked ? 'Contracts department & admins can edit.' : undefined}
              slotProps={{ input: { readOnly: contractsLocked } }}
              onChange={(e) => setForm((f) => ({ ...f, contractRef: e.target.value }))} sx={lightFieldSx} />
            <TextField label="Contract start" type="date" value={form.contractStartDate}
              slotProps={{ inputLabel: { shrink: true }, input: { readOnly: contractsLocked } }}
              sx={lightFieldSx}
              onChange={(e) => setForm((f) => ({ ...f, contractStartDate: e.target.value }))} />
            <TextField label="Contract end" type="date" value={form.contractEndDate}
              slotProps={{ inputLabel: { shrink: true }, input: { readOnly: contractsLocked } }}
              sx={lightFieldSx}
              onChange={(e) => setForm((f) => ({ ...f, contractEndDate: e.target.value }))} />
            <TextField label="Contract value (USD)" type="number" value={form.contractValue}
              helperText={contractsLocked ? 'Contracts department & admins can edit.' : undefined}
              slotProps={{ input: { readOnly: contractsLocked } }}
              onChange={(e) => setForm((f) => ({ ...f, contractValue: e.target.value }))} sx={lightFieldSx} />
            <FormControl sx={lightFieldSx}>
              <InputLabel>Contract status</InputLabel>
              <Select label="Contract status" value={form.contractStatus} disabled={contractsLocked}
                onChange={(e) => setForm((f) => ({ ...f, contractStatus: e.target.value }))}>
                {['None', 'Active', 'EndingSoon', 'Expired', 'Renewal', 'Terminated'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Special requirements / notes to service crew" multiline minRows={2} value={form.specialRequirements} sx={{ ...lightFieldSx, gridColumn: { sm: '1 / -1' } } as any}
              onChange={(e) => setForm((f) => ({ ...f, specialRequirements: e.target.value }))} />
            <TextField label="Notes" multiline minRows={2} value={form.notes} sx={{ ...lightFieldSx, gridColumn: { sm: '1 / -1' } } as any}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Box>

          <Typography variant="h6" sx={{ mt: 3, mb: 1, color: darkText.primary }}>Contacts</Typography>
          {fieldErrors.contacts && <Alert severity="error" sx={{ mb: 1 }}>{fieldErrors.contacts}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {form.contacts.map((c, i) => (
              <Box key={i} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: '2fr 2fr 2fr 1fr 1fr' }, alignItems: 'center' }}>
                <TextField size="small" label="Name *" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} sx={lightFieldSx} />
                <TextField size="small" label="Role" value={c.role ?? ''} onChange={(e) => setContact(i, { role: e.target.value })} sx={lightFieldSx} />
                <TextField size="small" label="Phone *" value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} sx={lightFieldSx} />
                <TextField size="small" label="Email" value={c.email ?? ''} onChange={(e) => setContact(i, { email: e.target.value })} sx={lightFieldSx} />
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                  <FormControl size="small" sx={{ minWidth: 110, ...lightFieldSx } as any}>
                    <InputLabel>Primary</InputLabel>
                    <Select label="Primary" value={c.isPrimary ? 'primary' : 'extra'}
                      onChange={(e) => setContact(i, { isPrimary: e.target.value === 'primary' })}>
                      <MenuItem value="primary">Primary</MenuItem>
                      <MenuItem value="extra">Contact</MenuItem>
                    </Select>
                  </FormControl>
                  <IconButton size="small" color="error" onClick={() => setForm((f) => ({ ...f, contacts: f.contacts.filter((_, idx) => idx !== i) }))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            ))}
            <Button
              startIcon={<PersonAddIcon />}
              onClick={() => setForm((f) => ({ ...f, contacts: [...f.contacts, { name: '', role: '', phone: '', email: '', isPrimary: f.contacts.length === 0 }] }))}
              sx={{ alignSelf: 'flex-start' }}
            >
              Add contact
            </Button>
          </Box>

          <Typography variant="h6" sx={{ mt: 3, mb: 1, color: darkText.primary }}>Sites</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {form.sites.map((s, i) => (
              <Box key={i} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: '2fr 1.5fr 2fr 1fr' }, alignItems: 'center' }}>
                <TextField size="small" label="Site name *" value={s.name} onChange={(e) => setSite(i, { name: e.target.value })} sx={lightFieldSx} />
                <FormControl size="small" sx={lightFieldSx}>
                  <InputLabel>Type</InputLabel>
                  <Select label="Type" value={s.siteType} onChange={(e) => setSite(i, { siteType: e.target.value })}>
                    {SITE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField size="small" label="Address" value={s.address ?? ''} onChange={(e) => setSite(i, { address: e.target.value })} sx={lightFieldSx} />
                <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                  <FormControl size="small" sx={{ minWidth: 110, ...lightFieldSx } as any}>
                    <InputLabel>Primary</InputLabel>
                    <Select label="Primary" value={s.isPrimary ? 'primary' : 'extra'}
                      onChange={(e) => setSite(i, { isPrimary: e.target.value === 'primary' })}>
                      <MenuItem value="primary">Primary</MenuItem>
                      <MenuItem value="extra">Site</MenuItem>
                    </Select>
                  </FormControl>
                  <IconButton size="small" color="error" onClick={() => setForm((f) => ({ ...f, sites: f.sites.filter((_, idx) => idx !== i) }))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
                <TextField size="small" label="City" value={s.city ?? ''} onChange={(e) => setSite(i, { city: e.target.value })} sx={lightFieldSx} />
                <TextField size="small" label="Contact person" value={s.contactPerson ?? ''} onChange={(e) => setSite(i, { contactPerson: e.target.value })} sx={lightFieldSx} />
                <TextField size="small" label="Site phone" value={s.phone ?? ''} onChange={(e) => setSite(i, { phone: e.target.value })} sx={lightFieldSx} />
                <TextField size="small" label="Site email" value={s.email ?? ''} onChange={(e) => setSite(i, { email: e.target.value })} sx={lightFieldSx} />
                <TextField size="small" label="Notes" value={s.notes ?? ''} onChange={(e) => setSite(i, { notes: e.target.value })} sx={{ ...lightFieldSx, gridColumn: { sm: '1 / -1' } } as any} />
              </Box>
            ))}
            <Button
              startIcon={<LocationOnIcon />}
              onClick={() => setForm((f) => ({ ...f, sites: [...f.sites, { name: '', siteType: 'Head office', address: '', city: '', contactPerson: '', phone: '', email: '', isPrimary: f.sites.length === 0, notes: '' }] }))}
              sx={{ alignSelf: 'flex-start' }}
            >
              Add site
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? <CircularProgress size={18} color="inherit" /> : editingId ? 'Save changes' : 'Create customer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* info popovers: type / status / contact */}
      <Popover
        open={!!pop.anchor && pop.kind !== ''}
        anchorEl={pop.anchor}
        onClose={() => setPop((p) => ({ ...p, anchor: null, kind: '' }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 2, minWidth: 220, maxWidth: 320, borderRadius: 2 } } }}
      >
        {pop.customer && pop.kind === 'type' && (
          <Box>
            <Typography variant="h6" sx={{ fontSize: 15, fontWeight: 800 }}>{pop.customer.customerType}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{TYPE_INFO[pop.customer.customerType]}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
              {pop.customer.customerType} client · <b>{pop.customer.name}</b>
            </Typography>
          </Box>
        )}
        {pop.customer && pop.kind === 'status' && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={pop.customer.status}
                size="small"
                sx={{ bgcolor: `${STATUS_COLORS[pop.customer.status]}18`, color: STATUS_COLORS[pop.customer.status], fontWeight: 700 }}
              />
            </Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{STATUS_INFO[pop.customer.status]}</Typography>
          </Box>
        )}
        {pop.customer && pop.kind === 'contact' && (
          <Box>
            <Typography variant="h6" sx={{ fontSize: 15, fontWeight: 800 }}>Contacts · {pop.customer.name}</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
              {pop.customer.contacts.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>No contacts on file.</Typography>}
              {pop.customer.contacts.map((k) => (
                <Box key={k.id ?? k.name} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{k.name}</Typography>
                    {k.isPrimary && <Chip label="Primary" size="small" sx={{ bgcolor: '#FF3D0014', color: '#FF3D00', fontSize: 11, height: 20, fontWeight: 700 }} />}
                  </Box>
                  {k.role && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{k.role}</Typography>}
                  <Box sx={{ mt: 0.75 }}>
                    <PhoneRow phone={k.phone} onCopy={copy} />
                    {k.email && <EmailRow email={k.email} onCopy={copy} />}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Popover>

      {/* possible-existing customer (duplicate intelligence) */}
      <Dialog open={dupOpen} onClose={() => setDupOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
          Possible existing customer
          <IconButton size="small" onClick={() => setDupOpen(false)} sx={{ ml: 'auto' }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This customer looks like it may already exist. One customer should have one master record only — adding a new one creates a duplicate.
          </Alert>
          <Typography variant="caption" sx={{ fontWeight: 700, color: darkText.secondary }}>MATCHES FOUND ({dupCandidates.length})</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
            {dupCandidates.map((cand) => (
              <Box key={cand.id} sx={{ border: '1px solid #eef0f4', borderRadius: 2, p: 1.5 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontWeight: 800, color: darkText.primary }}>{cand.name}</Typography>
                  <Chip size="small" label={cand.customerId} sx={{ fontFamily: 'monospace', bgcolor: '#f1f5f9', color: '#334155', fontWeight: 700 }} />
                  <Chip size="small" sx={{ bgcolor: `${cand.score >= 70 ? '#d32f2f' : '#f57c00'}18`, color: cand.score >= 70 ? '#d32f2f' : '#f57c00', fontWeight: 800 }} label={`${cand.score}% match`} />
                </Box>
                <Typography variant="caption" sx={{ color: darkText.secondary, display: 'block', mt: 0.5 }}>{cand.reasons.join(' · ')}</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                  <Button size="small" variant="outlined" onClick={() => openProfileFromCandidate(cand)}>View record</Button>
                  <Button size="small" variant="outlined" onClick={() => openEditFromCandidate(cand)}>Add information to existing</Button>
                </Box>
              </Box>
            ))}
          </Box>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ color: darkText.secondary, mb: 1 }}>
            {isAdminUser()
              ? 'As an administrator you may still open a new record if you are certain these are different companies — a reason is recorded in the audit log.'
              : 'Only an administrator may override this. You can request a review instead — the administrator decides whether to merge or mark as separate.'}
          </Typography>
          <TextField
            label={isAdminUser() ? 'Reason for creating separately (recorded in audit log) *' : 'Why should this be looked at? (optional)'}
            value={dupReason}
            onChange={(e) => setDupReason(e.target.value)}
            fullWidth
            size="small"
            multiline
            minRows={2}
            sx={lightFieldSx}
          />
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => setDupOpen(false)}>Cancel</Button>
          {!isAdminUser() && (
            <Button variant="outlined" color="secondary" disabled={saving} onClick={() => dupCandidates[0] && requestReview(dupCandidates[0])} sx={{ flexGrow: { xs: 1, sm: 0 } }}>
              Request administrator review
            </Button>
          )}
          {isAdminUser() && (
            <Button
              variant="contained"
              color="error"
              disabled={saving || !dupReason.trim()}
              onClick={() => { setDupResolved(true); setDupOpen(false); setFieldErrors({}); save() }}
              sx={{ flexGrow: { xs: 1, sm: 0 } }}
            >
              Review &amp; create anyway
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* concurrent-edit conflict (field-level, no silent overwrite) */}
      <Dialog open={!!conflict} onClose={() => setConflict(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: '#d32f2f' }}>Another user updated this record first</DialogTitle>
        <DialogContent dividers>
          <Alert severity="error" sx={{ mb: 2 }}>
            {conflict?.message}
          </Alert>
          <Typography variant="body2" sx={{ color: darkText.secondary }}>
            <b>{conflict?.fields}</b> was changed by someone else after you opened this record, so your version is out of date.
            Nothing was overwritten. Load the latest values, then re-apply your changes.
          </Typography>
          {conflict?.latest && (
            <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block', mt: 1 }}>
              Saved just now — {new Date(conflict.latest.updatedAt).toLocaleString()} ({conflict.latest.customerId})
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => setConflict(null)}>Keep my unsaved changes</Button>
          <Button variant="contained" onClick={reloadLatest}>Load latest values</Button>
        </DialogActions>
      </Dialog>

      {/* customer profile dialog */}
      {profile && (
        <CustomerProfileDialog
          open
          customer={profile}
          onClose={() => setProfile(null)}
          onEdit={(c) => { setProfile(null); openEdit(c) }}
          onChanged={() => load()}
          allCustomers={customers}
          isAdmin={isAdminUser()}
        />
      )}

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast('')} message={toast} />
    </Box>
  )
}
