namespace FireOpsAI.Contracts;

/// <summary>
/// Everything the engine needs to run a full analysis.
/// Map your own EF Core / repository entities into these collections.
/// </summary>
public class EngineInput
{
    public IReadOnlyList<Models.Technician> Technicians { get; set; } = Array.Empty<Models.Technician>();
    public IReadOnlyList<Models.JobCard> Jobs { get; set; } = Array.Empty<Models.JobCard>();
    public IReadOnlyList<Models.Equipment> Equipment { get; set; } = Array.Empty<Models.Equipment>();
    public IReadOnlyList<Models.Site> Sites { get; set; } = Array.Empty<Models.Site>();
    public IReadOnlyList<Models.InventoryItem> Inventory { get; set; } = Array.Empty<Models.InventoryItem>();
    public IReadOnlyList<Models.Inspection> Inspections { get; set; } = Array.Empty<Models.Inspection>();
    public IReadOnlyList<Models.Service> Services { get; set; } = Array.Empty<Models.Service>();
    public IReadOnlyList<Models.Refill> Refills { get; set; } = Array.Empty<Models.Refill>();
    public IReadOnlyList<Models.Maintenance> Maintenance { get; set; } = Array.Empty<Models.Maintenance>();
    public IReadOnlyList<Models.Certification> Certifications { get; set; } = Array.Empty<Models.Certification>();
    public IReadOnlyList<Models.Invoice> Invoices { get; set; } = Array.Empty<Models.Invoice>();
    /// <summary>Notification controls from Settings. Null = all enabled, 14-day lead.</summary>
    public ReminderOptions ReminderOptions { get; set; } = new();
}

/// <summary>Reminder categories and lead time; global mute controls delivery, not analysis.</summary>
public class ReminderOptions
{
    public bool Enabled { get; set; } = true;
    public int LeadDays { get; set; } = 14;
    public bool NotifyService { get; set; } = true;
    public bool NotifyInspection { get; set; } = true;
    public bool NotifyCertification { get; set; } = true;
    public bool NotifyInventory { get; set; } = true;
    public bool NotifyInvoice { get; set; } = true;
}

/// <summary>Result of a full AI analysis pass.</summary>
public class EngineOutput
{
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    public string EngineVersion { get; set; } = "FireOpsAI 3.0";
    public double OverallConfidence { get; set; } = 0.85;
    public MLReport ML { get; set; } = new();

    public List<ScheduledAssignment> Assignments { get; set; } = new();
    public List<RoutePlan> Routes { get; set; } = new();
    public List<PredictiveAssessment> RiskAssessments { get; set; } = new();
    public List<RiskCohort> RiskClusters { get; set; } = new();
    public List<Anomaly> Anomalies { get; set; } = new();
    public List<ClusteredIncident> Incidents { get; set; } = new();
    public List<ForecastResult> Forecasts { get; set; } = new();
    public List<ReorderSuggestion> Reorders { get; set; } = new();
    public List<SiteRisk> SiteRisks { get; set; } = new();
    public List<SmartReminder> Reminders { get; set; } = new();

    public string Summary()
    {
        int critical = RiskAssessments.Count(r => r.Severity == "Critical");
        int criticalAnom = Anomalies.Count(a => a.Severity == "Critical");
        return $"{EngineVersion} | jobs scheduled: {Assignments.Count} | routes: {Routes.Count} | equipment at risk: {RiskAssessments.Count(r => r.RiskScore >= 70)} (critical: {critical}) | " +
               $"anomalies: {Anomalies.Count} (critical: {criticalAnom}) | incidents: {Incidents.Count} | reorders: {Reorders.Count} | reminders: {Reminders.Count} | ML: {(ML.RiskModelTrained ? "boosted" : "heuristic")}";
    }
}

/// <summary>Machine-learning model report for transparency.</summary>
public class MLReport
{
    public bool RiskModelTrained { get; set; }
    public int RiskTrainingSamples { get; set; }
    public double RiskTrainRMSE { get; set; }
    public string ScheduleAlgorithm { get; set; } = "AIScheduler";
    public string ForecastAlgorithm { get; set; } = "EMA+Seasonality";
    public string ClusteringAlgorithm { get; set; } = "KMeans";
}

/// <summary>Equipment grouped into risk cohorts via unsupervised clustering.</summary>
public class RiskCohort
{
    public string Label { get; set; } = "";   // e.g. "High", "Medium", "Low"
    public int ClusterCount { get; set; }
    public double MeanRisk { get; set; }
    public List<PredictiveAssessment> Members { get; set; } = new();
}

