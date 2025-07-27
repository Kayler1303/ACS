-- AlterEnum
ALTER TYPE "OverrideRequestType" ADD VALUE 'PROPERTY_DELETION';

-- AlterTable
ALTER TABLE "OverrideRequest" ADD COLUMN     "propertyId" TEXT;

-- AddForeignKey
ALTER TABLE "OverrideRequest" ADD CONSTRAINT "OverrideRequest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
