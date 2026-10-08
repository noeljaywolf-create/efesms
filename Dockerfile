FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY backend/EFESMS.Api/publish/ .
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec dotnet EFESMS.Api.dll --urls http://+:${PORT:-8080}"]
