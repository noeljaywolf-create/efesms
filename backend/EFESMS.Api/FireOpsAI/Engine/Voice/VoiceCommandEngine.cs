using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using FireOpsAI.Contracts;
using FireOpsAI.Models;

namespace FireOpsAI.Engine;

public static class VoiceCommandEngine
{
    private static readonly string[] HelpKeywords = { "help", "what can you", "how do", "commands", "what do you", "options", "list" };
    private static readonly string[] GreetingKeywords = { "hello", "hi", "hey", "good morning", "good afternoon", "good evening" };
    private static readonly string[] ThanksKeywords = { "thanks", "thank you", "great", "awesome", "cool", "perfect", "good job" };
    private static readonly string[] SummaryKeywords = { "summary", "overview", "dashboard", "how is everything", "how is it going", "status report", "report", "how are things", "quick report" };
    private static readonly string[] HighRiskKeywords = { "high risk", "at risk", "at-risk", "risky", "worst", "priority list", "needs attention", "attention", "urgent equipment", "critical equipment" };
    private static readonly string[] AnomalyKeywords = { "anomaly", "anomalies", "problem", "problems", "issue", "issues", "alert", "alerts", "wrong", "abnormal", "suspicious", "anything odd", "anything unusual" };
    private static readonly string[] ReorderKeywords = { "reorder", "restock", "stock", "low stock", "inventory", "what should i order", "order supplies", "buy", "supplies", "parts" };
    private static readonly string[] ScheduleKeywords = { "schedule", "today", "jobs today", "assigned", "route", "routes", "who is working", "plan", "planned", "work load", "workload" };
    private static readonly string[] EquipmentIntents = { "equipment", "extinguisher", "sprinkler", "hose", "hose reel", "pump", "alarm", "cylinder", "hydrant", "detector", "fire system", "unit" };
    private static readonly string[] SiteIntents = { "site", "building", "tower", "plant", "mall", "depot", "station", "premises", "location" };
    private static readonly string[] EquipmentWords = { "equipment", "extinguisher", "sprinkler", "hose", "pump", "alarm", "cylinder", "hydrant", "detector", "unit", "system", "device" };

