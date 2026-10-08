using FireOpsAI.Contracts;
using FireOpsAI.Models;

namespace FireOpsAI.Engine;

/// <summary>
/// Smart scheduling: assigns open job cards to the best technician using
/// skill matching, workload balancing, proximity, certification validity
/// and qualifications scoring, then optimises each technician's daily
/// sequence into travel-time-aware routes using nearest-neighbour ordering
/// with same-site batching.
/// </summary>
public static class AIScheduler
{
    public static List<ScheduledAssignment> AssignJobs(
        IEnumerable<JobCard> jobs,
        IEnumerable<Technician> technicians,
        Dictionary<int, List<JobCard>>? technicianCurrentJobs = null)
    {
        var openJobs = jobs
            .Where(j => j.Status == JobStatus.Draft || j.Status == JobStatus.Assigned ||
                        j.Status == JobStatus.Scheduled || j.Status == JobStatus.InProgress)
            .ToList();

        var available = technicians.Where(t => t.Available).ToList();
        var result = new List<ScheduledAssignment>();

        if (available.Count == 0 || openJobs.Count == 0)
            return result;

        // Prefer higher-priority / overdue jobs first.
        var ranked = openJobs.OrderByDescending(j => (int)j.Priority)
                             .ThenBy(j => j.PlannedStart ?? DateTime.MaxValue)
                             .ToList();

        var weeklyLoad = available.ToDictionary(t => t.Id, t => t.CurrentJobIds?.Count ?? 0);
        if (technicianCurrentJobs != null)
        {
            foreach (var (techId, jobsList) in technicianCurrentJobs)
            {
                if (!weeklyLoad.ContainsKey(techId)) weeklyLoad[techId] = 0;
                weeklyLoad[techId] = Math.Max(weeklyLoad[techId], jobsList.Count(j =>
                    j.Status != JobStatus.Completed && j.Status != JobStatus.Closed));
            }
        }

        foreach (var job in ranked)
        {
            double best = -1;
            Technician? bestTech = null;
            double bestSkills = 0, bestWorkload = 0, bestProx = 0, bestCert = 0, bestQual = 0;

            foreach (var tech in available)
            {
                int load = weeklyLoad.ContainsKey(tech.Id) ? weeklyLoad[tech.Id] : 0;
                double capacity = tech.MaxConcurrentJobs > 0 ? tech.MaxConcurrentJobs : 4;
                if (load >= capacity) continue;

                double skillMatch = SkillMatchScore(job.RequiredSkills, tech.Skills);
                double workloadBalance = 1.0 - (load / capacity);
                double proximity = ProximityScore(job.Latitude, job.Longitude, tech.Latitude, tech.Longitude);
                double certification = CertificationScore(job.RequiredCertifications, tech, out _);
                double qualifications = QualificationScore(tech.Trade);

                double score = (0.30 * skillMatch) +
                               (0.20 * workloadBalance) +
                               (0.15 * proximity) +
                               (0.25 * certification) +
                               (0.10 * qualifications);

                if (score > best)
                {
                    best = score;
                    bestTech = tech;
                    bestSkills = skillMatch;
                    bestWorkload = workloadBalance;
                    bestProx = proximity;
                    bestCert = certification;
                    bestQual = qualifications;
                }
            }

            if (bestTech == null) continue;

            double hours = job.EstimatedHours ?? EstimateHours(job.JobType);
            var start = job.PlannedStart ?? DateTime.Today.AddDays(1);
            result.Add(new ScheduledAssignment
            {
                JobId = job.Id,
                TechnicianId = bestTech.Id,
                TechnicianName = bestTech.Name,
                Score = Math.Round(best * 100, 1),
                EstHours = Math.Round(hours, 1),
                ProposedStart = start,
                ProposedEnd = start.AddHours(hours),
                SkillMatch = Math.Round(bestSkills * 100, 1),
                WorkloadBalance = Math.Round(bestWorkload * 100, 1),
                ProximityScore = Math.Round(bestProx * 100, 1),
                CertificationScore = Math.Round(bestCert * 100, 1),
                QualificationsScore = Math.Round(bestQual * 100, 1),
                Reasons = BuildReasons(bestSkills, bestWorkload, bestProx, bestCert, bestTech.Name)
            });

            if (!weeklyLoad.ContainsKey(bestTech.Id)) weeklyLoad[bestTech.Id] = 0;
            weeklyLoad[bestTech.Id]++;
        }

        return result;
    }

