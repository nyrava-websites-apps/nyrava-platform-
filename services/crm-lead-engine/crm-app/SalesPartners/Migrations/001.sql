-- Sales Partner schema v1; existing CRM Users table is preserved.
CREATE TABLE IF NOT EXISTS "SalesCommissionEntry" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesCommissionEntry" PRIMARY KEY AUTOINCREMENT,

    "IdempotencyKey" TEXT NOT NULL,

    "RelationshipId" INTEGER NOT NULL,

    "RepresentativeId" INTEGER NOT NULL,

    "BillingEventId" INTEGER NOT NULL,

    "CompensationVersionId" INTEGER NOT NULL,

    "Kind" TEXT NOT NULL,

    "AmountMinor" INTEGER NOT NULL,

    "Currency" TEXT NOT NULL,

    "EarnedAt" TEXT NOT NULL,

    "QualifyingSaleOrdinal" INTEGER NULL,

    CONSTRAINT "FK_SalesCommissionEntry_SalesPartnerBillingEvent_BillingEventId" FOREIGN KEY ("BillingEventId") REFERENCES "SalesPartnerBillingEvent" ("Id") ON DELETE RESTRICT,

    CONSTRAINT "FK_SalesCommissionEntry_SalesPartnerCommissionVersion_CompensationVersionId" FOREIGN KEY ("CompensationVersionId") REFERENCES "SalesPartnerCommissionVersion" ("Id") ON DELETE RESTRICT,

    CONSTRAINT "FK_SalesCommissionEntry_SalesSalesRepresentative_RepresentativeId" FOREIGN KEY ("RepresentativeId") REFERENCES "SalesSalesRepresentative" ("Id") ON DELETE RESTRICT,

    CONSTRAINT "FK_SalesCommissionEntry_SalesSubscriberRelationship_RelationshipId" FOREIGN KEY ("RelationshipId") REFERENCES "SalesSubscriberRelationship" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS "SalesPartnerActivity" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerActivity" PRIMARY KEY AUTOINCREMENT,

    "RelationshipId" INTEGER NOT NULL,

    "RepresentativeId" INTEGER NOT NULL,

    "ExistingCrmActivityId" INTEGER NULL,

    "Kind" TEXT NOT NULL,

    "DeliveryReference" TEXT NOT NULL,

    "Subject" TEXT NOT NULL,

    "StartsAt" TEXT NULL,

    "Completed" INTEGER NOT NULL,

    "EffectiveAt" TEXT NOT NULL,

    CONSTRAINT "FK_SalesPartnerActivity_SalesSubscriberRelationship_RelationshipId" FOREIGN KEY ("RelationshipId") REFERENCES "SalesSubscriberRelationship" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS "SalesPartnerAdjustment" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerAdjustment" PRIMARY KEY AUTOINCREMENT,

    "CommissionEntryId" INTEGER NOT NULL,

    "AmountMinor" INTEGER NOT NULL,

    "Reason" TEXT NOT NULL,

    "AuthorizedByUserId" INTEGER NOT NULL,

    "CreatedAt" TEXT NOT NULL,

    CONSTRAINT "FK_SalesPartnerAdjustment_SalesCommissionEntry_CommissionEntryId" FOREIGN KEY ("CommissionEntryId") REFERENCES "SalesCommissionEntry" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS "SalesPartnerAuditEvent" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerAuditEvent" PRIMARY KEY AUTOINCREMENT,

    "ActorUserId" INTEGER NOT NULL,

    "EntityType" TEXT NOT NULL,

    "EntityId" INTEGER NOT NULL,

    "Action" TEXT NOT NULL,

    "EvidenceJson" TEXT NOT NULL,

    "CreatedAt" TEXT NOT NULL

);

CREATE TABLE IF NOT EXISTS "SalesPartnerBillingEvent" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerBillingEvent" PRIMARY KEY AUTOINCREMENT,

    "ProviderEventId" TEXT NOT NULL,

    "SubscriberUserId" INTEGER NOT NULL,

    "Kind" TEXT NOT NULL,

    "InvoiceId" TEXT NOT NULL,

    "PaymentId" TEXT NOT NULL,

    "SubscriptionId" TEXT NOT NULL,

    "Plan" TEXT NOT NULL,

    "Currency" TEXT NOT NULL,

    "InvoicedMinor" INTEGER NOT NULL,

    "ReceivedMinor" INTEGER NOT NULL,

    "KnownFeeMinor" INTEGER NULL,

    "EffectiveAt" TEXT NOT NULL,

    "ReceivedAt" TEXT NOT NULL,

    "PeriodStart" TEXT NULL,

    "PeriodEnd" TEXT NULL,

    CONSTRAINT "FK_SalesPartnerBillingEvent_Users_SubscriberUserId" FOREIGN KEY ("SubscriberUserId") REFERENCES "Users" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS "SalesPartnerCommissionPlan" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerCommissionPlan" PRIMARY KEY AUTOINCREMENT,

    "Name" TEXT NOT NULL

);

