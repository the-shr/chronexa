-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyTargetHours" DOUBLE PRECISION,
ADD COLUMN     "officeEnd" TEXT,
ADD COLUMN     "officeStart" TEXT,
ADD COLUMN     "weeklyTargetHours" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL DEFAULT 'org',
    "officeStart" TEXT NOT NULL DEFAULT '09:00',
    "officeEnd" TEXT NOT NULL DEFAULT '17:00',
    "workDays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "dailyTargetHours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "weeklyTargetHours" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "idleThresholdMinutes" INTEGER NOT NULL DEFAULT 5,
    "idleOnTimeout" TEXT NOT NULL DEFAULT 'pause',
    "countIdleAsWork" BOOLEAN NOT NULL DEFAULT false,
    "screenshotsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "screenshotIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
    "screenshotRandomize" BOOLEAN NOT NULL DEFAULT true,
    "screenshotQuality" INTEGER NOT NULL DEFAULT 60,
    "screenshotAllMonitors" BOOLEAN NOT NULL DEFAULT true,
    "screenshotBlur" BOOLEAN NOT NULL DEFAULT false,
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recordingMode" TEXT NOT NULL DEFAULT 'interval',
    "recordingIntervalMinutes" INTEGER NOT NULL DEFAULT 3,
    "recordingDurationSeconds" INTEGER NOT NULL DEFAULT 5,
    "recordingSegmentMinutes" INTEGER NOT NULL DEFAULT 5,
    "recordingMaxWidth" INTEGER NOT NULL DEFAULT 1280,
    "recordingFrameRate" INTEGER NOT NULL DEFAULT 12,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

