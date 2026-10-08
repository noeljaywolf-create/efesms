using System;

namespace FireOpsAI.Engine.ML;

/// <summary>
/// A compact gradient-boosted decision-tree regressor (XGBoost-style).
/// Trains an ensemble of shallow depth-limited trees on gradient residuals
/// using a squared-error loss with shrinkage. Pure C#, no external libraries.
/// </summary>
public class GradientBoostedTrees
{
    private readonly int _numTrees;
    private readonly int _maxDepth;
    private readonly int _minLeafSamples;
    private readonly double _learningRate;
    private readonly int _seed;
    private sealed class TreeNode
    {
        public double LeafValue;
        public int FeatureIndex = -1;
        public double Threshold;
        public TreeNode? Left;
        public TreeNode? Right;
        public bool IsLeaf => FeatureIndex < 0;
    }

    private readonly List<TreeNode> _trees = new();
    private double _basePrediction;
    private double[]? _featureMeans;

    public GradientBoostedTrees(int numTrees = 120, int maxDepth = 3, int minLeafSamples = 2, double learningRate = 0.06, int seed = 42)
    {
        _numTrees = numTrees;
        _maxDepth = maxDepth;
        _minLeafSamples = minLeafSamples;
        _learningRate = learningRate;
        _seed = seed;
    }

    public int TreeCount => _trees.Count;

    /// <summary>Trains the ensemble. X is [n][features], y is [n].</summary>
    public void Train(double[][] X, double[] y)
    {
        if (X.Length == 0 || X.Length != y.Length)
            throw new ArgumentException("Training data mismatch.");

        int n = X.Length;
        int f = X[0].Length;

        // Impute missing values with column means so NaN never breaks splits.
        _featureMeans = new double[f];
        for (int j = 0; j < f; j++)
        {
            double sum = 0, cnt = 0;
            for (int i = 0; i < n; i++) if (!double.IsNaN(X[i][j])) { sum += X[i][j]; cnt++; }
            _featureMeans[j] = cnt > 0 ? sum / cnt : 0;
        }
        for (int i = 0; i < n; i++)
            for (int j = 0; j < f; j++)
                if (double.IsNaN(X[i][j])) X[i][j] = _featureMeans[j];

        _basePrediction = y.Average();
        _trees.Clear();

        var residuals = y.Select(v => v - _basePrediction).ToArray();
        var indices = Enumerable.Range(0, n).ToArray();
        var rng = new Random(_seed);

        for (int t = 0; t < _numTrees; t++)
        {
            var tree = FitTree(X, residuals, indices, _maxDepth, rng);
            _trees.Add(tree);

            if (!tree.IsLeaf)
            {
                for (int i = 0; i < n; i++)
                    residuals[i] -= _learningRate * PredictTreeNode(tree, X[i]);
            }
        }
    }

    private TreeNode FitTree(double[][] X, double[] residuals, int[] indices, int depth, Random rng)
    {
        if (depth == 0 || indices.Length < _minLeafSamples * 2)
            return Leaf(indices, residuals);

        int f = X[0].Length;
        double bestGain = 0;
        int bestFeat = -1;
        double bestThr = 0;

        double totalSum = indices.Sum(i => residuals[i]);

        // Sample a subset of features at each node (random forest flair) for diversity.
        var featurePool = FeaturePool(f, rng);

        foreach (int j in featurePool)
        {
            var order = indices
                .Select(i => (Val: X[i][j], Idx: i))
                .OrderBy(p => p.Val)
                .ToList();

            double leftSum = 0;
            int leftCnt = 0;
            int rightCnt = indices.Length;

            for (int k = 0; k < order.Count - 1; k++)
            {
                leftSum += residuals[order[k].Idx];
                leftCnt++;
                rightCnt--;

                if (leftCnt < _minLeafSamples || rightCnt < _minLeafSamples) continue;
                double cur = order[k].Val, nxt = order[k + 1].Val;
                if (cur == nxt) continue; // avoid degenerate splits

                double rightSum = totalSum - leftSum;
                double gain = (leftSum * leftSum) / leftCnt + (rightSum * rightSum) / rightCnt;

                if (gain > bestGain)
                {
                    bestGain = gain;
                    bestFeat = j;
                    bestThr = (cur + nxt) / 2.0;
                }
            }
        }

        if (bestFeat < 0 || bestGain <= 0)
            return Leaf(indices, residuals); // no useful split

        var leftIdx = new List<int>();
        var rightIdx = new List<int>();
        foreach (int i in indices)
        {
            if (X[i][bestFeat] <= bestThr) leftIdx.Add(i);
            else rightIdx.Add(i);
        }
        if (leftIdx.Count < _minLeafSamples || rightIdx.Count < _minLeafSamples)
            return Leaf(indices, residuals);

        return new TreeNode
        {
            FeatureIndex = bestFeat,
            Threshold = bestThr,
            Left = FitTree(X, residuals, leftIdx.ToArray(), depth - 1, rng),
            Right = FitTree(X, residuals, rightIdx.ToArray(), depth - 1, rng)
        };
    }

    private static IReadOnlyList<int> FeaturePool(int f, Random rng)
    {
        var pool = Enumerable.Range(0, f).ToList();
        int k = Math.Max(1, (int)Math.Sqrt(f));
        while (pool.Count > k)
        {
            // Yates shuffle partial.
            var src = new List<int>(pool);
            for (int i = 0; i < pool.Count; i++)
            {
                int j = rng.Next(pool.Count);
                (src[i], src[j]) = (src[j], src[i]);
            }
            pool = src.Take(k).ToList();
        }
        return pool;
    }

    private static TreeNode Leaf(int[] indices, double[] residuals)
    {
        var vals = indices.Select(i => residuals[i]).ToArray();
        return new TreeNode { LeafValue = vals.Average() };
    }

    public double Predict(double[] x)
    {
        if (_trees.Count == 0) return _basePrediction;
        double p = _basePrediction;
        foreach (var t in _trees) p += _learningRate * PredictTreeNode(t, x);
        return p;
    }

    private static double PredictTreeNode(TreeNode node, double[] x)
    {
        var cur = node;
        while (!cur.IsLeaf)
        {
            cur = x[cur.FeatureIndex] <= cur.Threshold ? cur.Left! : cur.Right!;
        }
        return cur.LeafValue;
    }
}