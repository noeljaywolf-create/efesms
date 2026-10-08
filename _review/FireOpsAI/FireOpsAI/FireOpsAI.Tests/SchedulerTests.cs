using FireOpsAI;
using FireOpsAI.Engine;
using FireOpsAI.Models;
using Xunit;

namespace FireOpsAI.Tests;

public class AISchedulerTests
{
    private static Technician Tech(int id, string trade = "Fire Technician") => new()
    {
        Id = id, Name = $"Tech {id}", Trade = trade, Available = true, MaxConcurrentJobs = 4,
        Skills = new[] { "inspection", "service", "refill", "maintenance", "extinguisher", "sprinkler" },
        Certifications = new[] { "SAQCC Extinguisher", "SAQCC Installation", "SAQCC Sprinkler" },
        Latitude = -26.2, Longitude = 28.05
    };

    private static JobCard Job(int id, string type = "Inspection", Priority priority = Priority.Normal) => new()
    {
        Id = id, Number = $"JC-{id}", JobType = type, Status = JobStatus.Assigned,
        RequiredSkills = new[] { "inspection", "extinguisher" },
        RequiredCertifications = new[] { "SAQCC Extinguisher" },
        Priority = priority, Latitude = -26.2, Longitude = 28.05,
        EstimatedHours = 1.5, PlannedStart = DateTime.Today.AddDays(1)
    };

    [Fact]
    public void AssignJobs_MatchesSkilledCertifiedTech()
    {
        var techs = new List<Technician> { Tech(1) };
        var jobs = new List<JobCard> { Job(1) };

        var result = AIScheduler.AssignJobs(jobs, techs);

        var a = Assert.Single(result);
        Assert.Equal(1, a.TechnicianId);
        Assert.True(a.Score > 0);
        Assert.Contains(a.Reasons, r => r.Contains("Best fit"));
    }

    [Fact]
    public void AssignJobs_RespectsMaxConcurrentLoad()
    {
        var tech = Tech(1);
        tech.CurrentJobIds = new[] { 1, 2, 3, 4 };
        // Overload: exactly 4 current jobs == capacity, so no new job assigned.
        var result = AIScheduler.AssignJobs(new[] { Job(10) }, new[] { tech });
        Assert.Empty(result);
    }

    [Fact]
    public void AssignJobs_EmptyWhenNoAvailableTech()
    {
        var tech = Tech(1);
        tech.Available = false;
        var result = AIScheduler.AssignJobs(new[] { Job(1) }, new[] { tech });
        Assert.Empty(result);
    }

    [Fact]
    public void Haversine_JohannesburgToCapeTown_About1270km()
    {
        // Johannesburg -> Cape Town is ~1270 km.
        double km = AIScheduler.HaversineKm(-26.2041, 28.0473, -33.9249, 18.4241);
        Assert.InRange(km, 1200, 1350);
    }

    [Fact]
    public void BuildRoutes_SequencesSameSiteJobsAdjacent()
    {
        var jobs = new List<JobCard>
        {
            new() { Id = 1, SiteId = 5, Title = "Job A", JobType = "Inspection", Latitude = -26.1, Longitude = 28.1, Priority = Priority.Normal, Status = JobStatus.Assigned, RequiredSkills = new[] { "inspection" } },
            new() { Id = 2, SiteId = 5, Title = "Job B", JobType = "Service", Latitude = -26.1, Longitude = 28.1, Priority = Priority.High, Status = JobStatus.Assigned, RequiredSkills = new[] { "inspection" } },
            new() { Id = 3, SiteId = 6, Title = "Job C", JobType = "Refill", Latitude = -26.2, Longitude = 28.2, Priority = Priority.Normal, Status = JobStatus.Assigned, RequiredSkills = new[] { "inspection" } }
        };
        var assignments = new List<Contracts.ScheduledAssignment>
        {
            new() { JobId = 1, TechnicianId = 1, EstHours = 1, ProposedStart = DateTime.Today },
            new() { JobId = 2, TechnicianId = 1, EstHours = 1, ProposedStart = DateTime.Today },
            new() { JobId = 3, TechnicianId = 1, EstHours = 1, ProposedStart = DateTime.Today }
        };

        var routes = AIScheduler.BuildRoutes(assignments, jobs, new[] { Tech(1) });

        var route = Assert.Single(routes);
        // Same-site jobs (site 5) should come before the off-site job in a compact route.
        Assert.Equal(3, route.Stops.Count);
        Assert.Equal(5, route.Stops[0].SiteId);
        Assert.Equal(5, route.Stops[1].SiteId);
        Assert.Equal(6, route.Stops[2].SiteId);
    }
}

