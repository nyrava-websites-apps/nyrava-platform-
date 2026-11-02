-- Snapshot of existing Stripe subscription state, not a second billing system.
CREATE TABLE IF NOT EXISTS "SalesPartnerSubscriptionSnapshot" (
 "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerSubscriptionSnapshot" PRIMARY KEY AUTOINCREMENT,
 "SubscriberUserId" INTEGER NOT NULL,"SubscriptionId" TEXT NOT NULL,"Plan" TEXT NOT NULL,"Status" TEXT NOT NULL,
 "Currency" TEXT NOT NULL,"MonthlyRecurringMinor" INTEGER NULL,"ObservedAt" TEXT NOT NULL,
 CONSTRAINT "FK_SalesPartnerSubscriptionSnapshot_Users_SubscriberUserId" FOREIGN KEY("SubscriberUserId") REFERENCES "Users"("Id") ON DELETE RESTRICT);
CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesPartnerSubscriptionSnapshot_SubscriptionId" ON "SalesPartnerSubscriptionSnapshot"("SubscriptionId");
CREATE INDEX IF NOT EXISTS "IX_SalesPartnerSubscriptionSnapshot_SubscriberUserId" ON "SalesPartnerSubscriptionSnapshot"("SubscriberUserId");
