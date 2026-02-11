import { z } from 'zod';

export const auditLogEvent = z.object({
	id: z.string(),
	eventName: z.string(),
	timestamp: z.string(),
	userId: z.string().nullable(),
	payload: z.record(z.string(), z.unknown()).nullable(),
});

export type AuditLogEvent = z.infer<typeof auditLogEvent>;