public class PredictiveMaintenanceEngineTests
{
    private static Equipment Equip(int id, int condition = 8, DateTime? serviceDue = null, DateTime? installed = null) => new()
    {
        Id = id, EquipmentNumber = $"EQP-{id}", Name = "Extinguisher", Category = "Extinguisher",
        ConditionRating = condition, NextServiceDue = serviceDue, InstallationDate = installed,
        LifeSpanMonths = 120, ServiceIntervalMonths = 12, LastInspectionDate = DateTime.Today
    };

    [Fact]
    public void Assess_OverdueService_HighRisk()
    {
        var eq = Equip(1, condition: 6, serviceDue: DateTime.Today.AddDays(-95));
        var result = PredictiveMaintenanceEngine.Assess(new[] { eq });
        var r = Assert.Single(result);
        Assert.True(r.RiskScore > 30, $"expected >30, got {r.RiskScore}");
        Assert.Contains(r.ContributingFactors, f => f.Contains("overdue"));
    }

    [Fact]
    public void Assess_FailedInspection_IncreasesRisk()
    {
        var eq = Equip(2, condition: 8, serviceDue: DateTime.Today.AddDays(120));
        var failHistory = new List<Inspection>
        {
            new() { EquipmentId = 2, InspectionDate = DateTime.Today.AddMonths(-1), Result = "Fail", Cost = 100 }
        };
        var baseline = PredictiveMaintenanceEngine.Assess(new[] { eq }).Single();
        var withFailure = PredictiveMaintenanceEngine.Assess(new[] { eq }, inspections: failHistory).Single();
        Assert.True(withFailure.RiskScore > baseline.RiskScore);
        Assert.True(withFailure.FailureEvidenceScore > 0);
    }

    [Fact]
    public void Assess_OutOfService_MinimumRisk_Watermark()
    {
        var eq = Equip(3, condition: 9, serviceDue: DateTime.Today.AddDays(100));
        eq.Status = "Out of Service";
        var result = PredictiveMaintenanceEngine.Assess(new[] { eq }).Single();
        Assert.True(result.RiskScore >= 75);
    }
}

public class AnomalyDetectorTests
{
    [Fact]
    public void Detect_ExpiredCertification_IsCritical()
    {
        var certs = new List<Certification>
        {
            new() { TechnicianId = 1, Name = "SAQCC", ExpiryDate = DateTime.Today.AddDays(-10) }
        };
        var result = AnomalyDetector.Detect(
            Array.Empty<Inspection>(), Array.Empty<Service>(), Array.Empty<Refill>(),
            Array.Empty<Maintenance>(), Array.Empty<JobCard>(), Array.Empty<Equipment>(),
            Array.Empty<InventoryItem>(), certs);
        Assert.Contains(result, a => a.Type == "ExpiredCertification" && a.Severity == "Critical");
    }

    [Fact]
    public void Detect_StockOut_IsCritical()
    {
        var inventory = new List<InventoryItem>
        {
            new() { Id = 1, Name = "CO2", CurrentStock = 0, ReorderLevel = 4 }
        };
        var result = AnomalyDetector.Detect(
            Array.Empty<Inspection>(), Array.Empty<Service>(), Array.Empty<Refill>(),
            Array.Empty<Maintenance>(), Array.Empty<JobCard>(), Array.Empty<Equipment>(),
            inventory, Array.Empty<Certification>());
        Assert.Contains(result, a => a.Type == "StockOut" && a.Severity == "Critical");
    }

    [Fact]
    public void Detect_CostOutlier_ByZScore()
    {
        var services = new List<Service> { new() { Cost = 500m }, new() { Cost = 520m }, new() { Cost = 480m }, new() { Cost = 4000m } };
        var result = AnomalyDetector.Detect(
            Array.Empty<Inspection>(), services, Array.Empty<Refill>(),
            Array.Empty<Maintenance>(), Array.Empty<JobCard>(), Array.Empty<Equipment>(),
            Array.Empty<InventoryItem>(), Array.Empty<Certification>());
        Assert.Contains(result, a => a.Type == "CostOutlier" && a.Severity == "Critical" && a.EntityType == "Service");
    }

