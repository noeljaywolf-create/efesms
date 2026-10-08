// FireOpsAI engine output types — mirror C# Contracts/EngineContracts.cs (camelCase JSON).

export interface MLReport {
  riskModelTrained: boolean
  riskTrainingSamples: number
  riskTrainRMSE: number
  scheduleAlgorithm: string
  forecastAlgorithm: string
  clusteringAlgorithm: string
}

export interface ScheduledAssignment {
  jobId: number
  technicianId: number
  technicianName: string
  score: number
  estHours: number
  proposedStart: string | null
  proposedEnd: string | null
  skillMatch: number
  workloadBalance: number
  proximityScore: number
  certificationScore: number
  qualificationsScore: number
  reasons: string[]
  routeOrder: number
}

export interface RouteStop {
  sequence: number
  jobId: number
  jobTitle: string
  jobType: string
  siteId: number | null
  arrivalOffsetHours: number
  workHours: number
  travelKmFromPrev: number
  travelHoursFromPrev: number
  proposedStart: string | null
  proposedEnd: string | null
}

export interface RoutePlan {
  technicianId: number
  technicianName: string
  day: string
  totalTravelKm: number
  totalTravelHours: number
  totalWorkHours: number
  departureKms: number
  stops: RouteStop[]
}

export interface PredictiveAssessment {
  equipmentId: number
  equipmentNumber: string
  name: string
  conditionRating: number
  riskScore: number
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  recommendedAction: string
  remainingUsefulLifeMonths: number
  daysOverdueService: number
  failureEvidenceScore: number
  contributingFactors: string[]
  explanation: string
}

export interface Anomaly {
  type: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  description: string
  entityId: number | null
  entityType: string
  detectedValue: number
  recommendedAction?: string
  confidence: number
}

export interface ClusteredIncident {
  incidentId: string
  title: string
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  entityType: string | null
  entityId: number | null
  anomalyCount: number
  members: Anomaly[]
  recommendedAction: string
}

export interface ForecastResult {
  itemName: string
  forecastNextMonth: number
  trend: number
  suggestedReorderPoint: number
  safetyStock: number
}

export interface ReorderSuggestion {
  itemId: number
  itemName: string
  currentStock: number
  suggestedOrderQty: number
  daysRemaining: number
  urgency: 'Normal' | 'High' | 'Urgent'
  reason: string
}

export interface SiteRisk {
  siteId: number
  siteName: string
  riskScore: number
  severity: 'Low' | 'Medium' | 'High' | 'Critical'
  equipmentAtRisk: number
  overdueInspections: number
  recommendedAction: string
}

export interface SmartReminder {
  category: string
  severity: 'Info' | 'Medium' | 'High' | 'Critical'
  daysUntilDue: number
  recipient: string
  message: string
  dueDate: string
  entityId: number | null
}

export interface RiskCohort {
  label: 'High' | 'Medium' | 'Low'
  clusterCount: number
  meanRisk: number
  members: PredictiveAssessment[]
}

export interface EngineOutput {
  generatedAt: string
  engineVersion: string
  overallConfidence: number
  ml: MLReport
  assignments: ScheduledAssignment[]
  routes: RoutePlan[]
  riskAssessments: PredictiveAssessment[]
  riskClusters: RiskCohort[]
  anomalies: Anomaly[]
  incidents: ClusteredIncident[]
  forecasts: ForecastResult[]
  reorders: ReorderSuggestion[]
  siteRisks: SiteRisk[]
  reminders: SmartReminder[]
  summary?: string
}

