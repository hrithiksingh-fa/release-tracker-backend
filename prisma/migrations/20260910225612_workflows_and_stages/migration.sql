/*
  Warnings:

  - You are about to drop the column `status` on the `Requirement` table. All the data in the column will be lost.
  - You are about to drop the column `requirementsCompleted` on the `SyncRun` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "WorkflowScope" AS ENUM ('PROJECT', 'REQUIREMENT');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "currentStageId" TEXT;

-- AlterTable
ALTER TABLE "Requirement" DROP COLUMN "status",
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "stageId" TEXT;

-- AlterTable
ALTER TABLE "SyncRun" DROP COLUMN "requirementsCompleted";

-- DropEnum
DROP TYPE "RequirementStatus";

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isDoneStage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "WorkflowScope" NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "ownerClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStage" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "WorkflowStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Stage_name_key" ON "Stage"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_ownerClientId_key" ON "Workflow"("ownerClientId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStage_workflowId_stageId_key" ON "WorkflowStage"("workflowId", "stageId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStage_workflowId_position_key" ON "WorkflowStage"("workflowId", "position");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "WorkflowStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_ownerClientId_fkey" FOREIGN KEY ("ownerClientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "WorkflowStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
