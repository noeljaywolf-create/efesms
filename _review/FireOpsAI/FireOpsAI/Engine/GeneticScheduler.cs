using FireOpsAI.Contracts;
using FireOpsAI.Models;

namespace FireOpsAI.Engine;

/// <summary>
/// Genetic algorithm scheduler: evolves populations of (job → technician)
/// assignment chromosomes to converge on high-quality schedules. Fitness
/// blends skill match, certification validity, workload balance and
/// proximity, with heavy penalties for missing skills or expired certs.
/// The best chromosome is decoded into ScheduledAssignment items.
/// </summary>
public static class GeneticScheduler
{
    private readonly record struct FitnessBreakdown(double Score, double Skill, double Cert, double Load, double Prox);

    public static List<ScheduledAssignment> Schedule(
        IEnumerable<JobCard> jobs,
        IEnumerable<Technician> technicians,
        int populationSize = 60,
        int generations = 80,
        int eliteCount = 4,
        double mutationRate = 0.08,
        int seed = 42)
    {
        var jobList = jobs.ToList();
        var techList = technicians.ToList();
        if (jobList.Count == 0 || techList.Count == 0) return new List<ScheduledAssignment>();
        if (techList.Count == 1)
            return AssignAllToSingle(jobList, techList[0]);

        var rng = new Random(seed);
        int J = jobList.Count;
        int T = techList.Count;

        // Co-evolve: population of chromosomes, each length J of tech index (-1 = unassigned).
        var population = new int[populationSize][];
        for (int p = 0; p < populationSize; p++)
        {
            population[p] = new int[J];
            for (int j = 0; j < J; j++)
                population[p][j] = rng.Next(T); // random but valid
        }

        // Precompute per (job,tech) score components for speed.
        var scoreCache = new double[J][];
        var skillCache = new double[J][];
        var certCache = new double[J][];
        for (int j = 0; j < J; j++)
        {
            scoreCache[j] = new double[T];
            skillCache[j] = new double[T];
            certCache[j] = new double[T];
            for (int t = 0; t < T; t++)
            {
                var (score, skill, cert, _) = BreakDown(jobList[j], techList[t]);
                scoreCache[j][t] = score;
                skillCache[j][t] = skill;
                certCache[j][t] = cert;
            }
        }

        double[] fitness = new double[populationSize];
        for (int gen = 0; gen < generations; gen++)
        {
            for (int p = 0; p < populationSize; p++)
                fitness[p] = Fitness(population[p], J, T, scoreCache, skillCache, certCache, techList);

            var next = new int[populationSize][];

            // Elitism: carry the best forward untouched.
            var eliteIdx = fitness
                .Select((f, i) => (f, i))
                .OrderByDescending(x => x.f)
                .Take(eliteCount)
                .Select(x => x.i)
                .ToArray();
            for (int e = 0; e < eliteCount; e++)
                next[e] = (int[])population[eliteIdx[e]].Clone();

            for (int p = eliteCount; p < populationSize; p++)
            {
                var parent1 = TournamentSelect(population, fitness, rng);
                var parent2 = TournamentSelect(population, fitness, rng);
                var child = Crossover(parent1, parent2, rng);
                Mutate(child, T, mutationRate, rng);
                next[p] = child;
            }
            population = next;
        }

        // Decode best.
        double bestFit = double.MinValue;
        int[]? bestGenome = null;
        for (int p = 0; p < population.Length; p++)
        {
            double f = fitness[p];
            // Final fitness pass uses latest population.
            f = Fitness(population[p], J, T, scoreCache, skillCache, certCache, techList);
            if (f > bestFit) { bestFit = f; bestGenome = population[p]; }
        }

        if (bestGenome == null) return new List<ScheduledAssignment>();

        var result = new List<ScheduledAssignment>();
        var dailyLoad = new int[T];
        for (int j = 0; j < J; j++)
        {
            int tIdx = bestGenome[j];
            if (tIdx < 0 || tIdx >= T) continue;
            var job = jobList[j];
            var tech = techList[tIdx];

            dailyLoad[tIdx]++;
            if (dailyLoad[tIdx] > Math.Max(1, tech.MaxConcurrentJobs)) continue;

            double hours = job.EstimatedHours ?? EstimateHours(job.JobType);
            var (score, _, _, _) = BreakDown(job, tech);
            var start = job.PlannedStart ?? DateTime.Today.AddDays(1);

            result.Add(new ScheduledAssignment
            {
                JobId = job.Id,
                TechnicianId = tech.Id,
                TechnicianName = tech.Name,
                Score = Math.Round(score * 100, 1),
                EstHours = Math.Round(hours, 1),
                ProposedStart = start,
                ProposedEnd = start.AddHours(hours),
                SkillMatch = Math.Round(skillCache[j][tIdx] * 100, 1),
                CertificationScore = Math.Round(certCache[j][tIdx] * 100, 1),
                QualificationsScore = Math.Round(QualificationScore(tech.Trade) * 100, 1),
                WorkloadBalance = Math.Round(0.0, 1),
                ProximityScore = Math.Round(ProxScore(job, tech) * 100, 1),
                Reasons = BuildReasons(skillCache[j][tIdx], certCache[j][tIdx], tech.Name)
            });
        }
        return result;
    }

    private static (double Score, double Skill, double Cert, double Load) BreakDown(JobCard job, Technician tech)
    {
        double skill = SkillMatchScore(job.RequiredSkills, tech.Skills);
        double cert = CertValid(job.RequiredCertifications, tech);
        double load = 1.0; // per-job base; load handled statistically in Fitness
        double prox = ProxScore(job, tech);
        double qual = QualificationScore(tech.Trade);
        double score = (0.30 * skill) + (0.20 * load) + (0.15 * prox) + (0.25 * cert) + (0.10 * qual);
        return (score, skill, cert, load);
    }

