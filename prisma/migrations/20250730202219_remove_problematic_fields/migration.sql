/*
  Warnings:

  - You are about to drop the column `calculatedAnnualizedIncome` on the `IncomeDocument` table. All the data in the column will be lost.
  - You are about to drop the column `calculatedAnnualizedIncome` on the `Resident` table. All the data in the column will be lost.
  - You are about to drop the column `finalizedAt` on the `Resident` table. All the data in the column will be lost.
  - You are about to drop the column `hasNoIncome` on the `Resident` table. All the data in the column will be lost.
  - You are about to drop the column `incomeFinalized` on the `Resident` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "IncomeDocument" DROP COLUMN "calculatedAnnualizedIncome";

-- AlterTable
ALTER TABLE "Resident" DROP COLUMN "calculatedAnnualizedIncome",
DROP COLUMN "finalizedAt",
DROP COLUMN "hasNoIncome",
DROP COLUMN "incomeFinalized";
