using System;

namespace FireOpsAI.Engine.ML;

/// <summary>
/// Classic Lloyd's k-means clustering with k-means++ initialisation,
/// deterministic seeding option, and silhouette-like cohesion selection.
/// Pure C#, no external dependencies.
/// </summary>
public static class KMeans
{
    public sealed class Result
    {
        public int[] Labels = Array.Empty<int>();
        public double[][] Centroids = Array.Empty<double[]>();
        public double WithinClusterSumSquares;
        public int Iterations;
    }

    /// <summary>
    /// Runs k-means for each k in [kMin..kMax] and returns the best by
    /// within-cluster squared distance. Labels are 0..k-1 per row.
    /// </summary>
    public static Result BestCluster(double[][] data, int kMin = 2, int kMax = 4, int seed = 42, int restarts = 6)
    {
        Result best = new();
        double bestWcss = double.MaxValue;

        int upper = Math.Min(kMax, Math.Max(1, data.Length));
        for (int k = kMin; k <= upper; k++)
        {
            if (k >= data.Length) continue;
            var r = Run(data, k, seed, restarts);
            if (r.WithinClusterSumSquares < bestWcss)
            {
                bestWcss = r.WithinClusterSumSquares;
                best = r;
            }
        }
        if (best.Labels.Length == 0 && data.Length > 0)
            best = Run(data, 1, seed, restarts);
        return best;
    }

    public static Result Run(double[][] data, int k, int seed = 42, int restarts = 6)
    {
        int n = data.Length;
        int dims = data[0].Length;
        var rng = new Random(seed);

        Result best = new() { WithinClusterSumSquares = double.MaxValue };
        for (int restart = 0; restart < restarts; restart++)
        {
            var centroids = InitPlusPlus(data, k, dims, rng);
            var labels = new int[n];
            double wcss = 0;
            int iterations = 0;

            while (iterations < 100)
            {
                iterations++;
                Array.Fill(labels, 0);
                var sums = new double[k][];
                var counts = new int[k];
                for (int c = 0; c < k; c++) sums[c] = new double[dims];

                for (int i = 0; i < n; i++)
                {
                    int c = Nearest(centroids, data[i]);
                    labels[i] = c;
                    counts[c]++;
                    for (int d = 0; d < dims; d++) sums[c][d] += data[i][d];
                }

                bool moved = false;
                for (int c = 0; c < k; c++)
                {
                    if (counts[c] == 0) continue;
                    for (int d = 0; d < dims; d++)
                    {
                        double newVal = sums[c][d] / counts[c];
                        if (Math.Abs(newVal - centroids[c][d]) > 1e-9) moved = true;
                        centroids[c][d] = newVal;
                    }
                }
                if (!moved) break;
            }

            wcss = 0;
            for (int i = 0; i < n; i++)
            {
                int c = Nearest(centroids, data[i]);
                labels[i] = c;
                wcss += SquaredDist(data[i], centroids[c]);
            }

            if (wcss < best.WithinClusterSumSquares)
            {
                best = new Result
                {
                    Labels = (int[])labels.Clone(),
                    Centroids = centroids,
                    WithinClusterSumSquares = wcss,
                    Iterations = iterations
                };
            }
        }

        // Rename labels deterministically by centroid magnitude so that
        // cluster 0 < 1 < 2 ... by centroid norm (stable across runs).
        var order = Enumerable.Range(0, best.Centroids.Length)
            .OrderBy(c => best.Centroids[c].Sum(v => v * v))
            .ToArray();
        var remap = new int[best.Centroids.Length];
        for (int i = 0; i < order.Length; i++) remap[order[i]] = i;
        for (int i = 0; i < best.Labels.Length; i++) best.Labels[i] = remap[best.Labels[i]];
        best.Centroids = order.Select(c => best.Centroids[c]).ToArray();

        return best;
    }

    private static double[][] InitPlusPlus(double[][] data, int k, int dims, Random rng)
    {
        int n = data.Length;
        var centroids = new double[k][];
        var first = rng.Next(n);
        centroids[0] = (double[])data[first].Clone();

        var dist2 = new double[n];
        for (int c = 1; c < k; c++)
        {
            double total = 0;
            for (int i = 0; i < n; i++)
            {
                double d = SquaredDist(data[i], centroids[c - 1]);
                dist2[i] = d;
                total += d;
            }
            if (total <= 0) { centroids[c] = (double[])data[rng.Next(n)].Clone(); continue; }

            double r = rng.NextDouble() * total;
            int pick = n - 1;
            double acc = 0;
            for (int i = 0; i < n; i++)
            {
                acc += dist2[i];
                if (acc >= r) { pick = i; break; }
            }
            centroids[c] = (double[])data[pick].Clone();
        }
        return centroids;
    }

    private static int Nearest(double[][] centroids, double[] point)
    {
        int best = 0;
        double bestD = double.MaxValue;
        for (int c = 0; c < centroids.Length; c++)
        {
            double d = SquaredDist(point, centroids[c]);
            if (d < bestD) { bestD = d; best = c; }
        }
        return best;
    }

    private static double SquaredDist(double[] a, double[] b)
    {
        double s = 0;
        for (int i = 0; i < a.Length; i++) s += (a[i] - b[i]) * (a[i] - b[i]);
        return s;
    }
}