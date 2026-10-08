using FireOpsAI.Contracts;
using FireOpsAI.Engine;

namespace FireOpsAI;

/// <summary>
/// FireOpsAI — the single entry point.
///
/// Usage:
///   var input = new EngineInput { Jobs = jobCards, Technicians = techs, ... };
///   var output = new AIOperationsEngine().Analyze(input);
///
/// All modules are static and can also be called individually.
/// </summary>
public class AIOperationsEngine
{
    public EngineOutput Analyze(EngineInput input, DateTime? now = null)
    {
        var output = new EngineOutput { GeneratedAt = DateTime.UtcNow };
        var today = (now ?? DateTime.Today).Date;

        // Train the ML risk model from equipment + history.
        var model = Engine.ML.RiskModel.Train(input.Equipment.ToList(), today);
        output.ML = new MLReport
        {
            RiskModelTrained = model != null,
            RiskTrainingSamples = input.Equipment.Count,
            ScheduleAlgorithm = "GeneticScheduler",
            ForecastAlgorithm = "HoltWinters"
        };

        output.Assignments = input.Technicians.Count > 1
            ? GeneticScheduler.Schedule(input.Jobs, input.Technicians)
            : AIScheduler.AssignJobs(input.Jobs, input.Technicians);
        output.Routes = AIScheduler.BuildRoutes(output.Assignments, input.Jobs, input.Technicians);
        output.RiskAssessments = PredictiveMaintenanceEngine.Assess(
            input.Equipment, input.Inspections, input.Refills, input.Maintenance, now, model);
        output.Anomalies = AnomalyDetector.Detect(
            input.Inspections, input.Services, input.Refills, input.Maintenance,
            input.Jobs, input.Equipment, input.Inventory, input.Certifications, now);
        output.Incidents = AnomalyDetector.Cluster(output.Anomalies);
        output.Forecasts = DemandForecaster.Forecast(input.Inventory);
        output.Reorders = DemandForecaster.SuggestOrdering(input.Inventory, output.Forecasts);
        output.SiteRisks = SiteRiskScorer.Score(input.Sites, input.Equipment, output.RiskAssessments);
        output.Reminders = SmartReminderEngine.Generate(input, now);
        output.RiskClusters = RiskClusterer.Cluster(output.RiskAssessments);

        output.OverallConfidence = ComputeConfidence(output);
        return output;
    }

    /// <summary>Run only the modules you need — minimum integration path.</summary>
    public EngineOutput AnalyzePartial(
        EngineInput input,
        bool schedule = true,
        bool route = true,
        bool predict = true,
        bool detectAnomalies = true,
        bool forecast = true,
        bool risk = true,
        bool reminders = true,
        bool cluster = true,
        DateTime? now = null)
    {
        var output = new EngineOutput { GeneratedAt = DateTime.UtcNow };
        var today = (now ?? DateTime.Today).Date;

        var model = predict ? Engine.ML.RiskModel.Train(input.Equipment.ToList(), today) : null;
        output.ML = new MLReport
        {
            RiskModelTrained = model != null,
            RiskTrainingSamples = input.Equipment.Count,
            ScheduleAlgorithm = input.Technicians.Count > 1 ? "GeneticScheduler" : "AIScheduler",
            ForecastAlgorithm = "HoltWinters/EMA"
        };

        if (schedule)
        {
            output.Assignments = input.Technicians.Count > 1
                ? GeneticScheduler.Schedule(input.Jobs, input.Technicians)
                : AIScheduler.AssignJobs(input.Jobs, input.Technicians);
            if (route)
                output.Routes = AIScheduler.BuildRoutes(output.Assignments, input.Jobs, input.Technicians);
        }
        if (predict) output.RiskAssessments = PredictiveMaintenanceEngine.Assess(
            input.Equipment, input.Inspections, input.Refills, input.Maintenance, now, model);
        if (detectAnomalies)
        {
            output.Anomalies = AnomalyDetector.Detect(
                input.Inspections, input.Services, input.Refills, input.Maintenance,
                input.Jobs, input.Equipment, input.Inventory, input.Certifications, now);
            output.Incidents = AnomalyDetector.Cluster(output.Anomalies);
        }
        if (forecast)
        {
            output.Forecasts = DemandForecaster.Forecast(input.Inventory);
            output.Reorders = DemandForecaster.SuggestOrdering(input.Inventory, output.Forecasts);
        }
        if (risk) output.SiteRisks = SiteRiskScorer.Score(input.Sites, input.Equipment, output.RiskAssessments);
        if (reminders) output.Reminders = SmartReminderEngine.Generate(input, now);
        if (cluster) output.RiskClusters = RiskClusterer.Cluster(output.RiskAssessments);

        output.OverallConfidence = ComputeConfidence(output);
        return output;
    }

    private static double ComputeConfidence(EngineOutput o)
    {
        double confidence = 0.85;
        if (o.RiskAssessments.Count == 0) confidence += 0.05;
        if (o.Assignments.Count == 0) confidence -= 0.1;
        if (o.Anomalies.Count == 0) confidence -= 0.05;
        return Math.Round(Math.Clamp(confidence, 0.4, 0.97), 2);
    }
}