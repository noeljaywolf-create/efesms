using FireOpsAI.Contracts;
using FireOpsAI.Models;

namespace FireOpsAI.Engine;

/// <summary>
/// Smart reminders: generates actionable reminders for services,
/// inspections, refills, certifications, reorders and invoices.
/// </summary>
public static class SmartReminderEngine
{
    public static List<SmartReminder> Generate(EngineInput input, DateTime? now = null)
    {
        var today = (now ?? DateTime.Today).Date;
        var reminders = new List<SmartReminder>();
        var opt = input.ReminderOptions ?? new ReminderOptions();
        // Keep analytical reminder data available to dashboards and the reminder
        // register when delivery notifications are muted in Settings.
        var lead = Math.Max(0, opt.LeadDays);

        // Equipment service / inspection due (overdue always surfaces).
        foreach (var eq in input.Equipment)
        {
            var nextDue = eq.NextServiceDue?.Date;
            if (nextDue.HasValue && opt.NotifyService)
            {
                int days = (nextDue.Value - today).Days;
                if (days < 0 || days <= lead)
                    reminders.Add(new SmartReminder
                    {
                        Category = "Service",
                        Severity = days < 0 ? "High" : "Info",
                        DaysUntilDue = days,
                        Recipient = "Operations Manager",
                        Message = $"{eq.Name} ({eq.EquipmentNumber}) service " +
                                  (days < 0 ? $"was due {Math.Abs(days)}d ago (overdue)" : $"due in {days}d"),
                        DueDate = nextDue.Value,
                        EntityId = eq.Id
                    });
            }

            if (eq.NextServiceDue == null && eq.LastInspectionDate.HasValue && opt.NotifyInspection)
            {
                int daysSince = (today - eq.LastInspectionDate.Value.Date).Days;
                if (daysSince >= 300)
                    reminders.Add(new SmartReminder
                    {
                        Category = "Inspection",
                        Severity = daysSince >= 365 ? "High" : "Info",
                        DaysUntilDue = 365 - daysSince,
                        Recipient = "Operations Manager",
                        Message = $"{eq.Name} ({eq.EquipmentNumber}) inspection due in {365 - daysSince}d (last {daysSince}d ago)",
                        DueDate = eq.LastInspectionDate.Value.Date.AddDays(365),
                        EntityId = eq.Id
                    });
            }
        }

        // Technician certification expiry (overdue always surfaces).
        if (opt.NotifyCertification)
        foreach (var cert in input.Certifications)
        {
            int days = (cert.ExpiryDate.Date - today).Days;
            if (days < 0 || days <= Math.Max(lead, 30))
                reminders.Add(new SmartReminder
                {
                    Category = "Certification",
                    Severity = days < 0 ? "Critical" : days <= 30 ? "High" : "Info",
                    DaysUntilDue = days,
                    Recipient = $"Technician {cert.TechnicianId}",
                    Message = $"Certification {cert.Name} " +
                              (days < 0 ? $"expired {Math.Abs(days)}d ago" : $"expires in {days}d"),
                    DueDate = cert.ExpiryDate.Date,
                    EntityId = cert.TechnicianId
                });
        }

        // Inventory reorder (always surfaces — stock-outs can't wait).
        if (opt.NotifyInventory)
        foreach (var item in input.Inventory)
        {
            if (item.CurrentStock <= item.ReorderLevel)
                reminders.Add(new SmartReminder
                {
                    Category = "Inventory",
                    Severity = item.CurrentStock <= 0 ? "Critical" : "Info",
                    DaysUntilDue = 0,
                    Recipient = "Warehouse Manager",
                    Message = $"{item.Name} stock at {item.CurrentStock} (reorder level {item.ReorderLevel})",
                    DueDate = today,
                    EntityId = item.Id
                });
        }

        // Job card next service date reminders.
        if (opt.NotifyService)
        foreach (var job in input.Jobs.Where(j => j.NextServiceDate.HasValue))
        {
            var nextService = job.NextServiceDate.Value.Date;
            int days = (nextService - today).Days;
            if (days < 0 || days <= lead)
                reminders.Add(new SmartReminder
                {
                    Category = "Service",
                    Severity = days < 0 ? "High" : "Info",
                    DaysUntilDue = days,
                    Recipient = job.CustomerName ?? "Unknown Customer",
                    Message = $"Job {job.Number} ({job.Title ?? job.JobType}) next service " +
                              (days < 0 ? $"was due {Math.Abs(days)}d ago (overdue)" : $"due in {days}d"),
                    DueDate = nextService,
                    EntityId = job.Id
                });
        }

        // Unpaid invoices (overdue always surfaces).
        if (opt.NotifyInvoice)
        foreach (var inv in input.Invoices.Where(i => i.Status != "Paid"))
        {
            var due = inv.DueDate ?? inv.IssueDate.AddDays(30);
            int days = (due.Date - today).Days;
            if (days < 0 || days <= lead)
                reminders.Add(new SmartReminder
                {
                    Category = "Invoice",
                    Severity = days < 0 ? "High" : "Info",
                    DaysUntilDue = days,
                    Recipient = "Finance",
                    Message = inv.Status == "Overdue"
                        ? $"Invoice #{inv.Id} overdue"
                        : days < 0
                            ? $"Invoice #{inv.Id} overdue by {Math.Abs(days)}d"
                            : $"Invoice #{inv.Id} due in {days}d",
                    DueDate = due.Date,
                    EntityId = inv.Id
                });
        }

        return reminders.OrderByDescending(r => SeverityRank(r.Severity)).ThenBy(r => r.DaysUntilDue).ToList();
    }

    private static int SeverityRank(string s) => s switch
    {
        "Critical" => 3,
        "High" => 2,
        "Medium" => 1,
        _ => 0
    };
}


