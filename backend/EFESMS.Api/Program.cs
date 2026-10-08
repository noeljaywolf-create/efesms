using System.Text;
using EFESMS.Api.Data;
using EFESMS.Api.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

static string NormalizeConnectionString(string conn)
{
    if (!conn.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) &&
        !conn.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
        return conn;
    var u = new Uri(conn);
    var userInfo = u.UserInfo.Split(':', 2);
    var sb = new StringBuilder();
    sb.Append("Host=").Append(u.Host);
    if (u.Port > 0) sb.Append(";Port=").Append(u.Port);
    sb.Append(";Database=").Append(u.AbsolutePath.TrimStart('/'));
    sb.Append(";Username=").Append(userInfo[0]);
    if (userInfo.Length > 1) sb.Append(";Password=").Append(userInfo[1]);
    foreach (var part in u.Query.TrimStart('?').Split('&'))
    {
        var kv = part.Split('=', 2);
        if (kv.Length != 2) continue;
        var key = Uri.UnescapeDataString(kv[0]);
        var val = Uri.UnescapeDataString(kv[1]);
        if (key.Equals("sslmode", StringComparison.OrdinalIgnoreCase))
            sb.Append(";SSL Mode=").Append(val);
    }
    return sb.ToString();
}

// --- PostgreSQL + EF Core ---
var conn = NormalizeConnectionString(builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("ConnectionStrings:Default must be configured."));
builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(conn, npgsql =>
    npgsql.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery)));

// --- Services ---
builder.Services.AddScoped<TokenService>();
builder.Services.AddSingleton<FireOpsAI.AIOperationsEngine>();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "EFESMS API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

// --- JWT Bearer ---
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey) && builder.Environment.IsDevelopment())
{
    // Keep local development sessions valid across API restarts without putting a signing secret in source control.
    var localSecretDirectory = Path.Combine(builder.Environment.ContentRootPath, ".local-secrets");
    Directory.CreateDirectory(localSecretDirectory);
    var localKeyPath = Path.Combine(localSecretDirectory, "jwt-key");
    if (File.Exists(localKeyPath))
    {
        jwtKey = File.ReadAllText(localKeyPath).Trim();
    }
    else
    {
        var generatedKey = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(64));
        try
        {
            using var keyFile = new FileStream(localKeyPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            using var writer = new StreamWriter(keyFile);
            writer.Write(generatedKey);
            jwtKey = generatedKey;
        }
        catch (IOException) when (File.Exists(localKeyPath))
        {
            // Another local API start may have created the shared key first.
            jwtKey = File.ReadAllText(localKeyPath).Trim();
        }
    }
    Console.WriteLine("Using the persistent local development JWT key; production must provide Jwt__Key.");
}
if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32)
    throw new InvalidOperationException("Jwt:Key must be configured with at least 32 characters.");
// TokenService reads the signing key from IConfiguration when it issues login and password-change tokens.
builder.Configuration["Jwt:Key"] = jwtKey;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? throw new InvalidOperationException("Jwt:Issuer must be configured."),
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? throw new InvalidOperationException("Jwt:Audience must be configured."),
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
        o.Events = new JwtBearerEvents
        {
            // Check account status and refresh role/department on every request so
            // disabling an account or changing its role takes effect immediately.
            OnTokenValidated = async context =>
            {
                var identity = context.Principal?.Identity as System.Security.Claims.ClaimsIdentity;
                var idValue = context.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                    ?? context.Principal?.FindFirst("sub")?.Value;
                if (identity is null || !int.TryParse(idValue, out var userId))
                {
                    context.Fail("Invalid account identity.");
                    return;
                }

                var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId, context.HttpContext.RequestAborted);
                if (user is null || !user.IsActive)
                {
                    context.Fail("Account is inactive.");
                    return;
                }
                var tokenVersion = context.Principal?.FindFirst("authVersion")?.Value ?? "0";
                if (!int.TryParse(tokenVersion, out var parsedVersion) || parsedVersion != user.AuthVersion)
                {
                    context.Fail("Credentials have changed. Sign in again.");
                    return;
                }

                foreach (var claimType in new[] { System.Security.Claims.ClaimTypes.Name, System.Security.Claims.ClaimTypes.NameIdentifier, System.Security.Claims.ClaimTypes.Role, "department", "displayName" })
                    foreach (var claim in identity.FindAll(claimType).ToArray()) identity.RemoveClaim(claim);
                identity.AddClaim(new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, user.Id.ToString()));
                identity.AddClaim(new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Name, user.Username));
                identity.AddClaim(new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, user.Role));
                identity.AddClaim(new System.Security.Claims.Claim("department", user.Department));
                identity.AddClaim(new System.Security.Claims.Claim("displayName", user.DisplayName));
            }
        };
    });
builder.Services.AddAuthorization();

// --- CORS (configurable for deployment; dev defaults for local Vite + LAN) ---
var corsOrigins = (builder.Configuration["Cors:Origins"] ?? "")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
if (corsOrigins.Length == 0)
    corsOrigins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://192.168.1.226:5173"];
builder.Services.AddCors(o =>
{
    o.AddPolicy("Frontend", p =>
        p.WithOrigins(corsOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod());
});

var app = builder.Build();

// --- Database provisioning and optional bootstrap ---
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (app.Environment.IsDevelopment() && builder.Configuration.GetValue<bool>("Database:EnsureCreated"))
    {
        db.Database.EnsureCreated();
    }

    OpsSchema.Ensure(db);

    var bootstrapUsername = builder.Configuration["BootstrapAdmin:Username"];
    var bootstrapPassword = builder.Configuration["BootstrapAdmin:Password"];
    if (!string.IsNullOrWhiteSpace(bootstrapUsername) && !string.IsNullOrWhiteSpace(bootstrapPassword) && !db.Users.Any())
    {
        db.Users.Add(new EFESMS.Api.Models.User
        {
            Username = bootstrapUsername.Trim(),
            Email = builder.Configuration["BootstrapAdmin:Email"] ?? $"{bootstrapUsername.Trim()}@localhost",
            DisplayName = builder.Configuration["BootstrapAdmin:DisplayName"] ?? bootstrapUsername.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(bootstrapPassword),
            Role = "admin",
            Department = "Administration",
            IsActive = true
        });
        db.SaveChanges();
    }

    if (builder.Configuration.GetValue<bool>("Database:SeedDemoData"))
    {
        OpsSeeder.Seed(db);
    }
}

// --- Pipeline ---
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("Frontend");
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Port/host override for deployment (e.g. Urls=http://+:8080 in Docker);
// local default stays :3001 so the Vite proxy keeps working.
app.Run(builder.Configuration["Urls"] ?? "http://0.0.0.0:3001");
