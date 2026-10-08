// FireOpsAI - TypeScript types matching the .NET engine output.
// Copy into your React project, e.g. src/types/fireops.ts
// Map your C# API response JSON onto these.

export interface ScheduledAssignment {
  jobId: number;
  technicianId: number;
  technicianName: string;
  score: number;
  estHours: number;
  proposedStart: string | null;
  proposedEnd: string | null;
  skillMatch: number;
  workloadBalance: number;
  proximityScore: number;
  certificationScore: number;
  qualificationsScore: number;
  reasons: string[];
  routeOrder: number;
}

export interface RouteStop {
  sequence: number;
  jobId: number;
  jobTitle: string;
  jobType: string;
  siteId: number | null;
  arrivalOffsetHours: number;
  workHours: number;
  travelKmFromPrev: number;
  travelHoursFromPrev: number;
  proposedStart: string | null;
  proposedEnd: string | null;
}

export interface RoutePlan {
  technicianId: number;
  technicianName: string;
  day: string;
  totalTravelKm: number;
  totalTravelHours: number;
  totalWorkHours: number;
  stops: RouteStop[];
}

export interface PredictiveAssessment {
  equipmentId: number;
  equipmentNumber: string;
  name: string;
  conditionRating: number;
  riskScore: number;          // 0..100
  severity: "Low" | "Medium" | "High" | "Critical";
  recommendedAction: string;
  remainingUsefulLifeMonths: number;
  daysOverdueService: number;
  failureEvidenceScore: number; // 0..100 from observed failures
  contributingFactors: string[];
  explanation: string;
}

export interface Anomaly {
  type: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  description: string;
  entityId: number | null;
  entityType: string;
  detectedValue: number;
  recommendedAction?: string;
  confidence: number;
}

export interface ClusteredIncident {
  incidentId: string;
  title: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  entityType: string | null;
  entityId: number | null;
  anomalyCount: number;
  members: Anomaly[];
  recommendedAction: string;
}

export interface ForecastResult {
  itemName: string;
  forecastNextMonth: number;
  trend: number;
  suggestedReorderPoint: number;
  safetyStock: number;
}

export interface ReorderSuggestion {
  itemId: number;
  itemName: string;
  currentStock: number;
  suggestedOrderQty: number;
  daysRemaining: number;
  urgency: "Normal" | "High" | "Urgent";
  reason: string;
}

export interface SiteRisk {
  siteId: number;
  siteName: string;
  riskScore: number;
  severity: "Low" | "Medium" | "High" | "Critical";
  equipmentAtRisk: number;
  overdueInspections: number;
  recommendedAction: string;
}

export interface SmartReminder {
  category: string;
  severity: "Info" | "Medium" | "High" | "Critical";
  daysUntilDue: number;
  recipient: string;
  message: string;
  dueDate: string;
  entityId: number | null;
}

export interface MLReport {
  riskModelTrained: boolean;
  riskTrainingSamples: number;
  riskTrainRMSE: number;
  scheduleAlgorithm: string;   // "GeneticScheduler" | "AIScheduler"
  forecastAlgorithm: string;   // "HoltWinters" | "EMA+Seasonality" | "Simple"
  clusteringAlgorithm: string; // "KMeans"
}

export interface RiskCohort {
  label: "High" | "Medium" | "Low";
  clusterCount: number;
  meanRisk: number;
  members: PredictiveAssessment[];
}

export interface EngineOutput {
  generatedAt: string;
  engineVersion: string;
  overallConfidence: number;
  assignments: ScheduledAssignment[];
  routes: RoutePlan[];
  riskAssessments: PredictiveAssessment[];
  anomalies: Anomaly[];
  incidents: ClusteredIncident[];
  forecasts: ForecastResult[];
  reorders: ReorderSuggestion[];
  siteRisks: SiteRisk[];
  reminders: SmartReminder[];
  ml: MLReport;
  riskClusters: RiskCohort[];
}