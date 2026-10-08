using FireOpsAI;
using FireOpsAI.Contracts;
using FireOpsAI.Models;

// =====================================================================
//  FireOpsAI integration example
//
//  Map your EF Core / repository entities into the EngineInput POCOs,
//  call Analyze(), and consume the results. Run with: dotnet run
// =====================================================================

var input = new EngineInput
{
    Technicians = SampleData.Technicians(),
    Jobs = SampleData.Jobs(),
    Equipment = SampleData.Equipment(),
    Sites = SampleData.Sites(),
    Inventory = SampleData.Inventory(),
    Inspections = SampleData.Inspections(),
    Services = SampleData.Services(),
    Refills = SampleData.Refills(),
    Maintenance = SampleData.Maintenance(),
    Certifications = SampleData.Certifications(),
    Invoices = SampleData.Invoices()
};

var engine = new AIOperationsEngine();
var output = engine.Analyze(input);

Console.WriteLine("=== FireOpsAI Engine Output ===");
Console.WriteLine(output.Summary());
Console.WriteLine($"  ML status: risk model {(output.ML.RiskModelTrained ? "trained (GBM)" : "heuristic (insufficient data)")} | scheduling: {output.ML.ScheduleAlgorithm} | forecasting: {output.ML.ForecastAlgorithm} | clustering: {output.ML.ClusteringAlgorithm}");

Console.WriteLine("\n--- Risk Cohorts (k-means clustering) ---");
foreach (var c in output.RiskClusters)
{
    Console.WriteLine($"  [{c.Label}] {c.ClusterCount} unit(s), mean risk {c.MeanRisk}:");
    foreach (var m in c.Members.Take(3))
        Console.WriteLine($"      {m.Name} [{m.EquipmentNumber}] risk {m.RiskScore} -> {m.RecommendedAction}");
}

Console.WriteLine("--- Smart Schedule (top 5) ---");
foreach (var a in output.Assignments.Take(5))
{
    Console.WriteLine($"  Job {a.JobId} -> {a.TechnicianName} (score {a.Score}, {a.EstHours}h, {a.ProposedStart:yyyy-MM-dd})");
    Console.WriteLine($"      reasons: {string.Join("; ", a.Reasons)}");
}

Console.WriteLine("\n--- Travel-Optimized Routes ---");
foreach (var r in output.Routes)
{
    Console.WriteLine($"  {r.TechnicianName} on {r.Day:yyyy-MM-dd}: {r.TotalWorkHours}h work, {r.TotalTravelKm}km travel ({r.TotalTravelHours}h)");
    foreach (var stop in r.Stops)
        Console.WriteLine($"      {stop.Sequence}. Job {stop.JobId} ({stop.JobType}) at site {stop.SiteId} | {stop.ArrivalOffsetHours}h | {stop.WorkHours}h on-site | +{stop.TravelKmFromPrev}km");
}

Console.WriteLine("\n--- Predictive Maintenance (top 5 risk) ---");
foreach (var r in output.RiskAssessments.Take(5))
{
    Console.WriteLine($"  {r.Name} [{r.EquipmentNumber}] risk {r.RiskScore}/100 ({r.Severity}) RUL {r.RemainingUsefulLifeMonths}mo -> {r.RecommendedAction}");
}

Console.WriteLine("\n--- Anomalies ---");
foreach (var a in output.Anomalies.Take(10))
{
    Console.WriteLine($"  [{a.Severity}] {a.Description}");
}

Console.WriteLine("\n--- Incidents (grouped alerts) ---");
foreach (var i in output.Incidents.Take(10))
{
    Console.WriteLine($"  {i.IncidentId} [{i.Severity}] {i.Title} ({i.AnomalyCount} alert(s)) -> {i.RecommendedAction}");
}

Console.WriteLine("\n--- Reorder Suggestions ---");
foreach (var r in output.Reorders)
{
    Console.WriteLine($"  {r.ItemName}: stock {r.CurrentStock}, order {r.SuggestedOrderQty} ({r.Urgency}) - {r.Reason}");
}

