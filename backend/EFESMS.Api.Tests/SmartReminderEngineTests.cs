using FireOpsAI.Contracts;
using FireOpsAI.Engine;
using Xunit;

namespace EFESMS.Api.Tests;

public class SmartReminderEngineTests
{
    [Fact]
    public void Generate_PreservesReminderDataWhenNotificationsAreMuted()
    {
        var today = new DateTime(2026, 10, 6);
        var input = new EngineInput
        {
            ReminderOptions = new ReminderOptions
            {
                Enabled = false,
                NotifyService = true,
                NotifyInspection = false,
                NotifyCertification = false,
                NotifyInventory = false,
                NotifyInvoice = false,
            },
            Equipment =
            [
                new FireOpsAI.Models.Equipment
                {
                    Id = 12,
                    Name = "2.5kg DCP extinguisher",
                    EquipmentNumber = "EQ-000012",
                    NextServiceDue = today.AddDays(-2),
                },
            ],
        };

        // Muting alerts should not make the dashboard report zero due services.
        var reminder = Assert.Single(SmartReminderEngine.Generate(input, today));
        Assert.Equal("Service", reminder.Category);
        Assert.Equal(-2, reminder.DaysUntilDue);
    }
}
