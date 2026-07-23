-- AlterTable
ALTER TABLE "User" DROP COLUMN "dailyTargetHours",
DROP COLUMN "officeEnd",
DROP COLUMN "officeStart",
DROP COLUMN "weeklyTargetHours",
ADD COLUMN     "overrides" JSONB;

