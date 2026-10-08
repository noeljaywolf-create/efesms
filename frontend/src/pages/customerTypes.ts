export type Contact = {
  id?: number
  name: string
  role?: string | null
  phone: string
  email?: string | null
  isPrimary: boolean
}

export type Site = {
  id?: number
  name: string
  siteType: string
  address?: string | null
  city?: string | null
  contactPerson?: string | null
  phone?: string | null
  email?: string | null
  isPrimary: boolean
  notes?: string | null
}

export type Service = {
  id: number
  serviceDate: string
  status: string
  unitsServiced: number
  stickersUsed: number
  materialsUsed?: string | null
  equipmentServiced: number
  equipmentReplaced: number
  equipmentAdded: number
  equipmentRemoved: number
  defectsFound?: string | null
  recommendations?: string | null
  reportSentDate?: string | null
  certificateNo?: string | null
  technician?: string | null
  siteId?: number | null
  notes?: string | null
}

export type Comm = {
  id: number
  channel: string
  direction: string
  subject?: string | null
  message?: string | null
  sentAt: string
  customerResponded: boolean
  responseNotes?: string | null
  followUpDate?: string | null
  contactName?: string | null
  createdBy?: string | null
}

export type Doc = {
  id: number
  name: string
  docType: string
  filePath?: string | null
  sizeBytes?: number | null
  notes?: string | null
  uploadedAt: string
  uploadedBy?: string | null
}

export type Activity = {
  id: number
  action: string
  details?: string | null
  actor?: string | null
  createdAt: string
}

export type CompletionSection = { key: string; label: string; done: boolean; owner: string }
export type Completion = { percent: number; sections: CompletionSection[] }

export type FieldAuditOut = {
  id: number
  field: string
  before?: string | null
  after?: string | null
  userName: string
  role: string
  department: string
  createdAt: string
  reason?: string | null
}

export type Customer = {
  id: number
  customerId: string
  name: string
  alternativeName?: string | null
  legalName?: string | null
  customerType: string
  vatNumber?: string | null
  tinNumber?: string | null
  registrationNumber?: string | null
  phone: string
  whatsapp?: string | null
  email?: string | null
  website?: string | null
  status: string
  priority: string
  category?: string | null
  accountManager?: string | null
  customerSince?: string | null
  serviceFrequencyMonths?: number | null
  lastServiceDate?: string | null
  nextServiceDate?: string | null
  preferredContact: string
  specialRequirements?: string | null
  billingAddress?: string | null
  paymentTerms?: string | null
  creditInfo?: string | null
  contractRef?: string | null
  contractStartDate?: string | null
  contractEndDate?: string | null
  contractValue?: number | null
  contractStatus?: string | null
  notes?: string | null
  serviceStatus: 'None' | 'UpToDate' | 'DueSoon' | 'Due' | 'Overdue'
  mergedIntoCustomerId?: string | null
  mergedAt?: string | null
  completion?: Completion | null
  createdAt: string
  updatedAt: string
  contacts: Contact[]
}

export type DuplicateCandidate = {
  id: number
  customerId: string
  name: string
  score: number
  reasons: string[]
}

export type Profile = {
  customer: Customer
  sites: Site[]
  notesList: { id: number; content: string; createdBy?: string | null; pinned: boolean; createdAt: string }[]
  services: Service[]
  communications: Comm[]
  documents: Doc[]
  fieldAudits: FieldAuditOut[]
  activities: Activity[]
}

export const CUSTOMER_TYPES = ['Commercial', 'Industrial', 'Institutional', 'Residential', 'Government']
export const STATUSES = ['Prospect', 'Active', 'Inactive', 'Blacklisted']
export const PRIORITIES = ['Low', 'Normal', 'High', 'Critical']
export const SITE_TYPES = ['HeadOffice', 'Warehouse', 'Factory', 'Branch', 'Other']
export const PREFERRED_CONTACTS = ['Email', 'Phone', 'WhatsApp', 'SMS']
export const SERVICE_STATUSES = ['Scheduled', 'Completed', 'InProgress', 'Cancelled']
export const COMM_CHANNELS = ['WhatsApp', 'Email', 'SMS', 'PhoneCall', 'Reminder']
export const DOC_TYPES = ['ServiceReport', 'Certificate', 'Quotation', 'Invoice', 'Contract', 'Photo', 'InspectionReport', 'Other']
export const FREQUENCIES = [3, 6, 12, 24]

export const STATUS_COLORS: Record<string, string> = {
  Prospect: '#ff8f00',
  Active: '#2e7d32',
  Inactive: '#6b7280',
  Blacklisted: '#d32f2f',
}

export const SERVICE_COLORS = {
  None: { label: 'Not scheduled', color: '#6b7280' },
  UpToDate: { label: 'Up to date', color: '#2e7d32' },
  DueSoon: { label: 'Due soon', color: '#ff8f00' },
  Due: { label: 'Due', color: '#f57c00' },
  Overdue: { label: 'Overdue', color: '#d32f2f' },
} as const

export const PRIORITY_COLORS: Record<string, string> = {
  Low: '#6b7280',
  Normal: '#0288d1',
  High: '#ff8f00',
  Critical: '#d32f2f',
}