    public static VoiceReply Process(string text, EngineInput input, EngineOutput? output = null)
    {
        var normalized = Normalize(text);
        var tokens = Tokenize(normalized);

        if (tokens.Count == 0)
            return Reply(VoiceIntent.Unknown, "I did not catch that. Ask me about equipment, risk, stock, or today's schedule.", 0.9);

        var equipmentMatch = ResolveEquipment(normalized, tokens, input.Equipment);
        var siteMatch = ResolveSite(normalized, tokens, input.Sites);

        if (equipmentMatch.Item2 > 0)
            return EquipmentStatusReply(equipmentMatch.Item1!, equipmentMatch.Item2, input, output);

        if (siteMatch.Item2 > 0)
            return SiteStatusReply(siteMatch.Item1!, siteMatch.Item2, input, output);

        var scores = new Dictionary<VoiceIntent, double>();
        scores[VoiceIntent.Help] = Score(normalized, HelpKeywords);
        scores[VoiceIntent.Greeting] = Score(normalized, GreetingKeywords);
        scores[VoiceIntent.Thanks] = Score(normalized, ThanksKeywords);
        scores[VoiceIntent.Summary] = Score(normalized, SummaryKeywords);
        scores[VoiceIntent.HighRisk] = Math.Max(Score(normalized, HighRiskKeywords), Score(normalized, new[] { "risk" }));
        scores[VoiceIntent.Anomalies] = Score(normalized, AnomalyKeywords);
        scores[VoiceIntent.Reorders] = Math.Max(Score(normalized, ReorderKeywords), Score(normalized, new[] { "reorder", "stock" }));
        scores[VoiceIntent.Schedule] = Math.Max(Score(normalized, ScheduleKeywords), Score(normalized, new[] { "today" }));
        scores[VoiceIntent.EquipmentStatus] = Score(normalized, EquipmentIntents);
        scores[VoiceIntent.SiteStatus] = Score(normalized, SiteIntents);

        var best = scores.OrderByDescending(kv => kv.Value).First();
        if (best.Key == VoiceIntent.Thanks && best.Value >= 1)
            return Reply(VoiceIntent.Thanks, "You are welcome. Let me know if you need anything else.", 0.9);

        if (best.Key == VoiceIntent.EquipmentStatus && HasRiskIntent(normalized, tokens))
            best = new KeyValuePair<VoiceIntent, double>(VoiceIntent.HighRisk, best.Value);

        if (best.Value <= 0)
            return Reply(VoiceIntent.Unknown,
                "I can answer questions like: how is everything, which equipment has high risk, are there any problems, what should I reorder, and what is the schedule today.",
                Math.Max(0.4, SentenceOverlap(normalized)));

        return best.Key switch
        {
            VoiceIntent.Help => HelpReply(),
            VoiceIntent.Greeting => Reply(VoiceIntent.Greeting, "Hello. This is FireOps AI voice assistant. Ask me about your fire protection systems.", 0.98),
            VoiceIntent.Summary => SummaryReply(input, output),
            VoiceIntent.HighRisk => HighRiskReply(input, output),
            VoiceIntent.Anomalies => AnomaliesReply(output),
            VoiceIntent.Reorders => ReordersReply(output),
            VoiceIntent.Schedule => ScheduleReply(output),
            VoiceIntent.EquipmentStatus => EquipmentFallbackReply(input, output),
            VoiceIntent.SiteStatus => SitesFallbackReply(input, output),
            _ => Reply(VoiceIntent.Unknown, "I did not understand that. Say help to hear what I can do.", 0.5)
        };
    }

    private static VoiceReply HelpReply()
    {
        return Reply(VoiceIntent.Help,
            "Here is what I can do. Ask how is everything for a quick report. Say which equipment is at risk, or ask about a specific unit. Say any problems to hear the latest alerts. Say what should I reorder to restock. And say what is the schedule to hear today's jobs.",
            1.0);
    }

    private static string Normalize(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return "";
        var lowered = text.ToLowerInvariant();
        lowered = Regex.Replace(lowered, @"[^a-z0-9\s\-]", " ");
        lowered = Regex.Replace(lowered, @"\s+", " ").Trim();
        return lowered;
    }

    private static List<string> Tokenize(string normalized) =>
        normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToList();

    private static double Score(string normalized, string[] keywords)
    {
        double total = 0;
        foreach (var k in keywords)
        {
            if (k.Contains(' ') ? normalized.Contains(k) : HasToken(normalized, k))
                total += k.Length / 4.0;
        }
        return total;
    }

    private static bool HasToken(string normalized, string token) =>
        normalized.Split(' ').Any(t => t == token || t.StartsWith(token, StringComparison.Ordinal) && token.Length >= 4);

    private static bool HasRiskIntent(string normalized, List<string> tokens)
    {
        return normalized.Contains("risk") || normalized.Contains("critical") || normalized.Contains("urgent") || tokens.Contains("attention");
    }

    private static (Equipment?, double) ResolveEquipment(string normalized, List<string> tokens, IReadOnlyList<Equipment> equipment)
    {
        double bestScore = 0; Equipment? best = null;
        foreach (var e in equipment)
        {
            double s = 0;
            if (e.EquipmentNumber != null && normalized.Contains(e.EquipmentNumber.ToLowerInvariant()))
                s += 4.0;
            var nameTokens = Tokenize(Normalize(e.Name));
            var matched = nameTokens.Count(t => tokens.Contains(t));
            if (matched > 0) s += matched * 1.5;
            if (s > bestScore) { bestScore = s; best = e; }
        }
        return (best, bestScore);
    }