    /// <summary>
    /// Builds travel-optimised daily routes per technician from a set of
    /// assignments. Groups same-site jobs, then orders stops by nearest
    /// neighbour. A technician typically works one site per day, so we
    /// cluster by (technician, site) first.
    /// </summary>
    public static List<RoutePlan> BuildRoutes(
        IEnumerable<ScheduledAssignment> assignments,
        IEnumerable<JobCard> jobs,
        IEnumerable<Technician> technicians,
        double averageSpeedKmh = 60.0,
        double fixedStopBufferHours = 0.25)
    {
        var jobMap = jobs.ToDictionary(j => j.Id);
        var techMap = technicians.ToDictionary(t => t.Id);

        // Group assignments per technician + day into route candidates.
        var clusters = new Dictionary<(int Tech, DateTime Day), List<ScheduledAssignment>>();
        foreach (var a in assignments)
        {
            var day = (a.ProposedStart ?? DateTime.Today).Date;
            var key = (a.TechnicianId, day);
            if (!clusters.ContainsKey(key)) clusters[key] = new List<ScheduledAssignment>();
            clusters[key].Add(a);
        }

        var routes = new List<RoutePlan>();
        foreach (var ((techId, day), clusterJobs) in clusters)
        {
            var tech = techMap.TryGetValue(techId, out var t) ? t : null;
            var ordered = OrderStopsByTravel(clusterJobs, jobMap);

            double cursorHours = 0;
            double totalKm = 0, travelHours = 0, workHours = 0;
            double prevLat = tech?.Latitude ?? 0, prevLon = tech?.Longitude ?? 0;
            bool first = true;

            var name = tech?.Name ?? $"Technician {techId}";
            var stops = new List<RouteStop>();

            foreach (var assignment in ordered)
            {
                var job = jobMap[assignment.JobId];
                double hours = Math.Max(assignment.EstHours, 0.25);

                double legKm = first ? 0 : AIScheduler.HaversineKm(prevLat, prevLon, job.Latitude ?? prevLat, job.Longitude ?? prevLon);
                double legHours = first ? 0 : legKm / averageSpeedKmh + fixedStopBufferHours;

                if (!first)
                {
                    cursorHours += legHours;
                    totalKm += legKm;
                    travelHours += legHours;
                }
                else
                {
                    first = false;
                }

                var start = day.AddHours(cursorHours);
                var end = start.AddHours(hours);

                stops.Add(new RouteStop
                {
                    Sequence = stops.Count + 1,
                    JobId = job.Id,
                    JobTitle = job.Title,
                    JobType = job.JobType,
                    SiteId = job.SiteId,
                    ArrivalOffsetHours = Math.Round(cursorHours, 2),
                    WorkHours = hours,
                    TravelKmFromPrev = Math.Round(legKm, 1),
                    TravelHoursFromPrev = Math.Round(legHours, 2),
                    ProposedStart = start,
                    ProposedEnd = end
                });

                cursorHours += hours;
                workHours += hours;
                prevLat = job.Latitude ?? prevLat;
                prevLon = job.Longitude ?? prevLon;
            }

            routes.Add(new RoutePlan
            {
                TechnicianId = techId,
                TechnicianName = name,
                Day = day,
                TotalTravelKm = Math.Round(totalKm, 1),
                TotalTravelHours = Math.Round(travelHours, 2),
                TotalWorkHours = Math.Round(workHours, 2),
                Stops = stops
            });
        }

        return routes.OrderBy(r => r.TechnicianName).ThenBy(r => r.Day).ToList();
    }

