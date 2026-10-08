using FireOpsAI.Contracts;
using FireOpsAI.Models;

namespace FireOpsAI.Engine;

/// <summary>
/// Statistical anomaly detection: flags outlier costs (z-score),
/// overdue items, stock-outs and expired certifications.
/// </summary>
public static class AnomalyDetector
{
    public static List<Anomaly> Detect(
        IEnumerable<Inspection> inspections,
        IEnumerable<Service> services,
        IEnumerable<Refill> refills,
        IEnumerable<Maintenance> maintenance,
        IEnumerable<JobCard> jobs,
        IEnumerable<Equipment> equipment,
        IEnumerable<InventoryItem> inventory,
        IEnumerable<Certification> certifications,
        DateTime? now = null)
    {
        var today = (now ?? DateTime.Today).Date;
        var anomalies = new List<Anomaly>();

        // 1. Cost outliers using modified z-score.
        var costs = new List<(string Label, decimal Cost, int? Id)>();
        costs.AddRange(inspections.Select(i => ("Inspection", i.Cost, (int?)i.Id)));
        costs.AddRange(services.Select(s => ("Service", s.Cost, (int?)s.Id)));
        costs.AddRange(refills.Select(r => ("Refill", r.Cost, (int?)r.Id)));
        costs.AddRange(maintenance.Select(m => ("Maintenance", m.Cost, (int?)m.Id)));

        var costValues = costs.Select(c => (double)c.Cost).ToList();
        double median = Median(costValues);
        double mad = MedianAbsDev(costValues, median);
        foreach (var (label, cost, id) in costs)
        {
            if (mad <= 0) continue;
            double modifiedZ = 0.6745 * ((double)cost - median) / mad;
            if (modifiedZ > 3.5)
            {
                anomalies.Add(new Anomaly
                {
                    Type = "CostOutlier",
                    Severity = modifiedZ > 6 ? "Critical" : "High",
                    Description = $"Unusually high {label.ToLowerInvariant()} cost of R{cost:0.##} (z={modifiedZ:0.#})",
                    EntityId = id,
                    EntityType = label,
                    DetectedValue = cost,
                    RecommendedAction = "Review job card for scope creep or mis-charging",
                    Confidence = Math.Min(0.98, 0.5 + modifiedZ / 20)
                });
            }
        }

        // 2. Overdue service / inspection.
        foreach (var eq in equipment)
        {
            int overdue = 0;
            if (eq.NextServiceDue.HasValue)
                overdue = (today - eq.NextServiceDue.Value.Date).Days;
            if (overdue > 30)
            {
                anomalies.Add(new Anomaly
                {
                    Type = "OverdueService",
                    Severity = overdue > 60 ? "Critical" : "High",
                    Description = $"{eq.Name} ({eq.EquipmentNumber}) service overdue by {overdue} days",
                    EntityId = eq.Id,
                    EntityType = "Equipment",
                    DetectedValue = overdue,
                    RecommendedAction = "Schedule service immediately",
                    Confidence = 0.95
                });
            }
        }

        // 3. Overdue/completed-beyond-deadline jobs.
        foreach (var job in jobs.Where(j => j.Status == JobStatus.InProgress))
        {
            if (job.PlannedEnd.HasValue && job.PlannedEnd.Value.Date < today)
            {
                anomalies.Add(new Anomaly
                {
                    Type = "OverdueJob",
                    Severity = "High",
                    Description = $"Job card {job.Number} still in progress beyond planned finish",
                    EntityId = job.Id,
                    EntityType = "JobCard",
                    DetectedValue = 1,
                    RecommendedAction = "Follow up with assigned technician",
                    Confidence = 0.85
                });
            }
        }

        // 4. Stock-outs.
        foreach (var item in inventory)
        {
            if (item.CurrentStock <= 0)
            {
                anomalies.Add(new Anomaly
                {
                    Type = "StockOut",
                    Severity = "Critical",
                    Description = $"{item.Name} is out of stock",
                    EntityId = item.Id,
                    EntityType = "Inventory",
                    DetectedValue = item.CurrentStock,
                    RecommendedAction = "Place urgent order",
                    Confidence = 0.97
                });
            }
            else if (item.CurrentStock <= item.ReorderLevel)
            {
                anomalies.Add(new Anomaly
                {
                    Type = "LowStock",
                    Severity = "High",
                    Description = $"{item.Name} below reorder level (stock {item.CurrentStock}, level {item.ReorderLevel})",
                    EntityId = item.Id,
                    EntityType = "Inventory",
                    DetectedValue = item.CurrentStock,
                    RecommendedAction = "Place reorder",
                    Confidence = 0.9
                });
            }
        }

        // 5. Expired / near-expiry certifications.
        foreach (var cert in certifications)
        {
            int daysLeft = (cert.ExpiryDate.Date - today).Days;
            if (daysLeft < 0)
                anomalies.Add(new Anomaly
                {
                    Type = "ExpiredCertification",
                    Severity = "Critical",
                    Description = $"Certification {cert.Name} (technician {cert.TechnicianId}) expired {Math.Abs(daysLeft)}d ago",
                    EntityId = cert.TechnicianId,
                    EntityType = "Technician",
                    DetectedValue = Math.Abs(daysLeft),
                    RecommendedAction = "Block assignments until re-certified",
                    Confidence = 0.98
                });
            else if (daysLeft <= 30)
                anomalies.Add(new Anomaly
                {
                    Type = "ExpiringCertification",
                    Severity = "Medium",
                    Description = $"Certification {cert.Name} (technician {cert.TechnicianId}) expires in {daysLeft}d",
                    EntityId = cert.TechnicianId,
                    EntityType = "Technician",
                    DetectedValue = daysLeft,
                    RecommendedAction = "Schedule re-certification",
                    Confidence = 0.9
                });
        }

        return anomalies.OrderByDescending(a => SeverityRank(a.Severity)).ToList();
    }