public class ScheduledAssignment
{
    public int JobId { get; set; }
    public int TechnicianId { get; set; }
    public string TechnicianName { get; set; } = "";
    public double Score { get; set; }
    public double EstHours { get; set; }
    public DateTime? ProposedStart { get; set; }
    public DateTime? ProposedEnd { get; set; }
    public double SkillMatch { get; set; }
    public double WorkloadBalance { get; set; }
    public double ProximityScore { get; set; }
    public double CertificationScore { get; set; }
    public double QualificationsScore { get; set; }
    public List<string> Reasons { get; set; } = new();
    public int RouteOrder { get; set; } = 0;
}

/// <summary>Travel-optimized daily a route for one technician.</summary>
public class RoutePlan
{
    public int TechnicianId { get; set; }
    public string TechnicianName { get; set; } = "";
    public DateTime Day { get; set; }
    public double TotalTravelKm { get; set; }
    public double TotalTravelHours { get; set; }
    public double TotalWorkHours { get; set; }
    public double DepartureKms { get; set; }
    public List<RouteStop> Stops { get; set; } = new();
}

public class RouteStop
{
    public int Sequence { get; set; }
    public int JobId { get; set; }
    public string JobTitle { get; set; } = "";
    public string JobType { get; set; } = "";
    public int? SiteId { get; set; }
    public double ArrivalOffsetHours { get; set; }
    public double WorkHours { get; set; }
    public double TravelKmFromPrev { get; set; }
    public double TravelHoursFromPrev { get; set; }
    public DateTime? ProposedStart { get; set; }
    public DateTime? ProposedEnd { get; set; }
}

/// <summary>A grouped set of related anomalies treated as one response.</summary>
public class ClusteredIncident
{
    public string IncidentId { get; set; } = "";
    public string Title { get; set; } = "";
    public string Severity { get; set; } = "Low";
    public string? EntityType { get; set; }
    public int? EntityId { get; set; }
    public int AnomalyCount { get; set; }
    public List<Anomaly> Members { get; set; } = new();
    public string RecommendedAction { get; set; } = "";
}

public class PredictiveAssessment
{
    public int EquipmentId { get; set; }
    public string EquipmentNumber { get; set; } = "";
    public string Name { get; set; } = "";
    public int ConditionRating { get; set; }
    public double RiskScore { get; set; }       // 0..100
    public string Severity { get; set; } = "Low"; // Low | Medium | High | Critical
    public string RecommendedAction { get; set; } = "";
    public int RemainingUsefulLifeMonths { get; set; }
    public int DaysOverdueService { get; set; }
    public double FailureEvidenceScore { get; set; } = 0; // 0..100 from observed failures
    public List<string> ContributingFactors { get; set; } = new();
    public string Explanation { get; set; } = "";
}

public class Anomaly
{
    public string Type { get; set; } = "";
    public string Severity { get; set; } = "Low";
    public string Description { get; set; } = "";
    public int? EntityId { get; set; }
    public string EntityType { get; set; } = "";
    public decimal DetectedValue { get; set; }
    public string? RecommendedAction { get; set; }
    public double Confidence { get; set; }
}

public class ForecastResult
{
    public string ItemName { get; set; } = "";
    public double ForecastNextMonth { get; set; }
    public double Trend { get; set; }          // + unit/month drift
    public double SuggestedReorderPoint { get; set; }
    public double SafetyStock { get; set; }
}

public class ReorderSuggestion
{
    public int ItemId { get; set; }
    public string ItemName { get; set; } = "";
    public int CurrentStock { get; set; }
    public int SuggestedOrderQty { get; set; }
    public double DaysRemaining { get; set; }
    public string Urgency { get; set; } = "Normal";
    public string Reason { get; set; } = "";
}

public class SiteRisk
{
    public int SiteId { get; set; }
    public string SiteName { get; set; } = "";
    public double RiskScore { get; set; }
    public string Severity { get; set; } = "Low";
    public int EquipmentAtRisk { get; set; }
    public int OverdueInspections { get; set; }
    public string RecommendedAction { get; set; } = "";
}

public class SmartReminder
{
    public string Category { get; set; } = "";
    public string Severity { get; set; } = "Info";
    public int DaysUntilDue { get; set; }
    public string Recipient { get; set; } = "";
    public string Message { get; set; } = "";
    public DateTime DueDate { get; set; }
    public int? EntityId { get; set; }
}
