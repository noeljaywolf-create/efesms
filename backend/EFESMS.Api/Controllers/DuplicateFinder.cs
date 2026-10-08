using EFESMS.Api.Models;

namespace EFESMS.Api.Controllers;

public record DuplicateMatch(int Id, string CustomerId, string Name, double Score, List<string> Reasons);

public static class DuplicateFinder
{
    public record Candidate(Customer Customer, double Score, List<string> Reasons);

    private static readonly HashSet<string> Suffixes = new(StringComparer.Ordinal)
    {
        "pty", "ltd", "limited", "inc", "llc", "cc", "corp", "corporation", "prop", "properties",
        "holdings", "holding", "group", "grouping", "co", "company", "ent", "enterprise", "ltdpty"
    };

    /// Normalize for matching: lowercase, keep letters, drop legal-entity suffixes.
    public static string NormalizeName(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return string.Empty;
        var toks = Tokenize(s.ToLowerInvariant());
        var kept = toks.Where(t => !Suffixes.Contains(t)).ToArray();
        return string.Concat(kept);
    }

    private static List<string> Tokenize(string s)
    {
        var list = new List<string>();
        var cur = new System.Text.StringBuilder();
        foreach (var ch in s)
        {
            if (char.IsLetter(ch) || char.IsDigit(ch)) cur.Append(ch);
            else { if (cur.Length > 0) { list.Add(cur.ToString()); cur.Clear(); } }
        }
        if (cur.Length > 0) list.Add(cur.ToString());
        return list;
    }

    public static string NormalizePhone(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return string.Empty;
        var digits = new string(s.Where(char.IsDigit).ToArray());
        if (digits.Length == 12 && digits.StartsWith("263")) digits = "0" + digits.Substring(3);
        while (digits.Length > 0 && digits[0] == '0' && digits.Length > 9) digits = digits.Substring(1);
        return digits;
    }

    public static double LevenshteinSimilarity(string a, string b)
    {
        if (a == b) return 1.0;
        if (a.Length == 0 || b.Length == 0) return 0.0;
        var dp = new int[a.Length + 1, b.Length + 1];
        for (var i = 0; i <= a.Length; i++) dp[i, 0] = i;
        for (var j = 0; j <= b.Length; j++) dp[0, j] = j;
        for (var i = 1; i <= a.Length; i++)
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                dp[i, j] = Math.Min(dp[i - 1, j] + 1, Math.Min(dp[i, j - 1] + 1, dp[i - 1, j - 1] + cost));
            }
        var dist = dp[a.Length, b.Length];
        return 1.0 - (double)dist / Math.Max(a.Length, b.Length);
    }

    private static bool AddPhone(IEnumerable<string?> phones, string? probe, HashSet<string> set)
    {
        var np = NormalizePhone(probe);
        if (string.IsNullOrEmpty(np)) return false;
        foreach (var p in phones)
            if (string.Equals(NormalizePhone(p), np, StringComparison.Ordinal))
            {
                set.Add(np);
                return true;
            }
        return false;
    }

    /// Score an existing customer against the incoming payload. Returns null when below threshold.
    public static Candidate? Score(Customer c, CustomersController.ICustomerDuplicateInput dto)
    {
        var reasons = new List<string>();
        double score = 0;

        var inName = NormalizeName(dto.Name);
        var exName = NormalizeName(c.Name);
        if (inName.Length > 0 && exName.Length > 0)
        {
            var sim = LevenshteinSimilarity(inName, exName);
            if (sim >= 0.86)
            {
                score += 40 * sim;
                reasons.Add($"{sim * 100:0}% name similarity");
            }
            else if (sim >= 0.55)
            {
                score += 18 * sim;
                reasons.Add($"Partial name similarity ({sim * 100:0}%)");
            }
        }

        if (!string.IsNullOrWhiteSpace(dto.AlternativeName))
        {
            var sim = LevenshteinSimilarity(NormalizeName(dto.AlternativeName), exName);
            if (sim >= 0.86)
            {
                score += 15;
                reasons.Add("Alternative name matches");
            }
        }

        if (!string.IsNullOrWhiteSpace(dto.LegalName))
        {
            var sim = LevenshteinSimilarity(NormalizeName(dto.LegalName), exName);
            if (sim >= 0.86) score += 5;
        }

        var phones = new List<string?> { c.Phone, c.WhatsApp };
        phones.AddRange(c.Contacts.Select(x => x.Phone));
        phones.AddRange(c.Sites.Select(x => x.Phone));
        var hit = new HashSet<string>();
        if (AddPhone(phones, dto.Phone, hit)) { score += 40; reasons.Add("Same phone number"); }
        if (!string.IsNullOrWhiteSpace(dto.WhatsApp) && AddPhone(phones, dto.WhatsApp, hit)) { score += 20; reasons.Add("Same WhatsApp number"); }

        if (!string.IsNullOrWhiteSpace(dto.Email) && !string.IsNullOrWhiteSpace(c.Email))
        {
            if (string.Equals(dto.Email.Trim(), c.Email.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                score += 20;
                reasons.Add("Same email address");
            }
            else
            {
                var d1 = dto.Email.Split('@').LastOrDefault()?.ToLowerInvariant();
                var d2 = c.Email.Split('@').LastOrDefault()?.ToLowerInvariant();
                if (!string.IsNullOrEmpty(d1) && d1 == d2) { score += 8; reasons.Add($"Same email domain ({d1})"); }
            }
        }

        if (!string.IsNullOrWhiteSpace(dto.VatNumber) && !string.IsNullOrWhiteSpace(c.VatNumber) &&
            string.Equals(dto.VatNumber.Replace(" ", ""), c.VatNumber.Replace(" ", ""), StringComparison.OrdinalIgnoreCase))
        {
            score += 25;
            reasons.Add("Same VAT number");
        }

        if (!string.IsNullOrWhiteSpace(dto.TinNumber) && !string.IsNullOrWhiteSpace(c.TinNumber) &&
            string.Equals(dto.TinNumber.Trim(), c.TinNumber.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            score += 25;
            reasons.Add("Same TIN");
        }

        if (c.Contacts.Count > 0 && !string.IsNullOrWhiteSpace(dto.ContactPerson))
        {
            foreach (var k in c.Contacts)
                if (!string.IsNullOrEmpty(k.Name))
                {
                    var sim = LevenshteinSimilarity(NormalizeName(k.Name), NormalizeName(dto.ContactPerson));
                    if (sim >= 0.85) { score += 10; reasons.Add("Same contact person"); break; }
                }
        }

        if (c.Sites.Count > 0 && !string.IsNullOrWhiteSpace(dto.SiteAddress))
        {
            var a = new string(dto.SiteAddress!.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());
            foreach (var s in c.Sites)
                if (!string.IsNullOrEmpty(s.Address))
                {
                    var b = new string(s.Address.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());
                    if (a.Length > 4 && b.Length > 4 && (a.Contains(b) || b.Contains(a)))
                    {
                        score += 8;
                        reasons.Add("Same site address");
                        break;
                    }
                }
        }

        if (score < 50) return null;
        return new Candidate(c, Math.Round(Math.Min(score, 100), 1), reasons);
    }
}