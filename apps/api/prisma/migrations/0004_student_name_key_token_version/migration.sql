-- Case/space-insensitive student names, and revocable student sessions.
ALTER TABLE "Student" ADD COLUMN "nameKey" TEXT;
UPDATE "Student" SET "nameKey" = lower(regexp_replace(btrim("displayName"), '\s+', ' ', 'g'));
ALTER TABLE "Student" ALTER COLUMN "nameKey" SET NOT NULL;
DROP INDEX "Student_classroomId_displayName_key";
CREATE UNIQUE INDEX "Student_classroomId_nameKey_key" ON "Student"("classroomId", "nameKey");

ALTER TABLE "Student" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