/** Operations module API records. */
export interface Technician {
  id: number
  name: string
  email?: string | null
  phone?: string | null
  trade: string
  vehicle?: string | null
  maxConcurrentJobs: number
  available: boolean
  skills: string
  certifications: string
  certificationExpiry?: string | null
  hourlyRate: number
}

 export interface OperationJob {
   id: number
   jobNumber: string
   customerId?: number | null
   customerNumber?: string | null
   customerName?: string | null
   customerPhone?: string | null
   customerWhatsApp?: string | null
   customerEmail?: string | null
   address?: string | null
   email?: string | null
   nextServiceDate?: string | null
   worksDoneSatisfactorily?: boolean
   siteId?: number | null
   equipmentId?: number | null
   agentType?: string | null
   agentAmountKg?: number | null
   unitCount?: number
   jobType: string
   title: string
   description?: string | null
   status: string
   priority: string
    technicianId?: number | null
    technicianName?: string | null
    assignedTechnicianId?: number | null
    assignedTechnicianName?: string | null
    equipmentNumber?: string | null
    equipmentName?: string | null
    siteName?: string | null
    sourceQuotationId?: number | null
    sourceQuotationNumber?: string | null
    dateEnded?: string | null
    plannedStart?: string | null
    plannedEnd?: string | null
    completedAt?: string | null
   estimatedHours?: number | null
   requiredSkills: string
   requiredCertifications: string
   quotedAmount?: number | null
   notes?: string | null
   createdAt: string
   tasks?: JobTask[]
 }

export interface JobTask {
  id: number
  jobCardId: number
  taskType: string
  equipmentIds?: string | null
  inventoryItemId?: number | null
  storeItemId?: number | null
  storeItemName?: string | null
  quantity: number
  agentType?: string | null
  unitType?: string | null
  agentAmountKg?: number | null
  unitPrice?: number | null
  isCompleted: boolean
  notes?: string | null
  sortOrder: number
  equipmentIdList?: number[]
  lineValue?: number | null
}

export const JOB_TASK_TYPES = ['Inspection', 'Assessment', 'Service', 'Refill', 'Maintenance', 'Installation', 'Supply', 'Store supply'] as const

export interface OperationEquipment {
  id: number
  equipmentNumber: string
  customerId?: number | null
  customerNumber?: string | null
  customerName?: string | null
  siteId?: number | null
  siteName?: string | null
  name: string
  category: string
  model: string
  make: string
  serialNumber?: string | null
  agentType?: string | null
  manufactureDate?: string | null
  installationDate?: string | null
  lastInspectionDate?: string | null
  lastServiceDate?: string | null
  nextServiceDue?: string | null
  conditionRating: number
  lifeSpanMonths: number
  serviceIntervalMonths: number
  status: string
  createdAt: string
}

export interface InventoryRow {
  id: number
  name: string
  category: string
  currentStock: number
  reorderLevel: number
  unitCost: number
  unit?: string | null
  leadTimeDays: number
  monthlyUsage: string
  customerName?: string | null
  lastReceivedQty?: number | null
  lastReceivedDate?: string | null
}

export interface OpsSummary {
  openJobs: number
  highPriorityOpen: number
  technicians: number
  equipment: number
  inventoryLow: number
  overdueInvoices: number
}

// Shared semantic palette: reserve strong colors for focused risk cues, not page backgrounds.
export const DANGER_COLORS = {
  critical: '#C62828',
  high: '#E65100',
  medium: '#9A6700',
  safe: '#2E7D32',
  info: '#1565C0',
  neutral: '#64748B',
} as const

export const SEVERITY_COLORS: Record<string, string> = {
  Critical: DANGER_COLORS.critical,
  High: DANGER_COLORS.high,
  Medium: DANGER_COLORS.medium,
  Low: DANGER_COLORS.safe,
  Info: DANGER_COLORS.info,
}

export const PRIORITY_COLORS: Record<string, string> = {
  Urgent: DANGER_COLORS.critical,
  High: DANGER_COLORS.high,
  Normal: DANGER_COLORS.info,
  Low: DANGER_COLORS.neutral,
}

export const JOBSTATUS_COLORS: Record<string, string> = {
  Draft: DANGER_COLORS.neutral,
  Assigned: DANGER_COLORS.info,
  Scheduled: '#7b1fa2',
  InProgress: DANGER_COLORS.medium,
  Completed: DANGER_COLORS.safe,
  Closed: '#374151',
  Cancelled: DANGER_COLORS.critical,
}