    private static double Fitness(
        int[] genome, int J, int T,
        double[][] scoreCache, double[][] skillCache, double[][] certCache,
        List<Technician> techs)
    {
        double total = 0;
        var loads = new int[T];
        for (int j = 0; j < J; j++)
        {
            int t = genome[j];
            if (t < 0 || t >= T) { total -= 50; continue; } // unassigned penalty
            loads[t]++;
            total += scoreCache[j][t] * 100;
            // Penalize skill gaps hard.
            if (skillCache[j][t] < 1.0) total -= 15;
            if (certCache[j][t] < 1.0) total -= 25;
        }
        for (int t = 0; t < T; t++)
        {
            int max = Math.Max(1, techs[t].MaxConcurrentJobs);
            if (loads[t] > max) total -= 40 * (loads[t] - max);
        }
        return total;
    }

    private static int[] TournamentSelect(int[][] population, double[] fitness, Random rng)
    {
        int size = population.Length;
        int best = rng.Next(size);
        for (int i = 0; i < 3; i++)
        {
            int c = rng.Next(size);
            if (fitness[c] > fitness[best]) best = c;
        }
        return population[best];
    }

    private static int[] Crossover(int[] a, int[] b, Random rng)
    {
        var child = new int[a.Length];
        for (int i = 0; i < a.Length; i++)
            child[i] = rng.NextDouble() < 0.5 ? a[i] : b[i];
        return child;
    }

    private static void Mutate(int[] genome, int T, double rate, Random rng)
    {
        for (int i = 0; i < genome.Length; i++)
        {
            if (rng.NextDouble() < rate)
                genome[i] = rng.Next(T); // assign different tech
        }
    }

    private static List<ScheduledAssignment> AssignAllToSingle(List<JobCard> jobs, Technician tech)
    {
        var result = new List<ScheduledAssignment>();
        var start = DateTime.Today.AddDays(1);
        foreach (var job in jobs.Take(Math.Max(1, tech.MaxConcurrentJobs)))
        {
            double hours = job.EstimatedHours ?? EstimateHours(job.JobType);
            var (score, _, _, _) = BreakDown(job, tech);
            result.Add(new ScheduledAssignment
            {
                JobId = job.Id, TechnicianId = tech.Id, TechnicianName = tech.Name,
                Score = Math.Round(score * 100, 1), EstHours = Math.Round(hours, 1),
                ProposedStart = start, ProposedEnd = start.AddHours(hours),
                SkillMatch = Math.Round(SkillMatchScore(job.RequiredSkills, tech.Skills) * 100, 1),
                CertificationScore = Math.Round(CertValid(job.RequiredCertifications, tech) * 100, 1),
                QualificationsScore = Math.Round(QualificationScore(tech.Trade) * 100, 1),
                WorkloadBalance = 100, ProximityScore = 100,
                Reasons = BuildReasons(SkillMatchScore(job.RequiredSkills, tech.Skills), CertValid(job.RequiredCertifications, tech), tech.Name)
            });
            start = start.AddHours(hours + 0.5);
        }
        return result;
    }

    private static List<string> BuildReasons(double skill, double cert, string techName)
    {
        var reasons = new List<string>();
        if (skill >= 0.9) reasons.Add("Exact skill match");
        else if (skill >= 0.6) reasons.Add("Strong skill match");
        else reasons.Add("Partial skill match");
        if (cert >= 0.9) reasons.Add("Certifications valid");
        reasons.Insert(0, $"Evolved best-fit: {techName}");
        return reasons;
    }

    private static double SkillMatchScore(IReadOnlyList<string> required, IReadOnlyList<string> have)
    {
        if (required.Count == 0) return 1.0;
        if (have.Count == 0) return 0.0;
        var haveLower = have.Select(s => s.ToLowerInvariant()).ToList();
        return (double)required.Count(r => haveLower.Contains(r.ToLowerInvariant())) / required.Count;
    }

    private static double CertValid(IReadOnlyList<string> required, Technician tech)
    {
        bool expired = tech.CertificationExpiry.HasValue && tech.CertificationExpiry.Value < DateTime.Today;
        if (expired) return 0.0;
        if (required.Count == 0) return 1.0;
        var have = tech.Certifications.Select(c => c.ToLowerInvariant()).ToList();
        return (double)required.Count(r => have.Contains(r.ToLowerInvariant())) / required.Count;
    }

    private static double QualificationScore(string trade)
    {
        var upper = trade.ToUpperInvariant();
        if (upper.Contains("SENIOR")) return 1.0;
        if (upper.Contains("MASTER") || upper.Contains("PRINCIPAL")) return 0.95;
        if (upper.Contains("LEAD") || upper.Contains("SUPERVISOR")) return 0.9;
        return 0.75;
    }

    private static double ProxScore(JobCard job, Technician tech)
    {
        if (!job.Latitude.HasValue || !job.Longitude.HasValue || !tech.Latitude.HasValue || !tech.Longitude.HasValue) return 0.5;
        double km = AIScheduler.HaversineKm(job.Latitude.Value, job.Longitude.Value, tech.Latitude.Value, tech.Longitude.Value);
        if (km <= 5) return 1.0;
        if (km <= 15) return 0.8;
        if (km <= 30) return 0.6;
        if (km <= 60) return 0.4;
        if (km <= 100) return 0.2;
        return 0.05;
    }

    private static double EstimateHours(string jobType) => jobType.ToLowerInvariant() switch
    {
        "inspection" => 1.5,
        "service" => 2.0,
        "refill" => 1.0,
        "maintenance" => 4.0,
        "installation" => 6.0,
        _ => 2.5
    };
}