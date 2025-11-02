/*
  Warnings:

  - The primary key for the `accounts` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `type` on the `accounts` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `provider` on the `accounts` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `providerAccountId` on the `accounts` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `token_type` on the `accounts` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `session_state` on the `accounts` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to drop the column `language` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `settings` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `theme` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `timezone` on the `users` table. All the data in the column will be lost.
  - You are about to alter the column `twoFactorSecret` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(32)`.
  - A unique constraint covering the columns `[provider,providerAccountId]` on the table `accounts` will be added. If there are existing duplicate values, this will fail.
  - The required column `id` was added to the `accounts` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- CreateEnum
CREATE TYPE "VerificationTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_pkey",
ADD COLUMN     "id" TEXT NOT NULL,
ALTER COLUMN "type" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "provider" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "providerAccountId" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "token_type" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "session_state" SET DATA TYPE VARCHAR(500),
ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" DROP COLUMN "language",
DROP COLUMN "settings",
DROP COLUMN "theme",
DROP COLUMN "timezone",
ALTER COLUMN "twoFactorSecret" SET DATA TYPE VARCHAR(32);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "type" "VerificationTokenType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "theme" VARCHAR(20) NOT NULL DEFAULT 'light',
    "settings" JSONB,
    "defaultWorkHours" INTEGER NOT NULL DEFAULT 8,
    "workWeekStartDay" INTEGER NOT NULL DEFAULT 1,
    "workWeekEndDay" INTEGER NOT NULL DEFAULT 5,
    "workingDaysPerWeek" INTEGER NOT NULL DEFAULT 5,
    "overtimeThreshold" INTEGER NOT NULL DEFAULT 40,
    "autoClockOut" BOOLEAN NOT NULL DEFAULT false,
    "lunchDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "breakDurationMinutes" INTEGER NOT NULL DEFAULT 15,
    "requireClockOut" BOOLEAN NOT NULL DEFAULT true,
    "requireNotesOnClockOut" BOOLEAN NOT NULL DEFAULT false,
    "allowLateClockIn" BOOLEAN NOT NULL DEFAULT false,
    "lateClockInTolerance" INTEGER NOT NULL DEFAULT 15,
    "autoPauseBreaks" BOOLEAN NOT NULL DEFAULT true,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderBeforeClockOut" INTEGER NOT NULL DEFAULT 15,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "smsNotifications" BOOLEAN NOT NULL DEFAULT false,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "weeklyReportEmails" BOOLEAN NOT NULL DEFAULT true,
    "overtimeAlerts" BOOLEAN NOT NULL DEFAULT true,
    "dateFormat" VARCHAR(50) NOT NULL DEFAULT 'MM/DD/YYYY',
    "timeFormat" VARCHAR(10) NOT NULL DEFAULT '12h',
    "weekStartOn" VARCHAR(20) NOT NULL DEFAULT 'monday',
    "showWeekends" BOOLEAN NOT NULL DEFAULT false,
    "showHolidays" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "verification_tokens_token_idx" ON "verification_tokens"("token");

-- CreateIndex
CREATE INDEX "verification_tokens_userId_idx" ON "verification_tokens"("userId");

-- CreateIndex
CREATE INDEX "verification_tokens_type_idx" ON "verification_tokens"("type");

-- CreateIndex
CREATE INDEX "verification_tokens_userId_type_idx" ON "verification_tokens"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "accounts_provider_idx" ON "accounts"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "password_histories_userId_createdAt_idx" ON "password_histories"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
