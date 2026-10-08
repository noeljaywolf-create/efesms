using FireOpsAI.Contracts;
using FireOpsAI.Models;

namespace FireOpsAI.Engine;

/// <summary>
/// Site-level risk scoring: aggregates equipment failure risk, overdue
/// inspections and out-of-service units per site.
/// </summary>
public static class SiteRiskScorer
{
    public static List<SiteRisk> Score(
        IEnumerable<Site> sites,
        IEnumerable<Equipment> equipment,
        IReadOnlyCollection<PredictiveAssessment>? assessments = null)
    {
        var map = assessments?.ToDictionary(a => a.EquipmentId, a => a) ?? new Dictionary<int, PredictiveAssessment>();
        var result = new List<SiteRisk>();

        foreach (var site in sites)
        {
            var siteEquipment = equipment.Where(e => e.SiteId == site.Id).ToList();
            if (siteEquipment.Count == 0) continue;

            var eqAssessments = siteEquipment
                .Where(e => map.ContainsKey(e.Id))
                .Select(e => map[e.Id])
                .ToList();

            double equipmentRisk = eqAssessments.Count > 0 ? eqAssessments.Average(a => a.RiskScore) : 0;

            int atRisk = eqAssessments.Count(a => a.RiskScore >= 60);
            int outOfService = siteEquipment.Count(e => e.Status == "Out of Service");
            int overdueInspections = eqAssessments.Count(a =>
                a.ContributingFactors.Any(f => f.StartsWith("No inspection")) ||
                a.DaysOverdueService > 0);

            double risk = Math.Clamp(
                (0.55 * equipmentRisk) +
                (0.20 * Math.Min(atRisk * 20, 100)) +
                (0.15 * Math.Min(outOfService * 25, 100)) +
                (0.10 * Math.Min(overdueInspections * 15, 100)), 0, 100);

            string severity = risk switch
            {
                >= 70 => "Critical",
                >= 50 => "High",
                >= 30 => "Medium",
                _ => "Low"
            };

            result.Add(new SiteRisk
            {
                SiteId = site.Id,
                SiteName = site.Name,
                RiskScore = Math.Round(risk, 1),
                Severity = severity,
                EquipmentAtRisk = atRisk + outOfService,
                OverdueInspections = overdueInspections,
                RecommendedAction = RecommendedAction(risk)
            });
        }

        return result.OrderByDescending(r => r.RiskScore).ToList();
    }

    private static string RecommendedAction(double risk) => risk switch
    {
        >= 70 => "Immediate site-level intervention required",
        >= 50 => "Prioritise service and inspection visits",
        >= 30 => "Schedule routine maintenance",
        _ => "Maintain current schedule"
    };
}