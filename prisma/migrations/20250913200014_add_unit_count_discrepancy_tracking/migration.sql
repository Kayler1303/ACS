-- CreateEnum
CREATE TYPE "UnitDiscrepancyStatus" AS ENUM ('PENDING', 'RESOLVED', 'WAIVED');

-- CreateTable
CREATE TABLE "UnitCountDiscrepancy" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "declaredUnitCount" INTEGER NOT NULL,
    "actualUnitCount" INTEGER NOT NULL,
    "rentRollId" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "UnitDiscrepancyStatus" NOT NULL DEFAULT 'PENDING',
    "paymentDifference" DECIMAL(10,2) NOT NULL,
    "setupType" "SetupType" NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNotes" TEXT,

    CONSTRAINT "UnitCountDiscrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnitCountDiscrepancy_propertyId_idx" ON "UnitCountDiscrepancy"("propertyId");

-- CreateIndex
CREATE INDEX "UnitCountDiscrepancy_status_idx" ON "UnitCountDiscrepancy"("status");

-- CreateIndex
CREATE INDEX "UnitCountDiscrepancy_discoveredAt_idx" ON "UnitCountDiscrepancy"("discoveredAt");

-- AddForeignKey
ALTER TABLE "UnitCountDiscrepancy" ADD CONSTRAINT "UnitCountDiscrepancy_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitCountDiscrepancy" ADD CONSTRAINT "UnitCountDiscrepancy_rentRollId_fkey" FOREIGN KEY ("rentRollId") REFERENCES "RentRoll"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitCountDiscrepancy" ADD CONSTRAINT "UnitCountDiscrepancy_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