    private static (Site?, double) ResolveSite(string normalized, List<string> tokens, IReadOnlyList<Site> sites)
    {
        double bestScore = 0; Site? best = null;
        foreach (var s in sites)
        {
            double score = 0;
            var nameTokens = Tokenize(Normalize(s.Name));
            var matched = nameTokens.Count(t => tokens.Contains(t));
            if (matched > 0) score += matched * 2.0;
            if (score > bestScore) { bestScore = score; best = s; }
        }
        return (best, bestScore);
    }

    private static VoiceReply EquipmentStatusReply(Equipment eq, double score, EngineInput input, EngineOutput? output)
    {
        var text = $"{eq.Name}";
        var data = new Dictionary<string, object>
        {
            ["equipmentId"] = eq.Id,
            ["equipmentNumber"] = eq.EquipmentNumber ?? "",
            ["name"] = eq.Name,
            ["status"] = eq.Status
        };

        if (output != null)
        {
            var a = output.RiskAssessments.FirstOrDefault(x => x.EquipmentId == eq.Id);
            if (a != null)
            {
                data["riskScore"] = Math.Round(a.RiskScore);
                data["severity"] = a.Severity;
                data["recommendedAction"] = a.RecommendedAction;
                data["remainingUsefulLifeMonths"] = a.RemainingUsefulLifeMonths;
                data["daysOverdueService"] = a.DaysOverdueService;
                var overdueNote = a.DaysOverdueService > 0 ? $", it is {a.DaysOverdueService} days overdue for service" : "";
                return Reply(VoiceIntent.EquipmentStatus,
                    $"{eq.Name}, number {eq.EquipmentNumber ?? "not set"}, risk score {Math.Round(a.RiskScore)} out of a hundred, rated {a.Severity.ToLowerInvariant()} risk. Remaining useful life about {a.RemainingUsefulLifeMonths} months{overdueNote}. Suggested action: {a.RecommendedAction}. Current status {eq.Status.Split(' ')[0]}.",
                    Math.Min(0.98, 0.7 + score / 6), data);
            }
        }

        var daysOverdue = 0;
        if (eq.NextServiceDue.HasValue)
            daysOverdue = (int)(DateTime.Today.Date - eq.NextServiceDue.Value.Date).TotalDays;
        data["daysOverdueService"] = daysOverdue;
        data["nextServiceDue"] = eq.NextServiceDue?.ToString("yyyy-MM-dd") ?? "";
        return Reply(VoiceIntent.EquipmentStatus,
            $"{eq.Name}, number {eq.EquipmentNumber ?? "not set"}, is currently {eq.Status}. " +
            (daysOverdue > 0 ? $"It is {daysOverdue} days overdue for service." : "It is within its service window."),
            Math.Min(0.96, 0.65 + score / 6), data);
    }

    private static VoiceReply SiteStatusReply(Site site, double score, EngineInput input, EngineOutput? output)
    {
        var data = new Dictionary<string, object> { ["siteId"] = site.Id, ["siteName"] = site.Name };
        if (output != null)
        {
            var r = output.SiteRisks.FirstOrDefault(x => x.SiteId == site.Id);
            if (r != null)
            {
                data["riskScore"] = Math.Round(r.RiskScore);
                data["severity"] = r.Severity;
                data["equipmentAtRisk"] = r.EquipmentAtRisk;
                data["overdueInspections"] = r.OverdueInspections;
                return Reply(VoiceIntent.SiteStatus,
                    $"{site.Name} has a risk score of {Math.Round(r.RiskScore)} out of a hundred, rated {r.Severity.ToLowerInvariant()} risk, with {r.EquipmentAtRisk} equipment at risk and {r.OverdueInspections} overdue inspections. {r.RecommendedAction}.",
                    Math.Min(0.98, 0.6 + score / 5), data);
            }
        }

        var count = input.Equipment.Count(e => e.SiteId == site.Id);
        data["equipmentCount"] = count;
        return Reply(VoiceIntent.SiteStatus,
            $"{site.Name} has {count} registered fire safety units. Say ask for a full analysis to see site risk.",
            Math.Min(0.95, 0.5 + score / 5), data);
    }