Console.WriteLine("\n--- Site Risk ---");
foreach (var s in output.SiteRisks)
{
    Console.WriteLine($"  {s.SiteName}: {s.RiskScore}/100 ({s.Severity}), at-risk equipment {s.EquipmentAtRisk} -> {s.RecommendedAction}");
}

Console.WriteLine("\n--- Reminders (top 10) ---");
foreach (var m in output.Reminders.Take(10))
{
    Console.WriteLine($"  [{m.Severity}] {m.Category}: {m.Message}");
}

static class SampleData
{
    public static List<Technician> Technicians() => new()
    {
        new Technician { Id = 1, Name = "John Moyo", Trade = "Fire Technician", Available = true, MaxConcurrentJobs = 5,
            Skills = new[] { "inspection", "service", "refill", "maintenance", "installation", "extinguisher", "sprinkler" },
            Certifications = new[] { "SAQCC Extinguisher", "SAQCC Installation" }, HourlyRate = 250,
            Latitude = -26.20, Longitude = 28.05 },
        new Technician { Id = 2, Name = "David Ndou", Trade = "Fire Technician", Available = true, MaxConcurrentJobs = 4,
            Skills = new[] { "inspection", "service", "refill", "extinguisher", "hose reel" },
            Certifications = new[] { "SAQCC Extinguisher" }, HourlyRate = 220,
            Latitude = -26.23, Longitude = 28.17 },
        new Technician { Id = 3, Name = "Blessing Moyo", Trade = "Senior Fire Technician", Available = true, MaxConcurrentJobs = 5,
            Skills = new[] { "inspection", "service", "refill", "maintenance", "installation", "sprinkler", "hydrant", "alarm" },
            Certifications = new[] { "SAQCC Extinguisher", "SAQCC Installation", "SAQCC Sprinkler" }, HourlyRate = 300,
            Latitude = -33.92, Longitude = 18.42 }
    };

    public static List<JobCard> Jobs() => new()
    {
        new JobCard { Id = 1, Number = "JC-2026-0001", Title = "Monthly inspection - Alpha Main Plant", JobType = "Inspection",
            SiteId = 1, CustomerId = 1, Status = JobStatus.Assigned, Priority = Priority.Normal,
            PlannedStart = DateTime.Today.AddDays(1), EstimatedHours = 1.5,
            RequiredSkills = new[] { "inspection", "extinguisher" }, RequiredCertifications = new[] { "SAQCC Extinguisher" },
            Latitude = -26.20, Longitude = 28.05 },
        new JobCard { Id = 2, Number = "JC-2026-0002", Title = "Refill extinguishers - MediCare Hospital", JobType = "Refill",
            SiteId = 2, CustomerId = 2, Status = JobStatus.Assigned, Priority = Priority.High,
            PlannedStart = DateTime.Today.AddDays(1), EstimatedHours = 1.0,
            RequiredSkills = new[] { "refill", "extinguisher" }, RequiredCertifications = new[] { "SAQCC Extinguisher" },
            Latitude = -33.92, Longitude = 18.42 },
        new JobCard { Id = 3, Number = "JC-2026-0003", Title = "Service sprinkler system - TechnoPark", JobType = "Service",
            SiteId = 4, CustomerId = 4, Status = JobStatus.Draft, Priority = Priority.Urgent,
            PlannedStart = DateTime.Today.AddDays(1), EstimatedHours = 2.0,
            RequiredSkills = new[] { "service", "sprinkler" }, RequiredCertifications = new[] { "SAQCC Sprinkler" },
            Latitude = -25.75, Longitude = 28.23 },
        new JobCard { Id = 4, Number = "JC-2026-0004", Title = "Maintenance fire hydrant - Highveld Mining", JobType = "Maintenance",
            SiteId = 5, CustomerId = 5, Status = JobStatus.Scheduled, Priority = Priority.High,
            PlannedStart = DateTime.Today.AddDays(2), EstimatedHours = 4.0,
            RequiredSkills = new[] { "maintenance", "hydrant" }, RequiredCertifications = new[] { "SAQCC Installation" },
            Latitude = -25.86, Longitude = 29.20 },
        new JobCard { Id = 5, Number = "JC-2026-0005", Title = "Inspection - GreenGrocer Mall", JobType = "Inspection",
            SiteId = 3, CustomerId = 3, Status = JobStatus.Draft, Priority = Priority.High,
            PlannedStart = DateTime.Today.AddDays(3), EstimatedHours = 1.5,
            RequiredSkills = new[] { "inspection", "extinguisher" }, RequiredCertifications = new[] { "SAQCC Extinguisher" },
            Latitude = -29.86, Longitude = 31.02 }
    };

