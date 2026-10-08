using EFESMS.Api.Models;

namespace EFESMS.Api.Data;

/// <summary>
/// Seeds a small, realistic Operations dataset the first time the module runs
/// (only when the Technicians table is empty) so the AI engine has data to work with.
/// </summary>
public static class OpsSeeder
{
    public static void Seed(AppDbContext db)
    {
        if (db.Technicians.Any()) return;

        var t1 = new Technician { Name = "John Moyo", Email = "john.moyo@extreme.fire", Phone = "+263772000111", Trade = "Fire Technician", Vehicle = "EF-01 Toyota Hilux", Skills = "Extinguisher, Sprinkler, Detection", Certifications = "FPA Zimbabwe", HourlyRate = 85 };
        var t2 = new Technician { Name = "Tafadzwa Ncube", Email = "tafadzwa.ncube@extreme.fire", Phone = "+263772000222", Trade = "Sprinkler Technician", Vehicle = "EF-02 Isuzu D-Max", Skills = "Sprinkler, Hydrant, Pumps", Certifications = "BS EN 12845", HourlyRate = 95 };
        var t3 = new Technician { Name = "Rumbidzai Chikwawa", Email = "rumbi.chikwawa@extreme.fire", Phone = "+263772000333", Trade = "Gas & Extinguisher Technician", Vehicle = "EF-03 Nissan NP300", Skills = "Extinguisher, Gas, Refill", Certifications = "FPA Zimbabwe, Gas Handling", HourlyRate = 80 };
        var t4 = new Technician { Name = "Farai Dube", Email = "farai.dube@extreme.fire", Phone = "+263772000444", Trade = "Service Coordinator", Skills = "Coordination, Detection, Alarm", Certifications = "FPA Zimbabwe", HourlyRate = 70 };
        db.Technicians.AddRange(t1, t2, t3, t4);
        db.SaveChanges();

        var equipment = new List<OpsEquipment>();
        for (var i = 1; i <= 8; i++)
        {
            var cat = (i % 4) switch { 0 => "Sprinkler", 1 => "Extinguisher", 2 => "Detection", _ => "Gas" };
            var cond = 5 + (i % 4);
            equipment.Add(new OpsEquipment
            {
                EquipmentNumber = $"EQ-{i:000000}",
                Name = $"{cat} unit {i}",
                Category = cat,
                Make = cat == "Extinguisher" ? "Kidde" : cat == "Sprinkler" ? "Tyco" : cat == "Detection" ? "Notifier" : "Coretank",
                Model = $"{cat[0]}X-{100 + i}",
                AgentType = cat is "Extinguisher" or "Gas" ? "ABC Dry Powder" : null,
                InstallationDate = DateTime.UtcNow.AddMonths(-(36 + i * 7)),
                LastInspectionDate = DateTime.UtcNow.AddMonths(-(i % 4)),
                LastServiceDate = DateTime.UtcNow.AddMonths(-(i % 5)),
                NextServiceDue = DateTime.UtcNow.AddMonths((i % 3) - 1),
                ConditionRating = cond,
                LifeSpanMonths = 120,
                ServiceIntervalMonths = 6,
                Status = "In Service",
            });
        }
        db.OpsEquipment.AddRange(equipment);
        db.SaveChanges();

        db.InventoryItems.AddRange(
            new InventoryItem { Name = "6kg ABC Dry Powder Extinguisher", Category = "Extinguishers", CurrentStock = 14, ReorderLevel = 10, UnitCost = 65, Unit = "unit", LeadTimeDays = 5, MonthlyUsage = "2026-04:4;2026-05:6;2026-06:5;2026-07:7;2026-08:6;" },
            new InventoryItem { Name = "9kg ABC Dry Powder Extinguisher", Category = "Extinguishers", CurrentStock = 8, ReorderLevel = 8, UnitCost = 78, Unit = "unit", LeadTimeDays = 7, MonthlyUsage = "2026-04:3;2026-05:4;2026-06:4;2026-07:5;2026-08:4;" },
            new InventoryItem { Name = "5kg CO2 Extinguisher", Category = "Extinguishers", CurrentStock = 4, ReorderLevel = 6, UnitCost = 95, Unit = "unit", LeadTimeDays = 10, MonthlyUsage = "2026-04:2;2026-05:2;2026-06:3;2026-07:3;2026-08:3;" },
            new InventoryItem { Name = "ABC Dry Powder (kg)", Category = "Agents", CurrentStock = 220, ReorderLevel = 150, UnitCost = 3.5m, Unit = "kg", LeadTimeDays = 7, MonthlyUsage = "2026-04:40;2026-05:45;2026-06:50;2026-07:55;2026-08:60;" },
            new InventoryItem { Name = "Smoke Detector Head", Category = "Spares", CurrentStock = 30, ReorderLevel = 20, UnitCost = 22, Unit = "unit", LeadTimeDays = 7, MonthlyUsage = "2026-04:5;2026-05:6;2026-06:6;2026-07:7;2026-08:8;" }
        );
        db.SaveChanges();

        var customers = db.Customers.OrderBy(c => c.Id).Take(3).ToList();
        int? Cus(int n) => n <= customers.Count ? customers[n - 1].Id : null;

        var jobs = new List<JobCard>
        {
            new() { JobNumber = "JOB-000001", CustomerId = Cus(1), JobType = "Inspection", Title = "Annual fire inspection", Status = JobCardStatus.Scheduled, Priority = JobCardPriority.Normal, AssignedTechnicianId = t1.Id, PlannedStart = DateTime.UtcNow.AddDays(2), EstimatedHours = 3, RequiredSkills = "Extinguisher, Detection", RequiredCertifications = "FPA Zimbabwe" },
            new() { JobNumber = "JOB-000002", CustomerId = Cus(2), JobType = "Service", Title = "Sprinkler system service", Status = JobCardStatus.Assigned, Priority = JobCardPriority.High, AssignedTechnicianId = t2.Id, PlannedStart = DateTime.UtcNow.AddDays(1), EstimatedHours = 6, RequiredSkills = "Sprinkler", RequiredCertifications = "BS EN 12845" },
            new() { JobNumber = "JOB-000003", CustomerId = Cus(3), JobType = "Refill", Title = "Extinguisher refill - warehouse", Status = JobCardStatus.Draft, Priority = JobCardPriority.Normal, PlannedStart = DateTime.UtcNow.AddDays(4), EstimatedHours = 2, RequiredSkills = "Refill, Gas", RequiredCertifications = "Gas Handling" },
            new() { JobNumber = "JOB-000004", CustomerId = Cus(1), JobType = "Maintenance", Title = "Emergency lighting check", Status = JobCardStatus.InProgress, Priority = JobCardPriority.Urgent, AssignedTechnicianId = t4.Id, PlannedStart = DateTime.UtcNow.AddDays(-1), PlannedEnd = DateTime.UtcNow.AddDays(1), EstimatedHours = 4, RequiredSkills = "Detection, Alarm" },
            new() { JobNumber = "JOB-000005", CustomerId = Cus(2), JobType = "Installation", Title = "New extinguisher installs", Status = JobCardStatus.Draft, Priority = JobCardPriority.Low, PlannedStart = DateTime.UtcNow.AddDays(7), EstimatedHours = 5, RequiredSkills = "Extinguisher" },
            new() { JobNumber = "JOB-000006", CustomerId = Cus(3), JobType = "Inspection", Title = "Gas system annual check", Status = JobCardStatus.Assigned, Priority = JobCardPriority.High, AssignedTechnicianId = t3.Id, PlannedStart = DateTime.UtcNow.AddDays(3), EstimatedHours = 3, RequiredSkills = "Gas", RequiredCertifications = "Gas Handling" },
        };
        db.JobCards.AddRange(jobs);
        db.SaveChanges();

        var now = DateTime.UtcNow;
        db.OpsInspections.AddRange(
            new OpsInspection { InspectionDate = now.AddMonths(-1).AddDays(-3), EquipmentId = equipment[2].Id, CustomerId = Cus(1), Result = "Pass", Cost = 120 },
            new OpsInspection { InspectionDate = now.AddMonths(-2), EquipmentId = equipment[4].Id, CustomerId = Cus(2), Result = "Fail", Cost = 140, Findings = "Pressure gauge damaged" }
        );
        db.OpsRefills.Add(
            new OpsRefill { RefillDate = now.AddDays(-12), EquipmentId = equipment[1].Id, CustomerId = Cus(1), AgentType = "ABC Dry Powder", AgentAmountKg = 6, Cost = 55, Notes = "Routine annual refill" }
        );
        db.OpsMaintenance.Add(
            new OpsMaintenance { WorkDate = now.AddDays(-6), EquipmentId = equipment[3].Id, CustomerId = Cus(2), WorkType = "Repair", Cost = 340, Findings = "Replaced discharge valve" }
        );
        db.OpsCertifications.AddRange(
            new OpsCertification { TechnicianId = t1.Id, Name = "FPA Zimbabwe", ExpiryDate = now.AddMonths(9) },
            new OpsCertification { TechnicianId = t2.Id, Name = "BS EN 12845", ExpiryDate = now.AddMonths(6) },
            new OpsCertification { TechnicianId = t3.Id, Name = "Gas Handling", ExpiryDate = now.AddMonths(2) }
        );
        db.OpsInvoices.AddRange(
            new OpsInvoice { InvoiceNumber = "INV-000001", CustomerId = Cus(1), Amount = 1250.00m, IssueDate = now.AddDays(-20), DueDate = now.AddDays(10), Status = "Unpaid" },
            new OpsInvoice { InvoiceNumber = "INV-000002", CustomerId = Cus(2), Amount = 890.50m, IssueDate = now.AddDays(-35), DueDate = now.AddDays(-5), Status = "Overdue" },
            new OpsInvoice { InvoiceNumber = "INV-000003", CustomerId = Cus(3), Amount = 475.00m, IssueDate = now.AddDays(-60), DueDate = now.AddDays(-30), PaidDate = now.AddDays(-28), Status = "Paid" }
        );
        db.SaveChanges();
    }
}
