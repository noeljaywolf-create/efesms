using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using EFESMS.Api.Models;
using EFESMS.Api.Security;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace EFESMS.Api.Tests;

public class AuthenticationSecurityTests
{
    [Fact]
    public void Token_UsesStableUsernameAsIdentityAndCarriesCurrentAuthorizationClaims()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48)),
                ["Jwt:Issuer"] = "EFESMS.Tests",
                ["Jwt:Audience"] = "EFESMS.Tests.Clients",
                ["Jwt:ExpiryMinutes"] = "10",
            })
            .Build();
        var account = new User
        {
            Id = 42,
            Username = "field.tech",
            DisplayName = "Field Technician",
            Email = "field@example.test",
            Role = "technician",
            Department = "Technical",
            AuthVersion = 3,
        };

        var token = new TokenService(configuration).CreateToken(account);
        var claims = new JwtSecurityTokenHandler().ReadJwtToken(token).Claims.ToList();

        Assert.Contains(claims, claim => claim.Type == ClaimTypes.Name && claim.Value == "field.tech");
        Assert.Contains(claims, claim => claim.Type == ClaimTypes.NameIdentifier && claim.Value == "42");
        Assert.Contains(claims, claim => claim.Type == ClaimTypes.Role && claim.Value == "technician");
        Assert.Contains(claims, claim => claim.Type == "department" && claim.Value == "Technical");
        Assert.Contains(claims, claim => claim.Type == "authVersion" && claim.Value == "3");
    }
}