    /// <summary>
    /// Groups related anomalies (same equipment or same entity) into a single
    /// incident so an operator receives one actionable alert per asset instead
    /// of a noisy list. Lightweight-warning anomalies (Low/Medium) keep their
    /// own grouping to avoid merging unrelated noise.
    /// </summary>
    public static List<ClusteredIncident> Cluster(IEnumerable<Anomaly> anomalies)
    {
        var list = anomalies.ToList();
        var incidents = new List<ClusteredIncident>();

        // Tie High/Critical anomalies to a shared entity (equipment/site/job).
        var groups = list
            .Where(a => SeverityRank(a.Severity) >= 2 && a.EntityId.HasValue && !string.IsNullOrEmpty(a.EntityType))
            .GroupBy(a => (a.EntityType ?? "Unknown", a.EntityId!.Value))
            .OrderByDescending(g => g.Max(a => SeverityRank(a.Severity)));

        int counter = 1;
        foreach (var g in groups)
        {
            var members = g.OrderByDescending(a => SeverityRank(a.Severity)).ToList();
            string sev = members[0].Severity;
            incidents.Add(new ClusteredIncident
            {
                IncidentId = $"INC-{DateTime.UtcNow:yyyyMMdd}-{counter++:000}",
                Title = $"{members[0].EntityType} issue",
                Severity = sev,
                EntityType = members[0].EntityType,
                EntityId = members[0].EntityId,
                AnomalyCount = members.Count,
                Members = members,
                RecommendedAction = members[0].RecommendedAction ?? "Investigate"
            });
        }

        // Remaining anomalies (low severity or no entity) are standalone.
        var used = new HashSet<Anomaly>(groups.SelectMany(g => g));
        foreach (var a in list.Where(a => !used.Contains(a)))
        {
            incidents.Add(new ClusteredIncident
            {
                IncidentId = $"INC-{DateTime.UtcNow:yyyyMMdd}-{counter++:000}",
                Title = a.Description,
                Severity = a.Severity,
                EntityType = a.EntityType,
                EntityId = a.EntityId,
                AnomalyCount = 1,
                Members = new List<Anomaly> { a },
                RecommendedAction = a.RecommendedAction ?? "Investigate"
            });
        }

        return incidents.OrderByDescending(i => SeverityRank(i.Severity)).ToList();
    }

    private static double Median(List<double> values)
    {
        if (values.Count == 0) return 0;
        var sorted = values.OrderBy(v => v).ToList();
        int mid = sorted.Count / 2;
        return sorted.Count % 2 == 1
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2.0;
    }

    private static double MedianAbsDev(List<double> values, double median)
    {
        if (values.Count == 0) return 0;
        var devs = values.Select(v => Math.Abs(v - median)).OrderBy(v => v).ToList();
        return devs.Count % 2 == 1
            ? devs[devs.Count / 2]
            : (devs[(devs.Count / 2) - 1] + devs[devs.Count / 2]) / 2.0;
    }

    private static int SeverityRank(string s) => s switch
    {
        "Critical" => 3,
        "High" => 2,
        "Medium" => 1,
        _ => 0
    };

    public static string SeverityText(double modifiedZ) => modifiedZ > 6 ? "Critical" : "High";
}