    [Fact]
    public void Cluster_GroupedAnomaliesIntoIncidents_ReducesCount()
    {
        var anomalies = new List<Contracts.Anomaly>
        {
            new() { Type = "CostOutlier", Severity = "High", EntityType = "Equipment", EntityId = 9, Description = "a", RecommendedAction = "x" },
            new() { Type = "OverdueService", Severity = "Critical", EntityType = "Equipment", EntityId = 9, Description = "b", RecommendedAction = "x" },
            new() { Type = "StockOut", Severity = "Critical", EntityType = "Inventory", EntityId = 3, Description = "c", RecommendedAction = "x" }
        };
        var incidents = AnomalyDetector.Cluster(anomalies);
        // 3 anomalies, but the 2 sharing equipment 9 merge into 1 → 2 incidents.
        Assert.Equal(2, incidents.Count);
        var eqIncident = incidents.Single(i => i.EntityId == 9);
        Assert.Equal(2, eqIncident.AnomalyCount);
        Assert.Equal("Critical", eqIncident.Severity);
    }
}

public class DemandForecasterTests
{
    [Fact]
    public void Forecast_ReordersLowStock()
    {
        var item = new InventoryItem
        {
            Id = 1, Name = "ABC", ReorderLevel = 5, CurrentStock = 2, LeadTimeDays = 7,
            MonthlyUsage = new Dictionary<string, int> { { "2025-11", 6 }, { "2025-12", 9 }, { "2026-01", 8 } }
        };
        var forecasts = DemandForecaster.Forecast(new[] { item });
        Assert.Single(forecasts);
        Assert.True(forecasts[0].ForecastNextMonth > 0);
        Assert.True(forecasts[0].SuggestedReorderPoint > 0);

        var reorders = DemandForecaster.SuggestOrdering(new[] { item }, forecasts);
        var r = Assert.Single(reorders);
        Assert.Equal(1, r.ItemId);
        Assert.True(r.SuggestedOrderQty > 0);
    }

    [Fact]
    public void Forecast_NoReorderWhenStockHealthy()
    {
        var item = new InventoryItem
        {
            Id = 2, Name = "Detector", ReorderLevel = 6, CurrentStock = 25, LeadTimeDays = 10,
            MonthlyUsage = new Dictionary<string, int> { { "2025-11", 4 }, { "2025-12", 6 }, { "2026-01", 5 } }
        };
        var forecasts = DemandForecaster.Forecast(new[] { item });
        Assert.Empty(DemandForecaster.SuggestOrdering(new[] { item }, forecasts));
    }
}

public class OrchestratorTests
{
    [Fact]
    public void Analyze_EndToEnd_ProducesAllOutputs()
    {
        var input = new Contracts.EngineInput
        {
            Technicians = new[]
            {
                new Technician { Id = 1, Name = "T", Available = true, MaxConcurrentJobs = 5, Skills = new[] { "inspection" }, Certifications = new[] { "SAQCC" } }
            },
            Jobs = new[]
            {
                new JobCard { Id = 1, JobType = "Inspection", Status = JobStatus.Assigned, RequiredSkills = new[] { "inspection" }, RequiredCertifications = new[] { "SAQCC" }, EstimatedHours = 1, PlannedStart = DateTime.Today }
            },
            Equipment = new[] { new Equipment { Id = 1, Name = "E", SiteId = 1, ConditionRating = 7, LifeSpanMonths = 120, LastInspectionDate = DateTime.Today, NextServiceDue = DateTime.Today.AddDays(60) } },
            Sites = new[] { new Site { Id = 1, Name = "S" } },
            Inventory = new[] { new InventoryItem { Id = 1, Name = "I", CurrentStock = 10, ReorderLevel = 3, MonthlyUsage = new Dictionary<string, int> { { "2025-12", 2 } } } },
            Inspections = Array.Empty<Inspection>(), Services = Array.Empty<Service>(), Refills = Array.Empty<Refill>(),
            Maintenance = Array.Empty<Maintenance>(), Certifications = Array.Empty<Certification>(), Invoices = Array.Empty<Invoice>()
        };

        var output = new AIOperationsEngine().Analyze(input);

        Assert.Single(output.Assignments);
        Assert.Single(output.Routes);
        Assert.Single(output.RiskAssessments);
        Assert.Single(output.Forecasts);
        Assert.Single(output.SiteRisks);
        Assert.True(output.OverallConfidence > 0);
    }
}