    private static VoiceReply SummaryReply(EngineInput input, EngineOutput? output)
    {
        var data = new Dictionary<string, object>
        {
            ["equipmentTotal"] = input.Equipment.Count,
            ["jobsTotal"] = input.Jobs.Count,
            ["sitesTotal"] = input.Sites.Count,
            ["techniciansTotal"] = input.Technicians.Count
        };
        if (output != null)
        {
            var highRisk = output.RiskAssessments.Count(a => a.RiskScore >= 70);
            var criticalAnom = output.Anomalies.Count(a => a.Severity == "Critical");
            var reorderCount = output.Reorders.Count;
            data["highRisk"] = highRisk;
            data["criticalAnomalies"] = criticalAnom;
            data["reorders"] = reorderCount;
            return Reply(VoiceIntent.Summary,
                $"Here is the report. You manage {input.Equipment.Count} equipment units across {input.Sites.Count} sites, with {input.Jobs.Count} active job cards and {input.Technicians.Count} technicians. {highRisk} units are flagged high risk, {criticalAnom} critical alerts right now, and {reorderCount} items need reordering.",
                0.96, data);
        }
        return Reply(VoiceIntent.Summary,
            $"You manage {input.Equipment.Count} equipment units across {input.Sites.Count} sites, with {input.Jobs.Count} active job cards. Run a full analysis for the detailed risk view.",
            0.8, data);
    }

    private static VoiceReply HighRiskReply(EngineInput input, EngineOutput? output)
    {
        if (output == null || output.RiskAssessments.Count == 0)
            return Reply(VoiceIntent.HighRisk, "I need a risk analysis to answer that. Refresh the analysis first.", 0.9);

        var top = output.RiskAssessments.OrderByDescending(a => a.RiskScore).Take(3).ToList();
        var data = new Dictionary<string, object>
        {
            ["top"] = top.Select(a => new Dictionary<string, object>
            {
                ["name"] = a.Name,
                ["riskScore"] = Math.Round(a.RiskScore),
                ["severity"] = a.Severity,
                ["recommendedAction"] = a.RecommendedAction
            }).ToList<object>()
        };
        var spoken = top.Count == 0
            ? "No equipment is currently flagged at risk."
            : "Top risk units: " + string.Join(", ", top.Select(a =>
                $"{a.Name} at {Math.Round(a.RiskScore)} percent. Action: {a.RecommendedAction}"));
        return Reply(VoiceIntent.HighRisk, spoken, 0.97, data);
    }

    private static VoiceReply AnomaliesReply(EngineOutput? output)
    {
        if (output == null || output.Anomalies.Count == 0)
            return Reply(VoiceIntent.Anomalies, "I found no anomalies in the latest scan.", 0.9);

        var critical = output.Anomalies.Where(a => a.Severity == "Critical").ToList();
        var top = output.Anomalies.OrderByDescending(a => a.Severity).ThenByDescending(a => a.Confidence).Take(3).ToList();
        var data = new Dictionary<string, object>
        {
            ["total"] = output.Anomalies.Count,
            ["critical"] = critical.Count,
            ["top"] = top.Select(a => new Dictionary<string, object>
            {
                ["severity"] = a.Severity,
                ["description"] = a.Description
            }).ToList<object>()
        };
        var spoken = output.Anomalies.Count == 0
            ? "No anomalies detected."
            : $"I found {output.Anomalies.Count} alerts, including {critical.Count} critical. {string.Join(" ", top.Select(a => a.Description + "."))}";
        return Reply(VoiceIntent.Anomalies, spoken, 0.96, data);
    }

