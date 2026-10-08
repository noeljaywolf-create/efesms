using FireOpsAI.Contracts;
using FireOpsAI.Models;

namespace FireOpsAI.Engine;

/// <summary>
/// Demand forecasting: performs exponential-smoothing (level + trend)
/// extrapolation with same-month year-over-year seasonal factors, then
/// derives reorder points and safety stock per inventory item.
/// </summary>
public static class DemandForecaster
{
    private const double Alpha = 0.4;   // level smoothing
    private const double Beta = 0.2;    // trend smoothing

    public static List<ForecastResult> Forecast(IEnumerable<InventoryItem> inventory)
    {
        var result = new List<ForecastResult>();

        foreach (var item in inventory)
        {
            var months = OrderedMonths(item.MonthlyUsage);
            double level = 0, trend = 0;
            double seasonalFactor = 1.0;
            double nextMonth = 0;

            var values = months.Select(m => m.Value).ToList();
            if (values.Count >= 8)
            {
                // Annual seasonality for a multi-year series -> Holt-Winters.
                var hw = Engine.ML.HoltWinters.Fit(values, seasonLength: 12);
                nextMonth = Math.Max(0, hw.Forecast(1));
                level = hw.Level;
                trend = hw.Trend;
            }
            else if (months.Count >= 2)
            {
                level = months[0].Value;
                trend = months[1].Value - months[0].Value;
                for (int i = 2; i < months.Count; i++)
                {
                    double prevLevel = level;
                    level = Alpha * months[i].Value + (1 - Alpha) * (level + trend);
                    trend = Beta * (level - prevLevel) + (1 - Beta) * trend;
                }
                seasonalFactor = SeasonalFactor(months);
            }
            else if (months.Count == 1)
            {
                level = months[0].Value;
            }

            double avg = months.Count > 0 ? months.Average(m => (double)m.Value) : 0;

            if (nextMonth <= 0 && months.Count >= 2)
            {
                // Next month forecast = smoothed level + trend, adjusted by seasonality.
                nextMonth = Math.Max(0, (level + trend) * seasonalFactor);
            }

            double leadTimeDays = Math.Max(item.LeadTimeDays, 1);
            double dailyDemand = (avg > 0 ? avg : level) / 30.0;
            double safetyStock = Math.Ceiling(dailyDemand * 7);
            double reorderPoint = dailyDemand * leadTimeDays + safetyStock;

            result.Add(new ForecastResult
            {
                ItemName = item.Name,
                ForecastNextMonth = Math.Round(nextMonth, 1),
                Trend = Math.Round(trend, 1),
                SuggestedReorderPoint = Math.Round(reorderPoint, 1),
                SafetyStock = Math.Round(safetyStock, 1)
            });
        }

        return result;
    }

    /// <summary>
    /// Seasonal factor for the next month (the month after the latest in the series):
    /// average of that calendar month across years, relative to the overall monthly average.
    /// Falls back to 1.0 when there is no history for that calendar month.
    /// </summary>
    private static double SeasonalFactor(List<(DateTime Month, double Value)> months)
    {
        var lastMonth = months[^1].Month;
        var target = lastMonth.AddMonths(1);

        double overallAvg = months.Average(m => m.Value);
        if (overallAvg <= 0) return 1.0;

        var sameMonth = months.Where(m => m.Month.Month == target.Month).Select(m => m.Value).ToList();
        if (sameMonth.Count == 0) return 1.0;

        double sameMonthAvg = sameMonth.Average();
        return Math.Clamp(sameMonthAvg / overallAvg, 0.5, 1.5);
    }

    public static List<ReorderSuggestion> SuggestOrdering(
        IEnumerable<InventoryItem> inventory,
        IEnumerable<ForecastResult> forecasts)
    {
        var forecastMap = forecasts.ToDictionary(f => f.ItemName, f => f);
        var suggestions = new List<ReorderSuggestion>();

        foreach (var item in inventory)
        {
            double reorderPoint = forecastMap.TryGetValue(item.Name, out var f)
                ? f.SuggestedReorderPoint
                : item.ReorderLevel;

            double forecastNextMonth = forecastMap.TryGetValue(item.Name, out var ff) ? ff.ForecastNextMonth : 0;

            if (item.CurrentStock >= reorderPoint) continue;

            double expectedConsumption = (forecastNextMonth > 0 ? forecastNextMonth : item.ReorderLevel) / 30.0 * item.LeadTimeDays;
            int orderQty = (int)Math.Ceiling(expectedConsumption + (reorderPoint - item.CurrentStock));
            orderQty = Math.Max(orderQty, 1);

            string urgency = item.CurrentStock <= 0
                ? "Urgent"
                : item.CurrentStock <= item.ReorderLevel * 0.4
                    ? "High"
                    : "Normal";

            double daysCovered = item.CurrentStock <= 0
                ? 0
                : (double)item.CurrentStock / Math.Max(1.0, forecastNextMonth / 30.0);

            suggestions.Add(new ReorderSuggestion
            {
                ItemId = item.Id,
                ItemName = item.Name,
                CurrentStock = item.CurrentStock,
                SuggestedOrderQty = orderQty,
                DaysRemaining = Math.Round(daysCovered, 1),
                Urgency = urgency,
                Reason = $"Stock {item.CurrentStock} below reorder point {reorderPoint:0.#}"
            });
        }

        return suggestions.OrderBy(s => UrgencyRank(s.Urgency)).ThenBy(s => s.DaysRemaining).ToList();
    }

    /// <summary>
    /// Normalises the monthly-usage dictionary (keys like "yyyy-MM" or "yyyy-M")
    /// into a chronologically ordered list of (month, qty).
    /// </summary>
    private static List<(DateTime Month, double Value)> OrderedMonths(IDictionary<string, int> usage)
    {
        var list = new List<(DateTime, double)>();
        foreach (var kv in usage)
        {
            if (TryParseMonth(kv.Key, out var month))
                list.Add((month, kv.Value));
        }
        return list.OrderBy(m => m.Item1).ToList();
    }

    private static bool TryParseMonth(string key, out DateTime month)
    {
        month = default;
        var parts = key.Split('-');
        if (parts.Length < 2) return false;
        if (parts[0].Length == 4 && int.TryParse(parts[0], out int y) &&
            int.TryParse(parts[1], out int mIdx) && mIdx is >= 1 and <= 12)
        {
            month = new DateTime(y, mIdx, 1);
            return true;
        }
        return false;
    }

    private static int UrgencyRank(string s) => s switch
    {
        "Urgent" => 0,
        "High" => 1,
        _ => 2
    };
}