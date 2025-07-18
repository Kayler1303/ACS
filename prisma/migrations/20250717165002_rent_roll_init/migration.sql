/*
  Warnings:

  - You are about to drop the column `amiPercentage` on the `Unit` table. All the data in the column will be lost.
  - You are about to drop the column `leaseRent` on the `Unit` table. All the data in the column will be lost.
  - You are about to drop the column `qualifiesIncome50` on the `Unit` table. All the data in the column will be lost.
  - You are about to drop the column `qualifiesIncome60` on the `Unit` table. All the data in the column will be lost.
  - You are about to drop the column `qualifiesIncome80` on the `Unit` table. All the data in the column will be lost.
  - You are about to drop the column `qualifiesRentAndIncome50` on the `Unit` table. All the data in the column will be lost.
  - You are about to drop the column `qualifiesRentAndIncome60` on the `Unit` table. All the data in the column will be lost.
  - You are about to drop the column `qualifiesRentAndIncome80` on the `Unit` table. All the data in the column will be lost.
  - You are about to drop the `Resident` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Resident" DROP CONSTRAINT "Resident_unitId_fkey";

-- AlterTable
ALTER TABLE "Unit" DROP COLUMN "amiPercentage",
DROP COLUMN "leaseRent",
DROP COLUMN "qualifiesIncome50",
DROP COLUMN "qualifiesIncome60",
DROP COLUMN "qualifiesIncome80",
DROP COLUMN "qualifiesRentAndIncome50",
DROP COLUMN "qualifiesRentAndIncome60",
DROP COLUMN "qualifiesRentAndIncome80";

-- DropTable
DROP TABLE "Resident";

-- CreateTable
CREATE TABLE "RentRoll" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "propertyId" TEXT NOT NULL,

    CONSTRAINT "RentRoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenancy" (
    "id" TEXT NOT NULL,
    "residentName" TEXT,
    "leaseRent" DECIMAL(65,30),
    "annualizedIncome" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unitId" TEXT NOT NULL,
    "rentRollId" TEXT NOT NULL,

    CONSTRAINT "Tenancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentRoll_propertyId_date_key" ON "RentRoll"("propertyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Tenancy_unitId_rentRollId_key" ON "Tenancy"("unitId", "rentRollId");

-- AddForeignKey
ALTER TABLE "RentRoll" ADD CONSTRAINT "RentRoll_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_rentRollId_fkey" FOREIGN KEY ("rentRollId") REFERENCES "RentRoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
