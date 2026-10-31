#!/usr/bin/env bash
set -euo pipefail
cd /opt/nyrava-platform
git fetch origin feature/automatic-bank-delivery-20261031
base=services/crm-lead-engine/crm-app/tests/NyravaCRM.Tests
backup="/root/nyrava-backups/test-fixtures-$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
for f in CrmApplicationFactory.cs ActivityLifecycleTests.cs ContactLifecycleTests.cs TeamInvitationConfigurationTests.cs InvitationAcceptanceTests.cs InboundLeadIntegrationTests.cs WorkbenchTests.cs TeamAndChatTests.cs GeographicSubscriptionAndRoutingTests.cs LegacySubscriptionMigrationTests.cs; do
  if [[ -f "$base/$f" ]]; then cp "$base/$f" "$backup/$f"; fi
  git show "FETCH_HEAD:$base/$f" > "$base/$f"
done
echo "Updated test fixtures; previous copies: $backup"
docker run --rm -v "$PWD/services/crm-lead-engine/crm-app:/src" -w /src/tests/NyravaCRM.Tests mcr.microsoft.com/dotnet/sdk:8.0 dotnet test -c Release --verbosity minimal
