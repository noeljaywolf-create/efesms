import OpsListPage from '../components/OpsListPage'
import type { OpsListConfig } from '../components/OpsListPage'
import { EXTINGUISHER_TYPES, AGENT_TYPE_COLORS } from '../lib/extinguishers'

const pad = (n: number) => String(n).padStart(6, '0')

const RESULT_COLORS = { Pass: '#2e7d32', Fail: '#d32f2f', Pending: '#0288d1', Clear: '#2e7d32', 'Minor Defect': '#ff8f00' }
const INVOICE_COLORS = { Draft: '#6b7280', Issued: '#0288d1', Paid: '#2e7d32', Overdue: '#d32f2f', Cancelled: '#9ca3af', 'Written Off': '#6b7280' }
const INVOICE_STATUSES = ['Draft', 'Issued', 'Paid', 'Overdue', 'Cancelled']

const REFS: { key: string; label: string }[] = [
  { key: 'jobId', label: 'Job id' },
  { key: 'equipmentId', label: 'Equipment id' },
  { key: 'technicianId', label: 'Technician id' },
  { key: 'customerId', label: 'Customer id' },
  { key: 'siteId', label: 'Site id' },
]

const inspections: OpsListConfig = {
  title: 'Inspections',
  subtitle: 'site inspections & compliance checks',
  endpoint: '/operations/inspections',
  idKey: 'id',
  idPrefix: (n) => `INS-${pad(n)}`,
  columns: [
    { key: 'id', label: 'Inspection' },
    { key: 'inspectionDate', label: 'Date', format: 'date' },
    { key: 'equipmentName', label: 'Unit' },
    { key: 'result', label: 'Result', format: 'chip', colors: RESULT_COLORS },
    { key: 'findings', label: 'Findings', hideOnMobile: true },
    { key: 'nextInspectionDue', label: 'Next due', format: 'date', hideOnMobile: true },
    { key: 'cost', label: 'Cost', format: 'money' },
  ],
  fields: [
    ...REFS.map((f) => ({ ...f, type: 'number' as const })),
    { key: 'date', label: 'Inspection date', type: 'date', required: true },
    { key: 'type', label: 'Result', type: 'select', options: ['Pass', 'Fail', 'Pending', 'Clear', 'Minor Defect'] },
    { key: 'cost', label: 'Cost (R)', type: 'number' },
    { key: 'notes', label: 'Findings', type: 'text' },
  ],
  empty: 'No inspections recorded yet.',
  groupLabel: 'Record inspection',
  printGroupBy: 'result',
}