    private static List<ScheduledAssignment> OrderStopsByTravel(
        List<ScheduledAssignment> clusterJobs,
        Dictionary<int, JobCard> jobMap,
        Technician? tech = null)
    {
        // Nearest-neighbour ordering starting from the technician's location.
        // Same-site jobs sit at identical coordinates so they are naturally
        // batched, then ordered by priority.
        var remaining = new List<ScheduledAssignment>(clusterJobs);
        var ordered = new List<ScheduledAssignment>();
        double curLat = tech?.Latitude ?? 0, curLon = tech?.Longitude ?? 0;

        while (remaining.Count > 0)
        {
            var next = remaining
                .Select(a => new { A = a, J = jobMap[a.JobId] })
                .OrderBy(x => HaversineKm(curLat, curLon, x.J.Latitude ?? curLat, x.J.Longitude ?? curLon))
                .ThenByDescending(x => (int)(x.J.Priority))
                .First().A;
            ordered.Add(next);
            remaining.Remove(next);
            var j = jobMap[next.JobId];
            curLat = j.Latitude ?? curLat;
            curLon = j.Longitude ?? curLon;
        }

        return ordered;
    }

    private static double SkillMatchScore(IReadOnlyList<string> required, IReadOnlyList<string> have)
    {
        if (required.Count == 0) return 1.0;
        if (have.Count == 0) return 0.0;
        var haveLower = have.Select(s => s.ToLowerInvariant()).ToList();
        int matched = required.Count(r => haveLower.Contains(r.ToLowerInvariant()));
        return (double)matched / required.Count;
    }

    private static double CertificationScore(IReadOnlyList<string> required, Technician tech, out string reason)
    {
        reason = "No certs required";
        bool certExpired = tech.CertificationExpiry.HasValue && tech.CertificationExpiry.Value < DateTime.Today;
        if (certExpired)
        {
            reason = "Certification expired";
            return 0.0;
        }
        if (required.Count == 0) return 1.0;
        var have = tech.Certifications.Select(c => c.ToLowerInvariant()).ToList();
        int matched = required.Count(r => have.Contains(r.ToLowerInvariant()));
        reason = matched > 0 ? $"Matches {matched} required cert(s)" : "Missing required certification";
        return (double)matched / required.Count;
    }

    private static double QualificationScore(string trade)
    {
        var upper = trade.ToUpperInvariant();
        if (upper.Contains("SENIOR")) return 1.0;
        if (upper.Contains("MASTER") || upper.Contains("PRINCIPAL")) return 0.95;
        if (upper.Contains("LEAD") || upper.Contains("SUPERVISOR")) return 0.9;
        return 0.75;
    }

    private static double ProximityScore(double? jobLat, double? jobLon, double? techLat, double? techLon)
    {
        if (!jobLat.HasValue || !jobLon.HasValue || !techLat.HasValue || !techLon.HasValue) return 0.5;
        double km = HaversineKm(jobLat.Value, jobLon.Value, techLat.Value, techLon.Value);
        if (km <= 5) return 1.0;
        if (km <= 15) return 0.8;
        if (km <= 30) return 0.6;
        if (km <= 60) return 0.4;
        if (km <= 100) return 0.2;
        return 0.05;
    }

    public static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
    {
        const double R = 6371.0;
        double dLat = ToRad(lat2 - lat1);
        double dLon = ToRad(lon2 - lon1);
        double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                   Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2)) *
                   Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return 2 * R * Math.Asin(Math.Sqrt(a));
    }

    private static double ToRad(double deg) => deg * Math.PI / 180.0;

    private static double EstimateHours(string jobType) => jobType.ToLowerInvariant() switch
    {
        "inspection" => 1.5,
        "service" => 2.0,
        "refill" => 1.0,
        "maintenance" => 4.0,
        "installation" => 6.0,
        _ => 2.5
    };

    private static List<string> BuildReasons(double skills, double workload, double prox, double cert, string techName)
    {
        var reasons = new List<string>();
        if (skills >= 0.9) reasons.Add("Exact skill match");
        else if (skills >= 0.6) reasons.Add("Strong skill match");
        if (workload >= 0.75) reasons.Add("Available capacity");
        if (prox >= 0.8) reasons.Add("Nearby location");
        if (cert >= 0.9) reasons.Add("Certifications valid & matching");
        reasons.Insert(0, $"Best fit: {techName}");
        return reasons;
    }
}