CREATE TABLE IF NOT EXISTS "SalesPartnerCommissionVersion" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerCommissionVersion" PRIMARY KEY AUTOINCREMENT,

    "PlanId" INTEGER NOT NULL,

    "Version" INTEGER NOT NULL,

    "EffectiveFrom" TEXT NOT NULL,

    "ApprovedByUserId" INTEGER NOT NULL,

    "RulesJson" TEXT NOT NULL,

    CONSTRAINT "FK_SalesPartnerCommissionVersion_SalesPartnerCommissionPlan_PlanId" FOREIGN KEY ("PlanId") REFERENCES "SalesPartnerCommissionPlan" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS "SalesPartnerInvitation" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerInvitation" PRIMARY KEY AUTOINCREMENT,

    "RepresentativeId" INTEGER NOT NULL,

    "TokenHash" TEXT NOT NULL,

    "ExpiresAt" TEXT NOT NULL,

    "AcceptedAt" TEXT NULL

);

CREATE TABLE IF NOT EXISTS "SalesPartnerPayoutBatch" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerPayoutBatch" PRIMARY KEY AUTOINCREMENT,

    "CutoffAt" TEXT NOT NULL,

    "PayableAt" TEXT NOT NULL,

    "State" INTEGER NOT NULL,
    "PayableTimeZoneId" TEXT NOT NULL DEFAULT 'UTC',

    "Currency" TEXT NOT NULL,

    "ApproverUserId" INTEGER NULL,

    "ApprovedAt" TEXT NULL,

    "ProviderConfirmation" TEXT NULL,

    "ProviderIdempotencyKey" TEXT NOT NULL,

    "ConfirmedAt" TEXT NULL

);

CREATE TABLE IF NOT EXISTS "SalesPartnerPayoutItem" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerPayoutItem" PRIMARY KEY AUTOINCREMENT,

    "BatchId" INTEGER NOT NULL,

    "CommissionEntryId" INTEGER NOT NULL,

    "AmountMinor" INTEGER NOT NULL,

    CONSTRAINT "FK_SalesPartnerPayoutItem_SalesCommissionEntry_CommissionEntryId" FOREIGN KEY ("CommissionEntryId") REFERENCES "SalesCommissionEntry" ("Id") ON DELETE RESTRICT,

    CONSTRAINT "FK_SalesPartnerPayoutItem_SalesPartnerPayoutBatch_BatchId" FOREIGN KEY ("BatchId") REFERENCES "SalesPartnerPayoutBatch" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS "SalesPartnerPayrollSchedule" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerPayrollSchedule" PRIMARY KEY AUTOINCREMENT,

    "Payday" INTEGER NOT NULL,

    "CutoffDay" INTEGER NOT NULL,

    "CutoffHour" INTEGER NOT NULL,

    "TimeZoneId" TEXT NOT NULL,

    "ApprovedByUserId" INTEGER NOT NULL,

    "CreatedAt" TEXT NOT NULL

);

CREATE TABLE IF NOT EXISTS "SalesPartnerProspect" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerProspect" PRIMARY KEY AUTOINCREMENT,

    "RepresentativeId" INTEGER NOT NULL,

    "Name" TEXT NOT NULL,

    "Email" TEXT NOT NULL,

    "Phone" TEXT NOT NULL,

    "Stage" TEXT NOT NULL,

    "Notes" TEXT NOT NULL,

    "CreatedAt" TEXT NOT NULL,

    CONSTRAINT "FK_SalesPartnerProspect_SalesSalesRepresentative_RepresentativeId" FOREIGN KEY ("RepresentativeId") REFERENCES "SalesSalesRepresentative" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS "SalesPartnerSupportTicket" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerSupportTicket" PRIMARY KEY AUTOINCREMENT,

    "RelationshipId" INTEGER NOT NULL,

    "AssignedRepresentativeId" INTEGER NOT NULL,

    "Subject" TEXT NOT NULL,

    "Status" TEXT NOT NULL,

    "Channel" TEXT NOT NULL,

    "CreatedAt" TEXT NOT NULL,

    "DueAt" TEXT NULL,

    "ResolvedAt" TEXT NULL,

    CONSTRAINT "FK_SalesPartnerSupportTicket_SalesSubscriberRelationship_RelationshipId" FOREIGN KEY ("RelationshipId") REFERENCES "SalesSubscriberRelationship" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS "SalesPartnerTicketMessage" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerTicketMessage" PRIMARY KEY AUTOINCREMENT,

    "TicketId" INTEGER NOT NULL,

    "AuthorUserId" INTEGER NOT NULL,

    "Body" TEXT NOT NULL,

    "CreatedAt" TEXT NOT NULL,

    CONSTRAINT "FK_SalesPartnerTicketMessage_SalesPartnerSupportTicket_TicketId" FOREIGN KEY ("TicketId") REFERENCES "SalesPartnerSupportTicket" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS "SalesPartnerWebhookReceipt" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesPartnerWebhookReceipt" PRIMARY KEY AUTOINCREMENT,

    "EventId" TEXT NOT NULL,

    "PayloadHash" TEXT NOT NULL,

    "EffectiveAt" TEXT NOT NULL,

    "ReceivedAt" TEXT NOT NULL

);