const refills: OpsListConfig = {
  title: 'Refilling',
  subtitle: 'agent refills performed',
  endpoint: '/operations/refills',
  idKey: 'id',
  idPrefix: (n) => `REF-${pad(n)}`,
  columns: [
    { key: 'id', label: 'Refill' },
    { key: 'refillDate', label: 'Date', format: 'date' },
    { key: 'equipmentName', label: 'Unit' },
    { key: 'agentType', label: 'Agent', format: 'chip', colors: AGENT_TYPE_COLORS },
    { key: 'agentAmountKg', label: 'Capacity / Amount (kg / L)', format: 'number' },
    { key: 'cost', label: 'Cost', format: 'money' },
  ],
  fields: [
    ...REFS.map((f) => ({ ...f, type: 'number' as const })),
    { key: 'date', label: 'Refill date', type: 'date', required: true },
    { key: 'agentType', label: 'Agent type', type: 'select', options: EXTINGUISHER_TYPES },
    { key: 'agentAmountKg', label: 'Capacity (kg / L)', type: 'number', placeholder: 'e.g. 9 for 9L/9kg' },
    { key: 'cost', label: 'Cost (R)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'text' },
  ],
  empty: 'No refills recorded yet.',
  groupLabel: 'Record refill',
  printGroupBy: 'agentType',
  searchPlaceholder: 'Search by customer, job, equipment, agent or notes…',
}

const maintenance: OpsListConfig = {
  title: 'Maintenance',
  subtitle: 'preventive & corrective work',
  endpoint: '/operations/maintenance',
  idKey: 'id',
  idPrefix: (n) => `MNT-${pad(n)}`,
  columns: [
    { key: 'id', label: 'Job' },
    { key: 'workDate', label: 'Date', format: 'date' },
    { key: 'equipmentName', label: 'Unit' },
    { key: 'workType', label: 'Type', format: 'chip', colors: { Repair: '#FF3D00', 'Preventive Service': '#2e7d32', Parts: '#0288d1', Clean: '#ff8f00', Calibration: '#ff8f00' } },
    { key: 'cost', label: 'Cost', format: 'money' },
    { key: 'findings', label: 'Findings', hideOnMobile: true },
  ],
  fields: [
    ...REFS.map((f) => ({ ...f, type: 'number' as const })),
    { key: 'date', label: 'Work date', type: 'date', required: true },
    { key: 'type', label: 'Work type', type: 'select', options: ['Repair', 'Preventive Service', 'Parts', 'Clean', 'Calibration'] },
    { key: 'cost', label: 'Cost (R)', type: 'number' },
    { key: 'notes', label: 'Findings', type: 'text' },
  ],
  empty: 'No maintenance records yet.',
  groupLabel: 'Record maintenance',
  printGroupBy: 'workType',
}

const certifications: OpsListConfig = {
  title: 'Certificates',
  subtitle: 'technician certifications & expiry',
  endpoint: '/operations/certifications',
  idKey: 'id',
  idPrefix: (n) => `CERT-${pad(n)}`,
  columns: [
    { key: 'id', label: 'Certificate' },
    { key: 'technicianName', label: 'Technician' },
    { key: 'name', label: 'Name' },
    { key: 'expiryDate', label: 'Expiry', format: 'date' },
  ],
  fields: [
    { key: 'technicianId', label: 'Technician id', type: 'number', required: true },
    { key: 'name', label: 'Certificate name', type: 'text', required: true },
    { key: 'expiryDate', label: 'Expiry date', type: 'date', required: true },
  ],
  empty: 'No certifications recorded yet.',
  groupLabel: 'Add certificate',
  printGroupBy: 'technicianName',
}

const invoices: OpsListConfig = {
  title: 'Invoicing',
  subtitle: 'operations invoices',
  endpoint: '/operations/invoices',
  idKey: 'id',
  idPrefix: (n) => `INV-${pad(n)}`,
  columns: [
    { key: 'id', label: 'Invoice' },
    { key: 'invoiceNumber', label: 'Reference' },
    { key: 'customerNumber', label: 'Customer ID', hideOnMobile: true },
    { key: 'customerName', label: 'Customer' },
    { key: 'amount', label: 'Amount', format: 'money' },
    { key: 'issueDate', label: 'Issued', format: 'date', hideOnMobile: true },
    { key: 'status', label: 'Status', format: 'chip', colors: INVOICE_COLORS },
  ],
  fields: [
    { key: 'customerId', label: 'Customer id', type: 'number', required: true },
    { key: 'amount', label: 'Amount (R)', type: 'number', required: true },
    { key: 'issueDate', label: 'Issue date', type: 'date', required: true },
    { key: 'dueDate', label: 'Due date', type: 'date' },
    { key: 'paidDate', label: 'Paid date', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: INVOICE_STATUSES },
  ],
  empty: 'No invoices yet.',
  groupLabel: 'Add invoice',
  printGroupBy: 'status',
}

const technicians: OpsListConfig = {
  title: 'Technicians',
  subtitle: 'crew & scheduling capacity',
  endpoint: '/operations/technicians',
  idKey: 'id',
  idPrefix: (n) => `TECH-${pad(n)}`,
  columns: [
    { key: 'id', label: 'Technician' },
    { key: 'name', label: 'Name' },
    { key: 'trade', label: 'Trade', format: 'chip', colors: { Technician: '#FF3D00', Electrician: '#ff8f00', Rigger: '#0288d1', 'Fire Fighter': '#2e7d32' } },
    { key: 'phone', label: 'Phone' },
    { key: 'available', label: 'Available', format: 'bool' },
    { key: 'maxConcurrentJobs', label: 'Max jobs', format: 'number', hideOnMobile: true },
    { key: 'hourlyRate', label: 'Rate', format: 'money', hideOnMobile: true },
    { key: 'certifications', label: 'Certifications', hideOnMobile: true },
  ],
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'trade', label: 'Trade', type: 'select', options: ['Technician', 'Electrician', 'Rigger', 'Fire Fighter'] },
    { key: 'vehicle', label: 'Vehicle', type: 'text' },
    { key: 'maxConcurrentJobs', label: 'Max concurrent jobs', type: 'number' },
    { key: 'available', label: 'Available', type: 'bool' },
    { key: 'hourlyRate', label: 'Hourly rate (R)', type: 'number' },
    { key: 'skills', label: 'Skills', type: 'text', required: true },
    { key: 'certifications', label: 'Certifications', type: 'text', required: true },
  ],
  empty: 'No technicians registered.',
  groupLabel: 'Add technician',
  printGroupBy: 'trade',
}

export const InspectionsPage = () => <OpsListPage config={inspections} />
export const RefillsPage = () => <OpsListPage config={refills} />
export const MaintenancePage = () => <OpsListPage config={maintenance} />
export const CertificatesPage = () => <OpsListPage config={certifications} />
export const InvoicesPage = () => <OpsListPage config={invoices} />
export const TechniciansPage = () => <OpsListPage config={technicians} />
