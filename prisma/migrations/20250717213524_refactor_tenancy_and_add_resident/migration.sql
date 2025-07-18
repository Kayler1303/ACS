/*
  Warnings:

  - You are about to drop the column `annualizedIncome` on the `Tenancy` table. All the data in the column will be lost.
  - You are about to drop the column `residentName` on the `Tenancy` table. All the data in the column will be lost.
  - You are about to drop the `AmiData` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BedroomMapping` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MaxRentData` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Tenancy" DROP COLUMN "annualizedIncome",
DROP COLUMN "residentName";

-- DropTable
DROP TABLE "AmiData";

-- DropTable
DROP TABLE "BedroomMapping";

-- DropTable
DROP TABLE "MaxRentData";

-- CreateTable
CREATE TABLE "Resident" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "annualizedIncome" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenancyId" TEXT NOT NULL,

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
