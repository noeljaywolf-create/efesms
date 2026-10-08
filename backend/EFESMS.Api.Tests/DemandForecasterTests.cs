using FireOpsAI.Engine;
using FireOpsAI.Models;
using Xunit;

namespace EFESMS.Api.Tests;

public class DemandForecasterTests
{
    [Fact]
    public void Forecast_UsesConfiguredReorderLevel_WhenUsageHistoryIsEmpty()
    {
        var item = new InventoryItem
        {
            Id = 17,
            Name = "No history extinguisher",
            CurrentStock = 0,
            ReorderLevel = 5,
            MonthlyUsage = new Dictionary<string, int>(),
        };

        var forecast = DemandForecaster.Forecast([item]).Single();
        var suggestions = DemandForecaster.SuggestOrdering([item], [forecast]);

        // Missing history must not make an empty shelf look safe to the AI.
        Assert.Equal(5, forecast.SuggestedReorderPoint);
        var suggestion = Assert.Single(suggestions);
        Assert.Equal(item.Id, suggestion.ItemId);
        Assert.Equal("Urgent", suggestion.Urgency);
        Assert.True(suggestion.SuggestedOrderQty > 0);
    }

    [Fact]
    public void SuggestOrdering_DoesNotOrder_WhenStockMeetsConfiguredMinimum()
    {
        var item = new InventoryItem
        {
            Id = 18,
            Name = "Healthy stock extinguisher",
            CurrentStock = 5,
            ReorderLevel = 5,
            MonthlyUsage = new Dictionary<string, int>(),
        };

        var forecast = DemandForecaster.Forecast([item]);

        Assert.Empty(DemandForecaster.SuggestOrdering([item], forecast));
    }
}