CREATE TABLE IF NOT EXISTS "SalesRepresentativeAgreement" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesRepresentativeAgreement" PRIMARY KEY AUTOINCREMENT,

    "RepresentativeId" INTEGER NOT NULL,

    "Version" TEXT NOT NULL,

    "EvidenceReference" TEXT NOT NULL,

    "AcceptedAt" TEXT NOT NULL,

    CONSTRAINT "FK_SalesRepresentativeAgreement_SalesSalesRepresentative_RepresentativeId" FOREIGN KEY ("RepresentativeId") REFERENCES "SalesSalesRepresentative" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS "SalesRepresentativeReferral" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesRepresentativeReferral" PRIMARY KEY AUTOINCREMENT,

    "RepresentativeId" INTEGER NOT NULL,

    "SubscriberUserId" INTEGER NOT NULL,

    "RegisteredAt" TEXT NOT NULL,

    "ReferralCode" TEXT NOT NULL,

    CONSTRAINT "FK_SalesRepresentativeReferral_SalesSalesRepresentative_RepresentativeId" FOREIGN KEY ("RepresentativeId") REFERENCES "SalesSalesRepresentative" ("Id") ON DELETE RESTRICT,

    CONSTRAINT "FK_SalesRepresentativeReferral_Users_SubscriberUserId" FOREIGN KEY ("SubscriberUserId") REFERENCES "Users" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS "SalesSalesRepresentative" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesSalesRepresentative" PRIMARY KEY AUTOINCREMENT,

    "UserId" INTEGER NOT NULL,

    "Name" TEXT NOT NULL,

    "ReferralCode" TEXT NOT NULL,

    "Active" INTEGER NOT NULL,

    "Status" TEXT NOT NULL,

    "Availability" TEXT NOT NULL,

    "AuthorizedContactJson" TEXT NOT NULL,

    CONSTRAINT "FK_SalesSalesRepresentative_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS SalesSchemaVersions (Version INTEGER PRIMARY KEY, AppliedAt TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS "SalesSubscriberOwnershipChange" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesSubscriberOwnershipChange" PRIMARY KEY AUTOINCREMENT,

    "RelationshipId" INTEGER NOT NULL,

    "PreviousRepresentativeId" INTEGER NOT NULL,

    "NewRepresentativeId" INTEGER NOT NULL,

    "ChangesResidualOwnership" INTEGER NOT NULL,

    "ApprovedByUserId" INTEGER NOT NULL,

    "EffectiveAt" TEXT NOT NULL,

    "Reason" TEXT NOT NULL,

    CONSTRAINT "FK_SalesSubscriberOwnershipChange_SalesSubscriberRelationship_RelationshipId" FOREIGN KEY ("RelationshipId") REFERENCES "SalesSubscriberRelationship" ("Id") ON DELETE RESTRICT

);

CREATE TABLE IF NOT EXISTS "SalesSubscriberRelationship" (

    "Id" INTEGER NOT NULL CONSTRAINT "PK_SalesSubscriberRelationship" PRIMARY KEY AUTOINCREMENT,

    "SubscriberUserId" INTEGER NOT NULL,
    "ResidualEligibleFrom" TEXT NOT NULL,

    "AcquiringRepresentativeId" INTEGER NULL,

    "SupportRepresentativeId" INTEGER NOT NULL,

    "ResidualRepresentativeId" INTEGER NOT NULL,

    "AcquisitionBillingEventId" INTEGER NULL,

    "OriginalCompensationVersionId" INTEGER NULL,

    "OriginalPlan" TEXT NOT NULL,

    "RegisteredAt" TEXT NULL,

    "AcquiredAt" TEXT NULL,

    CONSTRAINT "FK_SalesSubscriberRelationship_SalesSalesRepresentative_AcquiringRepresentativeId" FOREIGN KEY ("AcquiringRepresentativeId") REFERENCES "SalesSalesRepresentative" ("Id") ON DELETE RESTRICT,

    CONSTRAINT "FK_SalesSubscriberRelationship_SalesSalesRepresentative_SupportRepresentativeId" FOREIGN KEY ("SupportRepresentativeId") REFERENCES "SalesSalesRepresentative" ("Id") ON DELETE RESTRICT,

    CONSTRAINT "FK_SalesSubscriberRelationship_Users_SubscriberUserId" FOREIGN KEY ("SubscriberUserId") REFERENCES "Users" ("Id") ON DELETE RESTRICT

);

