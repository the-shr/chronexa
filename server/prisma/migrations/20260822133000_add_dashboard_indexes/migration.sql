CREATE INDEX IF NOT EXISTS "WorkSession_startedAt_idx" ON "WorkSession"("startedAt");
CREATE INDEX IF NOT EXISTS "WorkSession_updatedAt_idx" ON "WorkSession"("updatedAt");
CREATE INDEX IF NOT EXISTS "Screenshot_capturedAt_idx" ON "Screenshot"("capturedAt");
CREATE INDEX IF NOT EXISTS "Recording_startedAt_idx" ON "Recording"("startedAt");
