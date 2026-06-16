import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { auditLog, users } from "./db/schema";

export type AuditEntry = {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string;
  summary: string;
  userEmail: string | null;
  userName: string | null;
};

export async function getAuditLog(limit = 250): Promise<AuditEntry[]> {
  const db = await getDb();
  return db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      action: auditLog.action,
      entityType: auditLog.entityType,
      summary: auditLog.summary,
      userEmail: auditLog.userEmail,
      userName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
