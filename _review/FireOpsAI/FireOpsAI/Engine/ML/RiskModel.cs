using FireOpsAI.Models;

namespace FireOpsAI.Engine.ML;

/// <summary>
/// Feature engineering + trained risk scoring for fire equipment.
/// Builds a labelled dataset from equipment state and observed service
/// history, trains a gradient-boosted tree, and produces 0..100 risk.
/// Pure C#, no external ML libraries.
/// </summary>
public static class RiskModel
{
    private const int Features = 8;

    /// <summary>
    /// Builds one feature vector per equipment item.
    /// Order: [ageRatio, conditionNeg, serviceOverdueNormalized, inspectionAge,
    ///     failedInspectionCount, repairCount, refillRate, outOfService]
    /// </summary>
    public static double[] BuildFeatures(Equipment e, DateTime today)
    {
        int ageMonths = e.InstallationDate.HasValue ? (int)(today - e.InstallationDate.Value.Date).TotalDays / 30 : 0;
        double lifespan = Math.Max(e.LifeSpanMonths, 1);
        double ageRatio = Math.Clamp(ageMonths / lifespan, 0.0, 1.5);

        double conditionNeg = (10 - Math.Clamp(e.ConditionRating, 1, 10)) / 10.0;

        int overdue = 0;
        if (e.NextServiceDue.HasValue) overdue = (today - e.NextServiceDue.Value.Date).Days;
        double serviceUnsafe = Math.Clamp(Math.Max(overdue, 0) / 90.0, 0.0, 1.0);

        int sinceInsp = e.LastInspectionDate.HasValue ? (int)(today - e.LastInspectionDate.Value.Date).TotalDays : 9999;
        double inspUnsafe = Math.Clamp(sinceInsp / 365.0, 0.0, 1.0);

        int failedInsps = LastFailures(e.Id, today);
        int repairs = RepairCount(e.Id, today);
        int refills = RefillCount(e.Id, today);
        double refillRate = Math.Clamp(refills / 12.0, 0, 1);

        return new[]
        {
            ageRatio,
            conditionNeg,
            serviceUnsafe,
            inspUnsafe,
            (double)Math.Min(failedInsps, 3),
            (double)Math.Min(repairs, 3),
            refillRate,
            e.Status == "Out of Service" ? 1.0 : 0.0
        };
    }

    private static readonly Dictionary<int, double[]> _lastInsp = new();
    private static readonly Dictionary<int, int> _failCount = new();

    public static void Warmup(IReadOnlyList<Inspection>? inspections, DateTime today)
    {
        _lastInsp.Clear(); _failCount.Clear();
        if (inspections == null) return;
        foreach (var g in inspections.Where(i => i.EquipmentId.HasValue).GroupBy(i => i.EquipmentId!.Value))
        {
            _lastInsp[g.Key] = new[] { (double)g.Max(i => i.InspectionDate.Ticks) };
            _failCount[g.Key] = g.Count(i => !i.Result.Equals("Pass", StringComparison.OrdinalIgnoreCase));
        }
    }

    private static int LastFailures(int equipId, DateTime today) =>
        _failCount.TryGetValue(equipId, out int c) ? c : 0;

    private static int RepairCount(int equipId, DateTime today) =>
        _repairs.TryGetValue(equipId, out int c) ? c : 0;

    private static readonly Dictionary<int, int> _repairs = new();
    public static void WarmupMaintenance(IReadOnlyList<Maintenance>? maintenance)
    {
        _repairs.Clear();
        if (maintenance == null) return;
        foreach (var m in maintenance.Where(x => x.EquipmentId.HasValue))
            _repairs[m.EquipmentId!.Value] = _repairs.GetValueOrDefault(m.EquipmentId!.Value) + 1;
    }

    private static readonly Dictionary<int, int> _refills = new();
    public static void WarmupRefills(IReadOnlyList<Refill>? refills)
    {
        _refills.Clear();
        if (refills == null) return;
        foreach (var r in refills.Where(x => x.EquipmentId.HasValue))
            _refills[r.EquipmentId!.Value] = _refills.GetValueOrDefault(r.EquipmentId!.Value) + 1;
    }
    private static int RefillCount(int equipId, DateTime today) =>
        _refills.TryGetValue(equipId, out int c) ? c : 0;

    /// <summary>Returns a trained model ready for prediction, or null if data insufficient.</summary>
    public static GradientBoostedTrees? Train(IReadOnlyList<Equipment> equipment, DateTime today)
    {
        Warmup(null, today);
        WarmupMaintenance(null);
        WarmupRefills(null);

        if (equipment.Count < 8) return null; // not enough signal

        var xs = new List<double[]>();
        var ys = new List<double>();
        foreach (var e in equipment)
        {
            var f = BuildFeatures(e, today);
            xs.Add(f);
            // Proxy label: high-risk if overdue, poor condition, or many signal flags.
            double risk = 0;
            if (e.NextServiceDue.HasValue && e.NextServiceDue.Value.Date < today) risk += 0.6;
            if (e.ConditionRating <= 4) risk += 0.4;
            if (e.Status == "Out of Service") risk += 0.5;
            ys.Add(Math.Min(1, risk));
        }

        var model = new GradientBoostedTrees(maxDepth: 3, learningRate: 0.08, numTrees: 90);
        model.Train(xs.ToArray(), ys.ToArray());
        return model;
    }

    /// <summary>Normalizes the boosted output to a 0..100 risk score.</summary>
    public static double ToRiskScore(double raw)
    {
        // Models output ~0..1 risk probability trained on proxy labels; scale.
        return Math.Clamp(Math.Round(raw * 100, 1), 0, 100);
    }
}