CREATE INDEX IF NOT EXISTS "IX_SalesCommissionEntry_BillingEventId" ON "SalesCommissionEntry" ("BillingEventId");

CREATE INDEX IF NOT EXISTS "IX_SalesCommissionEntry_CompensationVersionId" ON "SalesCommissionEntry" ("CompensationVersionId");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesCommissionEntry_IdempotencyKey" ON "SalesCommissionEntry" ("IdempotencyKey");

CREATE INDEX IF NOT EXISTS "IX_SalesCommissionEntry_RelationshipId" ON "SalesCommissionEntry" ("RelationshipId");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesCommissionEntry_RepresentativeId_Kind_QualifyingSaleOrdinal" ON "SalesCommissionEntry" ("RepresentativeId", "Kind", "QualifyingSaleOrdinal");

CREATE INDEX IF NOT EXISTS "IX_SalesPartnerActivity_RelationshipId" ON "SalesPartnerActivity" ("RelationshipId");

CREATE INDEX IF NOT EXISTS "IX_SalesPartnerAdjustment_CommissionEntryId" ON "SalesPartnerAdjustment" ("CommissionEntryId");

CREATE INDEX IF NOT EXISTS "IX_SalesPartnerAuditEvent_EntityType_EntityId_CreatedAt" ON "SalesPartnerAuditEvent" ("EntityType", "EntityId", "CreatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesPartnerBillingEvent_ProviderEventId" ON "SalesPartnerBillingEvent" ("ProviderEventId");

CREATE INDEX IF NOT EXISTS "IX_SalesPartnerBillingEvent_SubscriberUserId_EffectiveAt" ON "SalesPartnerBillingEvent" ("SubscriberUserId", "EffectiveAt");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesPartnerCommissionVersion_PlanId_Version" ON "SalesPartnerCommissionVersion" ("PlanId", "Version");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesPartnerInvitation_TokenHash" ON "SalesPartnerInvitation" ("TokenHash");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesPartnerPayoutBatch_ProviderConfirmation" ON "SalesPartnerPayoutBatch" ("ProviderConfirmation");

CREATE INDEX IF NOT EXISTS "IX_SalesPartnerPayoutItem_BatchId" ON "SalesPartnerPayoutItem" ("BatchId");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesPartnerPayoutItem_CommissionEntryId" ON "SalesPartnerPayoutItem" ("CommissionEntryId");

CREATE INDEX IF NOT EXISTS "IX_SalesPartnerProspect_RepresentativeId" ON "SalesPartnerProspect" ("RepresentativeId");

CREATE INDEX IF NOT EXISTS "IX_SalesPartnerSupportTicket_RelationshipId" ON "SalesPartnerSupportTicket" ("RelationshipId");

CREATE INDEX IF NOT EXISTS "IX_SalesPartnerTicketMessage_TicketId" ON "SalesPartnerTicketMessage" ("TicketId");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesPartnerWebhookReceipt_EventId" ON "SalesPartnerWebhookReceipt" ("EventId");

CREATE INDEX IF NOT EXISTS "IX_SalesRepresentativeAgreement_RepresentativeId" ON "SalesRepresentativeAgreement" ("RepresentativeId");

CREATE INDEX IF NOT EXISTS "IX_SalesRepresentativeReferral_RepresentativeId" ON "SalesRepresentativeReferral" ("RepresentativeId");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesRepresentativeReferral_SubscriberUserId" ON "SalesRepresentativeReferral" ("SubscriberUserId");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesSalesRepresentative_ReferralCode" ON "SalesSalesRepresentative" ("ReferralCode");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesSalesRepresentative_UserId" ON "SalesSalesRepresentative" ("UserId");

CREATE INDEX IF NOT EXISTS "IX_SalesSubscriberOwnershipChange_RelationshipId" ON "SalesSubscriberOwnershipChange" ("RelationshipId");

CREATE INDEX IF NOT EXISTS "IX_SalesSubscriberRelationship_AcquiringRepresentativeId" ON "SalesSubscriberRelationship" ("AcquiringRepresentativeId");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_SalesSubscriberRelationship_SubscriberUserId" ON "SalesSubscriberRelationship" ("SubscriberUserId");

CREATE INDEX IF NOT EXISTS "IX_SalesSubscriberRelationship_SupportRepresentativeId" ON "SalesSubscriberRelationship" ("SupportRepresentativeId");