    private static VoiceReply ReordersReply(EngineOutput? output)
    {
        if (output == null || output.Reorders.Count == 0)
            return Reply(VoiceIntent.Reorders, "No items need reordering right now.", 0.9);

        var top = output.Reorders.OrderByDescending(r => r.Urgency == "Urgent").ThenByDescending(r => r.SuggestedOrderQty).Take(3).ToList();
        var data = new Dictionary<string, object>
        {
            ["total"] = output.Reorders.Count,
            ["items"] = top.Select(r => new Dictionary<string, object>
            {
                ["name"] = r.ItemName,
                ["currentStock"] = r.CurrentStock,
                ["suggestedOrderQty"] = r.SuggestedOrderQty,
                ["urgency"] = r.Urgency
            }).ToList<object>()
        };
        var spoken = "Recommended reorders: " + string.Join(", ", top.Select(r =>
            $"{r.SuggestedOrderQty} of {r.ItemName}, current stock {r.CurrentStock}. Rating {r.Urgency.ToLowerInvariant()}"));
        return Reply(VoiceIntent.Reorders, spoken, 0.97, data);
    }

    private static VoiceReply ScheduleReply(EngineOutput? output)
    {
        if (output == null)
            return Reply(VoiceIntent.Schedule, "I need the schedule to answer that. Refresh the analysis first.", 0.9);

        var byDay = output.Assignments.OrderBy(a => a.ProposedStart ?? DateTime.MaxValue).Take(5).ToList();
        var today = DateTime.Today.Date;
        var todays = byDay.Where(a => (a.ProposedStart ?? DateTime.MinValue).Date == today && byDay.Count > 1).ToList();
        var shown = todays.Count > 0 ? todays : byDay;

        var data = new Dictionary<string, object>
        {
            ["total"] = output.Assignments.Count,
            ["items"] = shown.Select(a => new Dictionary<string, object>
            {
                ["jobId"] = a.JobId,
                ["technicianName"] = a.TechnicianName,
                ["date"] = a.ProposedStart?.ToString("yyyy-MM-dd") ?? "unscheduled"
            }).ToList<object>()
        };

        if (shown.Count == 0)
            return Reply(VoiceIntent.Schedule, "No jobs are scheduled yet.", 0.9, data);

        var spoken = shown.Count == 1
            ? $"The plan has {shown[0].TechnicianName} on job {shown[0].JobId} for {shown[0].ProposedStart?.ToString("MMMM d") ?? "an unplanned date"}."
            : $"The current plan has {shown.Count} assignments. " + string.Join(" ", shown.Take(3).Select(a =>
                $"{a.TechnicianName} handles job {a.JobId} on {a.ProposedStart?.ToString("MMMM d") ?? "an unplanned date"}."));
        return Reply(VoiceIntent.Schedule, spoken, 0.95, data);
    }

    private static VoiceReply EquipmentFallbackReply(EngineInput input, EngineOutput? output)
    {
        if (input.Equipment.Count == 0)
            return Reply(VoiceIntent.EquipmentStatus, "There is no equipment registered.", 0.9);
        var any = input.Equipment.First();
        return EquipmentStatusReply(any, 1, input, output);
    }

    private static VoiceReply SitesFallbackReply(EngineInput input, EngineOutput? output)
    {
        if (input.Sites.Count == 0)
            return Reply(VoiceIntent.SiteStatus, "There are no sites registered.", 0.9);
        var any = input.Sites.First();
        return SiteStatusReply(any, 1, input, output);
    }

    private static VoiceReply Reply(VoiceIntent intent, string text, double confidence, Dictionary<string, object>? data = null)
    {
        return new VoiceReply
        {
            Intent = intent,
            IntentName = intent.ToString(),
            ReplyText = text,
            Confidence = Math.Clamp(confidence, 0, 1),
            Data = data ?? new Dictionary<string, object>()
        };
    }

    private static double SentenceOverlap(string normalized)
    {
        var known = new[] { "equipment", "risk", "stock", "stock level", "schedule", "site", "order", "problem" };
        return known.Count(normalized.Contains) * 0.1;
    }
}