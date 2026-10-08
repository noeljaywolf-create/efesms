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

        // Equipment service / inspection due.
        foreach (var eq in input.Equipment)
        {
            var nextDue = eq.NextServiceDue?.Date;
            if (nextDue.HasValue)
            {
                int days = (nextDue.Value - today).Days;
                if (days is >= -7 and <= 30)
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

            if (eq.NextServiceDue == null && eq.LastInspectionDate.HasValue)
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

        // Technician certification expiry.
        foreach (var cert in input.Certifications)
        {
            int days = (cert.ExpiryDate.Date - today).Days;
            if (days is >= -1 and <= 60)
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

        // Inventory reorder.
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

        // Unpaid invoices.
        foreach (var inv in input.Invoices.Where(i => i.Status != "Paid"))
        {
            var due = inv.DueDate ?? inv.IssueDate.AddDays(30);
            int days = (due.Date - today).Days;
            if (days <= 30)
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