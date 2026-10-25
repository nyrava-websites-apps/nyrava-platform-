# Contribution guide

This is a proprietary product repository. Contributions require authorization from the repository owner and must follow the applicable written agreement. Opening a pull request does not grant a license to use, redistribute, or relicense the product.

## Before submitting a change

1. Check existing documentation and issues for the intended behavior.
2. Keep changes focused and explain user-visible behavior, configuration changes, and database effects.
3. Do not include secrets, personal data, generated databases, published output, or customer records.
4. Update the installation, database, or integration documentation when behavior or setup changes.
5. Build the Release configuration and run relevant tests before requesting review.

## Local verification

```bash
dotnet restore
dotnet build NyravaCRM.csproj --configuration Release --no-restore
dotnet test tests/NyravaCRM.Tests/NyravaCRM.Tests.csproj --configuration Release
```

The GitHub Actions workflow verifies restore, Release build, and the integration test project. Add or update meaningful tests when a change affects behavior.

## Pull request notes

Include the reason for the change, a concise summary, verification performed, and any risks or required operator steps. For UI changes, include before/after screenshots with fictional data only.