    public static List<Equipment> Equipment() => new()
    {
        new Equipment { Id = 1, EquipmentNumber = "EQP-2026-0001", Name = "ABC Fire Extinguisher 9kg", Category = "Extinguisher",
            Model = "ABC-9", Make = "Chubb", InstallationDate = DateTime.Today.AddYears(-5),
            LastInspectionDate = DateTime.Today.AddDays(-380), LastServiceDate = DateTime.Today.AddDays(-420),
            NextServiceDue = DateTime.Today.AddDays(120), ConditionRating = 6, LifeSpanMonths = 120, ServiceIntervalMonths = 12, SiteId = 1 },
        new Equipment { Id = 2, EquipmentNumber = "EQP-2026-0002", Name = "Sprinkler System", Category = "Sprinkler System",
            Model = "SP-24", Make = "FirePro", InstallationDate = DateTime.Today.AddYears(-8),
            LastInspectionDate = DateTime.Today.AddDays(-40), LastServiceDate = DateTime.Today.AddDays(-10),
            NextServiceDue = DateTime.Today.AddDays(-25), ConditionRating = 4, LifeSpanMonths = 240, ServiceIntervalMonths = 12, SiteId = 4 },
        new Equipment { Id = 3, EquipmentNumber = "EQP-2026-0003", Name = "Fire Hose Reel", Category = "Hose Reel",
            Model = "HR-30", Make = "Kidde", InstallationDate = DateTime.Today.AddYears(-3),
            LastInspectionDate = DateTime.Today.AddDays(-200), LastServiceDate = DateTime.Today.AddDays(-200),
            NextServiceDue = DateTime.Today.AddDays(160), ConditionRating = 9, LifeSpanMonths = 180, ServiceIntervalMonths = 6, SiteId = 3 }
    };

    public static List<Site> Sites() => new()
    {
        new Site { Id = 1, Name = "Alpha Main Plant", BuildingType = "Manufacturing Plant", CustomerId = 1, Latitude = -26.20, Longitude = 28.05 },
        new Site { Id = 2, Name = "MediCare Central Hospital", BuildingType = "Hospital", CustomerId = 2, Latitude = -33.92, Longitude = 18.42 },
        new Site { Id = 3, Name = "GreenGrocer Gateway Mall", BuildingType = "Retail Mall", CustomerId = 3, Latitude = -29.86, Longitude = 31.02 },
        new Site { Id = 4, Name = "TechnoPark Tower A", BuildingType = "Office Building", CustomerId = 4, Latitude = -25.75, Longitude = 28.23 },
        new Site { Id = 5, Name = "Highveld Operations Complex", BuildingType = "Mining Site", CustomerId = 5, Latitude = -25.86, Longitude = 29.20 }
    };

    public static List<InventoryItem> Inventory() => new()
    {
        new InventoryItem { Id = 1, Name = "ABC Dry Chemical 9kg", Category = "Extinguisher Agent", CurrentStock = 2, ReorderLevel = 5,
            UnitCost = 145m, LeadTimeDays = 7, MonthlyUsage = NewUsage("2025-10", 8, "2025-12", 9, "2026-01", 12) },
        new InventoryItem { Id = 2, Name = "CO2 Cylinder 5kg", Category = "Extinguisher", CurrentStock = 1, ReorderLevel = 4,
            UnitCost = 890m, LeadTimeDays = 14, MonthlyUsage = NewUsage("2025-10", 2, "2025-11", 3, "2026-01", 4) },
        new InventoryItem { Id = 3, Name = "Smoke Detector", Category = "Detection", CurrentStock = 20, ReorderLevel = 6,
            UnitCost = 65m, LeadTimeDays = 10, MonthlyUsage = NewUsage("2025-10", 4, "2025-12", 6, "2026-01", 5) },
        new InventoryItem { Id = 4, Name = "Fire Hose Reel 30m", Category = "Hose Reel", CurrentStock = 6, ReorderLevel = 3,
            UnitCost = 1450m, LeadTimeDays = 21, MonthlyUsage = NewUsage("2025-10", 1, "2025-11", 2, "2026-01", 1) }
    };

