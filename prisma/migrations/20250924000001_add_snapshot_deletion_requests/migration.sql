-- AlterEnum
ALTER TYPE "OverrideRequestType" ADD VALUE 'SNAPSHOT_DELETION';

-- AlterTable
ALTER TABLE "OverrideRequest" ADD COLUMN "snapshotId" TEXT;

-- AddForeignKey
ALTER TABLE "OverrideRequest" ADD CONSTRAINT "OverrideRequest_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RentRollSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