public class MLTests
{
    [Fact]
    public void GradientBoostedTrees_LearnsLinearPattern()
    {
        // y = 0.5 + 1.5x + noise
        var rng = new Random(7);
        var X = new List<double[]>();
        var y = new List<double>();
        for (int i = 0; i < 60; i++)
        {
            double x = i / 10.0;
            X.Add(new[] { x, x * 2 });
            y.Add(0.5 + 1.5 * x + (rng.NextDouble() - 0.5) * 0.2);
        }

        var model = new FireOpsAI.Engine.ML.GradientBoostedTrees(numTrees: 120, maxDepth: 3);
        model.Train(X.ToArray(), y.ToArray());

        // Predict on an unseen point.
        double p1 = model.Predict(new[] { 5.0, 10.0 });
        double expected = 0.5 + 1.5 * 5.0;
        Assert.True(Math.Abs(p1 - expected) < 0.5, $"predicted {p1}, expected ~{expected}");
    }

    [Fact]
    public void KMeans_ClustersClearBlobs()
    {
        var rng = new Random(1);
        var data = new List<double[]>();
        // Blob A centered (0,0), Blob B centered (10,10).
        for (int i = 0; i < 30; i++)
        {
            data.Add(new[] { rng.NextDouble(), rng.NextDouble() });
            data.Add(new[] { 10 + rng.NextDouble(), 10 + rng.NextDouble() });
        }

        var result = FireOpsAI.Engine.ML.KMeans.BestCluster(data.ToArray(), kMin: 2, kMax: 2);
        Assert.Equal(data.Count, result.Labels.Length);

        int labelA = FindLabel(result.Centroids, new[] { 0.1, 0.1 });
        int labelB = FindLabel(result.Centroids, new[] { 10.0, 10.0 });
        Assert.NotEqual(labelA, labelB);
    }

    [Fact]
    public void HoltWinters_ForecastFollowsTrend()
    {
        var series = new List<double>();
        for (int i = 1; i <= 24; i++) series.Add(10 + i * 0.5 + Math.Sin(i)); // trend 0.5 + seasonality

        var hw = FireOpsAI.Engine.ML.HoltWinters.Fit(series, seasonLength: 12);
        double f1 = hw.Forecast(1);
        double f3 = hw.Forecast(3);

        Assert.True(f1 > 0);
        Assert.True(f3 > f1, "further forecast should be higher on an upward trend");
        Assert.True(hw.TrainError >= 0);
    }

    [Fact]
    public void GeneticScheduler_SchedulesAllJobs()
    {
        var jobs = new List<JobCard>();
        for (int i = 1; i <= 10; i++)
            jobs.Add(new JobCard { Id = i, JobType = "Inspection", Status = JobStatus.Assigned, RequiredSkills = new[] { "inspection" }, RequiredCertifications = new[] { "SAQCC" } });

        var techs = new List<Technician>
        {
            new() { Id = 1, Name = "A", Available = true, MaxConcurrentJobs = 6, Skills = new[] { "inspection" }, Certifications = new[] { "SAQCC" } },
            new() { Id = 2, Name = "B", Available = true, MaxConcurrentJobs = 6, Skills = new[] { "inspection" }, Certifications = new[] { "SAQCC" } }
        };

        var result = GeneticScheduler.Schedule(jobs, techs);
        Assert.Equal(10, result.Count);
        Assert.All(result, a => Assert.Contains(new[] { 1, 2 }, id => id == a.TechnicianId));
    }

    [Fact]
    public void RiskModel_TrainReturnsModelForEnoughData()
    {
        var equipment = new List<Equipment>();
        for (int i = 1; i <= 10; i++)
        {
            equipment.Add(new Equipment
            {
                Id = i, Name = $"E{i}", ConditionRating = i % 5 + 1,
                NextServiceDue = DateTime.Today.AddDays(-i * 10),
                LifeSpanMonths = 120, Status = i % 4 == 0 ? "Out of Service" : "In Service"
            });
        }

        var model = FireOpsAI.Engine.ML.RiskModel.Train(equipment, DateTime.Today);
        Assert.NotNull(model);
        var risk = FireOpsAI.Engine.ML.RiskModel.ToRiskScore(model!.Predict(new double[] { 0.5, 0.3, 0.2, 0.1, 0, 0, 0, 0 }));
        Assert.InRange(risk, 0, 100);
    }

    private static int FindLabel(double[][] centroids, double[] point)
    {
        int best = 0; double bestD = double.MaxValue;
        for (int c = 0; c < centroids.Length; c++)
        {
            double d = (centroids[c][0] - point[0]) * (centroids[c][0] - point[0]) + (centroids[c][1] - point[1]) * (centroids[c][1] - point[1]);
            if (d < bestD) { bestD = d; best = c; }
        }
        return best;
    }
}