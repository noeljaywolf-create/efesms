using System;

namespace FireOpsAI.Engine.ML;

/// <summary>
/// Holt-Winters (triple exponential smoothing) with multiplicative seasonality.
/// Fits alpha/beta/gamma by grid search minimising in-sample one-step error.
/// Pure C#, no external dependencies.
/// </summary>
public sealed class HoltWinters
{
    public double Alpha { get; private set; } = 0.3;
    public double Beta { get; private set; } = 0.1;
    public double Gamma { get; private set; } = 0.3;
    public int SeasonLength { get; private set; } = 12;
    public double Level { get; private set; }
    public double Trend { get; private set; }
    public double[]? Seasonals { get; private set; }
    public double TrainError { get; private set; }

    public static HoltWinters Fit(IReadOnlyList<double> values, int seasonLength = 12)
    {
        if (values == null || values.Count == 0)
            throw new ArgumentException("Empty series.");

        int n = values.Count;
        int m = Math.Min(seasonLength, n);
        if (m < 1) m = 1;

        double bestErr = double.MaxValue;
        double bestA = 0.3, bestB = 0.1, bestG = 0.3;
        double bestLevel = 0, bestTrend = 0;
        double[]? bestSeasonals = null;

        // Grid search over smoothing parameters.
        for (double a = 0.2; a <= 0.8 + 1e-9; a += 0.1)
        {
            for (double b = 0.0; b <= 0.4 + 1e-9; b += 0.1)
            {
                for (double g = 0.0; g <= 0.6 + 1e-9; g += 0.1)
                {
                    var (level, trend, seasonals, err) = Run(values, m, a, b, g);
                    if (err < bestErr)
                    {
                        bestErr = err;
                        bestA = a; bestB = b; bestG = g;
                        bestLevel = level; bestTrend = trend; bestSeasonals = seasonals;
                    }
                }
            }
        }

        return new HoltWinters
        {
            Alpha = bestA, Beta = bestB, Gamma = bestG,
            SeasonLength = m,
            Level = bestLevel, Trend = bestTrend,
            Seasonals = bestSeasonals ?? Array.Empty<double>(),
            TrainError = bestErr
        };
    }

    private static (double Level, double Trend, double[] Seasonals, double Err)
        Run(IReadOnlyList<double> values, int m, double a, double b, double g)
    {
        int n = values.Count;
        double level = values.Take(m).Average();
        var season = new double[m];
        for (int i = 0; i < m && i < n; i++) season[i] = Math.Max(values[i], 1e-6) / Math.Max(level, 1e-6);
        double trend = n > m ? (values[n - 1] - values[0]) / (double)(n - 1) : 0;

        double err = 0;
        for (int t = m; t < n; t++)
        {
            double prevLevel = level;
            double sIndex = season[t % m];
            double fit = (level + trend) * sIndex;
            err += (values[t] - fit) * (values[t] - fit);

            level = a * (values[t] / Math.Max(sIndex, 1e-6)) + (1 - a) * (level + trend);
            trend = b * (level - prevLevel) + (1 - b) * trend;
            season[t % m] = g * (values[t] / Math.Max(level, 1e-6)) + (1 - g) * season[t % m];
        }

        return (level, trend, season, n > m ? err / (n - m) : 0);
    }

    /// <summary>Forecast h steps (periods) ahead of the training series end.</summary>
    public double Forecast(int steps = 1)
    {
        if (Seasonals is null || Seasonals.Length == 0) return Level + Trend * steps;
        // Seasonal index for the upcoming period.
        int idx = ((SeasonLength - 1) % Seasonals.Length + Seasonals.Length) % Seasonals.Length;
        return (Level + Trend * steps) * Seasonals[idx];
    }
}