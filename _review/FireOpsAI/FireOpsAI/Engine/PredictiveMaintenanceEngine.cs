using FireOpsAI.Contracts;
using FireOpsAI.Models;

namespace FireOpsAI.Engine;

/// <summary>
/// Predictive maintenance: scores every piece of equipment 0..100 for
/// failure risk using recency of service, condition rating, age vs lifespan,
/// overdue inspections AND observed failure history (failed inspections,
/// repeated repairs, refill/discharge frequency). Remaining useful life is
/// estimated with a Weibull-style degradation curve.
/// </summary>
public static class PredictiveMaintenanceEngine
{
    private static readonly string[] Actions = { "Immediate service", "Schedule full service", "Schedule inspection", "Repair", "Replace", "Monitor closely" };

    public static List<PredictiveAssessment> Assess(
        IEnumerable<Equipment> equipment,
        IReadOnlyList<Inspection>? inspections = null,
        IReadOnlyList<Refill>? refills = null,
        IReadOnlyList<Maintenance>? maintenance = null,
        DateTime? now = null,
        Engine.ML.GradientBoostedTrees? model = null)
    {
        var today = (now ?? DateTime.Today).Date;
        var result = new List<PredictiveAssessment>();

        // Warm the ML feature caches from history.
        Engine.ML.RiskModel.Warmup(inspections, today);
        Engine.ML.RiskModel.WarmupMaintenance(maintenance);
        Engine.ML.RiskModel.WarmupRefills(refills);

        var inspByEquip = (inspections ?? Array.Empty<Inspection>())
            .Where(i => i.EquipmentId.HasValue)
            .GroupBy(i => i.EquipmentId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var refillByEquip = (refills ?? Array.Empty<Refill>())
            .Where(r => r.EquipmentId.HasValue)
            .GroupBy(r => r.EquipmentId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        var maintByEquip = (maintenance ?? Array.Empty<Maintenance>())
            .Where(m => m.EquipmentId.HasValue)
            .GroupBy(m => m.EquipmentId!.Value)
            .ToDictionary(g => g.Key, g => g.ToList());

        foreach (var eq in equipment)
        {
            int daysOverdueService = 0;
            if (eq.NextServiceDue.HasValue)
                daysOverdueService = (today - eq.NextServiceDue.Value.Date).Days;

            int daysSinceService = 9999;
            if (eq.LastServiceDate.HasValue)
                daysSinceService = (today - eq.LastServiceDate.Value.Date).Days;

            int daysSinceInspection = 9999;
            if (eq.LastInspectionDate.HasValue)
                daysSinceInspection = (today - eq.LastInspectionDate.Value.Date).Days;

            int ageMonths = 0;
            if (eq.InstallationDate.HasValue)
                ageMonths = (int)(today - eq.InstallationDate.Value.Date).TotalDays / 30;

            double lifespan = Math.Max(eq.LifeSpanMonths, 1);
            double ageFactor = Math.Clamp(ageMonths / lifespan, 0.0, 1.5);

            double conditionFactor = Math.Clamp((10 - eq.ConditionRating) / 10.0, 0.0, 1.0);
            double serviceFactor = eq.NextServiceDue.HasValue
                ? Math.Clamp(daysOverdueService / 90.0, 0.0, 1.0)
                : Math.Clamp((daysSinceService - (eq.ServiceIntervalMonths * 30)) / 90.0, 0.0, 1.0);

            double inspectionFactor = Math.Clamp(daysSinceInspection / 365.0, 0.0, 1.0);

            // ---- Failure-history factors ----
            inspByEquip.TryGetValue(eq.Id, out var eqInspections);
            refillByEquip.TryGetValue(eq.Id, out var eqRefills);
            maintByEquip.TryGetValue(eq.Id, out var eqMaintenance);

            int failedInspections = eqInspections?.Count(i => !i.Result.Equals("Pass", StringComparison.OrdinalIgnoreCase)) ?? 0;
            int repairCount = eqMaintenance?.Count ?? 0;
            int refillCount = eqRefills?.Count ?? 0;

            double failureFactor = 0;
            if (failedInspections > 0) failureFactor += Math.Min(failedInspections * 0.30, 0.9);
            if (repairCount > 0) failureFactor += Math.Min(repairCount * 0.15, 0.6);
            if (refillCount > 1) failureFactor += Math.Min((refillCount - 1) * 0.1, 0.4);

            // Equipment observed to fail recently is inherently more risky.
            if (eqInspections != null)
            {
                var lastResult = eqInspections.OrderByDescending(i => i.InspectionDate).FirstOrDefault();
                if (lastResult != null && !lastResult.Result.Equals("Pass", StringComparison.OrdinalIgnoreCase))
                    failureFactor += 0.15;
            }

            double risk = (0.22 * ageFactor * 100) + (0.22 * conditionFactor * 100) +
                          (0.25 * serviceFactor * 100) + (0.16 * inspectionFactor * 100) +
                          (0.15 * failureFactor * 100);

            // Blend with the gradient-boosted ML score when a model is available.
            if (model != null)
            {
                var features = Engine.ML.RiskModel.BuildFeatures(eq, today);
                double mlRaw = Math.Clamp(model.Predict(features), 0, 1);
                double mlScore = Engine.ML.RiskModel.ToRiskScore(mlRaw);
                risk = (0.55 * risk) + (0.45 * mlScore);
            }

            if (eq.Status == "Out of Service") risk = Math.Max(risk, 75);
            risk = Math.Clamp(risk, 0, 100);

            string severity = RiskSeverity(risk);
            int rul = EstimatedRemainingLife(risk, eq.ConditionRating, lifespan, serviceFactor, failureFactor);

            var factors = new List<string>();
            if (daysOverdueService > 0) factors.Add($"Service overdue by {daysOverdueService}d");
            if (ageFactor > 0.8) factors.Add("Past expected service life");
            if (eq.ConditionRating <= 4) factors.Add("Poor condition rating");
            if (daysSinceInspection > 365) factors.Add($"No inspection for {daysSinceInspection}d");
            if (failedInspections > 0) factors.Add($"{failedInspections} failed inspection(s)");
            if (repairCount > 0) factors.Add($"{repairCount} repair(s) on record");
            if (refillCount > 1) factors.Add($"{refillCount} refill(s) — abnormal discharge");

            var assessment = new PredictiveAssessment
            {
                EquipmentId = eq.Id,
                EquipmentNumber = eq.EquipmentNumber ?? eq.Id.ToString(),
                Name = eq.Name,
                ConditionRating = eq.ConditionRating,
                RiskScore = Math.Round(risk, 1),
                Severity = severity,
                RecommendedAction = RecommendedAction(risk, eq.Category, failureFactor),
                RemainingUsefulLifeMonths = rul,
                DaysOverdueService = Math.Max(daysOverdueService, 0),
                ContributingFactors = factors,
                Explanation = Explanation(risk, eq, daysOverdueService, ageMonths, failedInspections, repairCount),
                FailureEvidenceScore = Math.Round(failureFactor * 100, 1)
            };
            result.Add(assessment);
        }

        return result.OrderByDescending(r => r.RiskScore).ToList();
    }

    private static string RiskSeverity(double risk) => risk switch
    {
        >= 80 => "Critical",
        >= 60 => "High",
        >= 35 => "Medium",
        _ => "Low"
    };

    private static int EstimatedRemainingLife(double risk, int condition, double lifespan, double serviceFactor, double failureFactor)
    {
        if (risk >= 80) return 0;
        // Weibull-ish degradation: effective age accelerates with failures & poor condition.
        double shape = 1.5;                       // wear-out shape
        double effectiveAgeRatio = Math.Clamp((serviceFactor * 0.4) + (failureFactor * 0.4) + ((10 - condition) / 10.0 * 0.3), 0, 1);
        double reliabilityMonthRatio = Math.Pow(1 - effectiveAgeRatio, shape);   // surviving fraction
        double months = lifespan * reliabilityMonthRatio * (1 - risk / 100.0);
        return Math.Max(0, (int)Math.Round(months));
    }

    private static string RecommendedAction(double risk, string category, double failureFactor)
    {
        var cat = category.ToLowerInvariant();
        if (risk >= 80) return cat.Contains("extinguisher") || cat.Contains("hose") ? "Replace" : "Immediate service";
        if (risk >= 60) return failureFactor > 0.5 ? "Schedule full service + repair" : "Schedule full service";
        if (risk >= 35) return "Schedule inspection";
        return "Continue routine schedule";
    }

    private static string Explanation(double risk, Equipment eq, int overdueDays, int ageMonths, int failedInspections, int repairCount)
    {
        string core = $"Risk score {risk:0.#}/100";
        var details = new List<string>();
        if (overdueDays > 0) details.Add($"service overdue {overdueDays}d");
        if (eq.ConditionRating <= 4) details.Add($"condition {eq.ConditionRating}/10");
        if (ageMonths > eq.LifeSpanMonths) details.Add($"age {ageMonths}mo > {eq.LifeSpanMonths}mo lifespan");
        if (failedInspections > 0) details.Add($"{failedInspections} failed inspection(s)");
        if (repairCount > 0) details.Add($"{repairCount} repair(s)");
        if (details.Count == 0) return core + ". Equipment is within normal parameters.";
        return core + " driven by " + string.Join(", ", details) + ".";
    }
}