using FireOpsAI.Contracts;
using FireOpsAI.Engine.ML;

namespace FireOpsAI.Engine;

/// <summary>
/// Unsupervised risk segmentation: feeds per-equipment risk features into
/// k-means, then labels the clusters Low/Medium/High/Critical by mean risk.
/// Gives operations an at-a-glance view of the fleet's risk profile.
/// </summary>
public static class RiskClusterer
{
    public static List<RiskCohort> Cluster(IReadOnlyCollection<PredictiveAssessment> assessments)
    {
        var result = new List<RiskCohort>();
        if (assessments.Count == 0) return result;
        if (assessments.Count == 1)
        {
            var only = assessments.First();
            return new List<RiskCohort>
            {
                new RiskCohort { Label = only.Severity, ClusterCount = 1, MeanRisk = only.RiskScore, Members = new List<PredictiveAssessment> { only } }
            };
        }

        // Feature vector: [risk/100, 1-condition/10, overdueNormalized].
        var data = assessments
            .Select(a => new double[]
            {
                a.RiskScore / 100.0,
                1.0 - a.ConditionRating / 10.0,
                Math.Clamp(a.DaysOverdueService / 90.0, 0, 1)
            })
            .ToArray();

        int k = data.Length >= 4 ? 3 : 2;
        var km = KMeans.BestCluster(data, kMin: k, kMax: k);

        var groups = assessments
            .Select((a, i) => (Assessment: a, Cluster: km.Labels[i]))
            .GroupBy(x => x.Cluster)
            .ToList();

        foreach (var g in groups)
        {
            var members = g.Select(x => x.Assessment).ToList();
            double mean = members.Average(m => m.RiskScore);
            result.Add(new RiskCohort
            {
                Label = LabelFor(mean),
                ClusterCount = members.Count,
                MeanRisk = Math.Round(mean, 1),
                Members = members
            });
        }

        return result.OrderByDescending(c => c.MeanRisk).ToList();
    }

    private static string LabelFor(double meanRisk) => meanRisk switch
    {
        >= 70 => "Critical",
        >= 50 => "High",
        >= 30 => "Medium",
        _ => "Low"
    };
}