    public static List<Inspection> Inspections() => new()
    {
        new Inspection { Id = 1, JobId = 1, EquipmentId = 1, TechnicianId = 1, InspectionDate = DateTime.Today.AddMonths(-1), Result = "Pass", Cost = 350m },
        new Inspection { Id = 2, JobId = 2, EquipmentId = 2, TechnicianId = 3, InspectionDate = DateTime.Today.AddDays(-40), Result = "Fail", Cost = 480m },
        new Inspection { Id = 3, JobId = 3, EquipmentId = 3, TechnicianId = 2, InspectionDate = DateTime.Today.AddDays(-50), Result = "Pass", Cost = 290m }
    };

    public static List<Service> Services() => new()
    {
        new Service { Id = 1, JobId = 1, EquipmentId = 1, TechnicianId = 1, ServiceDate = DateTime.Today.AddDays(-60), Category = "Extinguisher", Cost = 420m },
        new Service { Id = 2, JobId = 2, EquipmentId = 2, TechnicianId = 3, ServiceDate = DateTime.Today.AddDays(-10), Category = "Sprinkler", Cost = 3200m },
        new Service { Id = 3, JobId = 3, EquipmentId = 3, TechnicianId = 2, ServiceDate = DateTime.Today.AddDays(-200), Category = "Hose Reel", Cost = 610m }
    };

    public static List<Refill> Refills() => new()
    {
        new Refill { Id = 1, JobId = 2, EquipmentId = 1, TechnicianId = 2, RefillDate = DateTime.Today.AddDays(-30), AgentType = "ABC", AgentAmountKg = 9, Cost = 180m },
        new Refill { Id = 2, JobId = 2, EquipmentId = 3, TechnicianId = 1, RefillDate = DateTime.Today.AddDays(-45), AgentType = "CO2", AgentAmountKg = 5, Cost = 260m }
    };

    public static List<Maintenance> Maintenance() => new()
    {
        new Maintenance { Id = 1, JobId = 4, EquipmentId = 2, TechnicianId = 3, WorkDate = DateTime.Today.AddDays(-90), WorkType = "Repair", Cost = 1450m }
    };

    public static List<Certification> Certifications() => new()
    {
        new Certification { TechnicianId = 1, Name = "SAQCC Extinguisher", ExpiryDate = DateTime.Today.AddDays(20) },
        new Certification { TechnicianId = 2, Name = "SAQCC Extinguisher", ExpiryDate = DateTime.Today.AddDays(-5) },
        new Certification { TechnicianId = 3, Name = "SAQCC Sprinkler", ExpiryDate = DateTime.Today.AddDays(200) }
    };

    public static List<Invoice> Invoices() => new()
    {
        new Invoice { Id = 1, CustomerId = 1, Amount = 24000m, IssueDate = DateTime.Today.AddDays(-60), DueDate = DateTime.Today.AddDays(-30), Status = "Overdue" },
        new Invoice { Id = 2, CustomerId = 2, Amount = 18000m, IssueDate = DateTime.Today.AddDays(-15), DueDate = DateTime.Today.AddDays(15), Status = "Unpaid" },
        new Invoice { Id = 3, CustomerId = 3, Amount = 9500m, IssueDate = DateTime.Today.AddDays(-10), DueDate = DateTime.Today.AddDays(20), Status = "Unpaid" }
    };

    private static Dictionary<string, int> NewUsage(params object[] pairs)
    {
        var d = new Dictionary<string, int>();
        for (int i = 0; i < pairs.Length; i += 2)
            d[(string)pairs[i]] = (int)pairs[i + 1];
        return d;
    }
}