using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EFESMS.Api.Controllers;

// No-key web directory lookup for the customer search "not in register" fallback.
// Sources (all open, structured JSON, no API keys):
//   1. Wikidata  → official company profile: website, phone, X, Facebook, Instagram, email
//   2. Crowd-sourced Wikidata search in case the top hit is a different subject
//   3. OpenStreetMap Nominatim → physical address + contact details for local businesses
// Everything is returned as JSON so the frontend renders it inside the app.
[ApiController]
[Route("api/v1/directory")]
[Authorize]
public class DirectoryController : ControllerBase
{
    private static readonly HttpClient Http = CreateClient();
    private const string Ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

    private static HttpClient CreateClient()
    {
        var c = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };
        c.DefaultRequestHeaders.UserAgent.ParseAdd(Ua);
        c.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        return c;
    }

    public record SocialsDto(string? Username, string? Facebook, string? Instagram, string? Email);

    public record FeaturedDto(
        string Title,
        string Description,
        string WikidataUrl,
        string? Website,
        string? Phone,
        SocialsDto? Socials);

    public record OsmDto(
        string Name,
        string Address,
        double Lat,
        double Lon,
        string? Phone,
        string? Website,
        SocialsDto? Socials);

    public record LookupDto(string Query, string Scope, FeaturedDto? Featured, List<OsmDto> OsmResults);

    // African country QIDs used to prefer Zimbabwe / Africa entries on Wikidata.
    private static readonly HashSet<string> AfricanQids = new()
    {
        "Q954",  // Zimbabwe
        "Q258",  // South Africa
        "Q963",  // Botswana
        "Q953",  // Zambia
        "Q1030", // Namibia
        "Q1029", // Mozambique
        "Q1013", // Lesotho
        "Q1050", // Eswatini
        "Q114",  // Kenya
        "Q1033", // Nigeria
        "Q117",  // Ghana
        "Q924",  // Tanzania
        "Q1036", // Uganda
        "Q916",  // Angola
        "Q974",  // DR Congo
        "Q115",  // Ethiopia
        "Q1020", // Malawi
        "Q1027", // Mauritius
        "Q1019", // Madagascar
        "Q1042", // Seychelles
        "Q79",   // Egypt
    };

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q, [FromQuery] string? cc)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(new { message = "Query is required." });

        var query = q.Trim();
        // Bias to Zimbabwe + South Africa by default; other country codes can be requested via ?cc=ke,ng
        var countries = string.IsNullOrWhiteSpace(cc)
            ? "zw,za"
            : cc.Trim().ToLowerInvariant();

        // Append a country hint for the maps lookup so ambiguous names ("Delta", "National Foods")
        // rank the right local entity; Wikidata keeps the plain name but prefers African entities.
        var hint = CountryHint(countries);
        var mapQuery = string.IsNullOrWhiteSpace(hint) ? query : query + " " + hint;

        var featuredTask = FetchWikidataFeaturedAsync(query);
        var osmTask = FetchOsmAsync(mapQuery, countries);

        await Task.WhenAll(featuredTask, osmTask);
        return Ok(new LookupDto(query, "Africa · " + countries.ToUpperInvariant(), featuredTask.Result, osmTask.Result));
    }

    private static readonly Dictionary<string, string> CountryNames = new()
    {
        ["zw"] = "Zimbabwe", ["za"] = "South Africa", ["zm"] = "Zambia",
        ["bw"] = "Botswana", ["na"] = "Namibia", ["mz"] = "Mozambique",
        ["ke"] = "Kenya", ["ng"] = "Nigeria", ["gh"] = "Ghana",
        ["tz"] = "Tanzania", ["ug"] = "Uganda", ["ao"] = "Angola",
        ["et"] = "Ethiopia", ["mw"] = "Malawi", ["eg"] = "Egypt",
        ["ls"] = "Lesotho", ["sz"] = "Eswatini", ["mu"] = "Mauritius",
        ["mg"] = "Madagascar", ["sc"] = "Seychelles", ["cd"] = "Congo (DRC)",
    };

    // Prefer Zimbabwe when both ZW and ZA are selected (the default) — Zimbabwe-first bias.
    private static string CountryHint(string countries)
    {
        var codes = countries.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var pick = codes.Contains("zw") ? "zw" : codes.FirstOrDefault();
        return pick != null && CountryNames.TryGetValue(pick, out var name) ? name : "";
    }

    // ---- Wikidata: search entities, then pull structured claims for the best African hit ----
    private static async Task<FeaturedDto?> FetchWikidataFeaturedAsync(string query)
    {
        try
        {
            var searchUrl = "https://www.wikidata.org/w/api.php?action=wbsearchentities&search=" +
                            Uri.EscapeDataString(query) + "&language=en&uselang=en&format=json&limit=5&origin=*";
            var body = await Http.GetStringAsync(searchUrl);
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            if (!root.TryGetProperty("search", out var arr) || arr.GetArrayLength() == 0) return null;

            var ids = new List<string>();
            var cand = new List<(string Id, string Label, string Description)>();
            foreach (var el in arr.EnumerateArray())
            {
                var id = el.TryGetProperty("id", out var i) ? i.GetString() : null;
                if (string.IsNullOrWhiteSpace(id)) continue;
                ids.Add(id);
                cand.Add((
                    id,
                    el.TryGetProperty("label", out var l) ? l.GetString() ?? "" : "",
                    el.TryGetProperty("description", out var d) ? d.GetString() ?? "" : ""));
            }
            if (ids.Count == 0) return null;

            // Fetch claims for all candidates in one call so we can rank by African country.
            var entityUrl = "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" + string.Join("|", ids) +
                            "&props=claims|descriptions&languages=en&format=json&origin=*";
            var claimsBody = await Http.GetStringAsync(entityUrl);
            using var cdoc = JsonDocument.Parse(claimsBody);
            var entities = cdoc.RootElement.GetProperty("entities");

            // Prefer the first candidate whose country claim (P17) is African; fall back to the top candidate.
            IEnumerable<(string Id, string Label, string Description)> ranked = cand;
            foreach (var c in cand)
            {
                if (!entities.TryGetProperty(c.Id, out var ent)) continue;
                var claimsRaw = ent.TryGetProperty("claims", out var cl) ? cl : default;
                var country = ClaimValue(claimsRaw, "P17");
                if (country != null && AfricanQids.Contains(country))
                {
                    ranked = new[] { c }.Concat(cand.Where(x => x.Id != c.Id));
                    break;
                }
            }

            var best = ranked.First();
            if (!entities.TryGetProperty(best.Id, out var bestEnt)) return null;
            var bestClaims = bestEnt.TryGetProperty("claims", out var bestCl) ? bestCl : default;

            var website = ClaimValue(bestClaims, "P856");
            var phone = ClaimValue(bestClaims, "P1329");
            var socials = new SocialsDto(
                ClaimValue(bestClaims, "P2002"),
                ClaimValue(bestClaims, "P2013"),
                ClaimValue(bestClaims, "P2003"),
                ClaimValue(bestClaims, "P968"));

            return new FeaturedDto(
                best.Label,
                best.Description,
                "https://www.wikidata.org/wiki/Special:EntityPage/" + best.Id,
                NormalizeUrl(website),
                phone,
                SocialsOrNull(socials));
        }
        catch
        {
            return null;
        }
    }

    // ---- OpenStreetMap Nominatim: physical + contact info, restricted to selected countries ----
    private static async Task<List<OsmDto>> FetchOsmAsync(string query, string countries)
    {
        var results = new List<OsmDto>();
        try
        {
            var url = "https://nominatim.openstreetmap.org/search?q=" + Uri.EscapeDataString(query) +
                      "&format=json&limit=5&extratags=1&addressdetails=1&countrycodes=" + Uri.EscapeDataString(countries);
            var body = await Http.GetStringAsync(url);
            using var doc = JsonDocument.Parse(body);
            var arr = doc.RootElement;
            if (arr.ValueKind != JsonValueKind.Array) return results;

            foreach (var el in arr.EnumerateArray())
            {
                var name = el.TryGetProperty("display_name", out var n) ? n.GetString() : null;
                if (string.IsNullOrWhiteSpace(name)) continue;

                var extratags = el.TryGetProperty("extratags", out var et) ? et : default;
                var phone = TagValue(extratags, "phone") ?? TagValue(extratags, "contact:phone");
                var website = TagValue(extratags, "website") ?? TagValue(extratags, "contact:website") ??
                              TagValue(extratags, "contact:webpage");
                var facebook = TagValue(extratags, "contact:facebook");
                var instagram = TagValue(extratags, "contact:instagram");
                var twitter = TagValue(extratags, "contact:twitter");

                var lat = el.TryGetProperty("lat", out var lt) ? double.TryParse(lt.GetString(), out var la) ? la : 0 : 0;
                var lon = el.TryGetProperty("lon", out var lg) ? double.TryParse(lg.GetString(), out var lo) ? lo : 0 : 0;

                results.Add(new OsmDto(
                    el.TryGetProperty("name", out var nm) ? nm.GetString() ?? "Location" : "Location",
                    name,
                    lat,
                    lon,
                    phone,
                    NormalizeUrl(website),
                    SocialsOrNull(new SocialsDto(twitter, facebook, instagram, null))));

                if (results.Count >= 4) break;
            }
        }
        catch
        {
            // fall through with any partial results
        }
        return results;
    }

    private static string? ClaimValue(JsonElement claims, string prop)
    {
        if (claims.ValueKind != JsonValueKind.Object) return null;
        if (!claims.TryGetProperty(prop, out var arr)) return null;
        if (arr.ValueKind != JsonValueKind.Array || arr.GetArrayLength() == 0) return null;
        if (!arr[0].TryGetProperty("mainsnak", out var ms)) return null;
        if (!ms.TryGetProperty("datavalue", out var dv)) return null;
        if (!dv.TryGetProperty("value", out var v)) return null;
        return v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    }

    private static string? TagValue(JsonElement tags, string key)
    {
        if (tags.ValueKind != JsonValueKind.Object) return null;
        return tags.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    }

    private static string? NormalizeUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        if (!url.StartsWith("http://") && !url.StartsWith("https://")) return "https://" + url;
        return url;
    }

    private static SocialsDto? SocialsOrNull(SocialsDto s)
    {
        if (string.IsNullOrWhiteSpace(s.Username) && string.IsNullOrWhiteSpace(s.Facebook) &&
            string.IsNullOrWhiteSpace(s.Instagram) && string.IsNullOrWhiteSpace(s.Email))
            return null;
        return s;
    }
}