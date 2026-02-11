import { z } from 'zod';

import { Z } from '../../zod-class';

export const auditLogEvent = z.object({
	id: z.string(),
	eventName: z.string(),
	timestamp: z.date(),
	userId: z.string().nullish(),
	user: z
		.object({
			id: z.string(),
			email: z.string(),
			firstName: z.string().nullable(),
			lastName: z.string().nullable(),
		})
		.nullish(),
	payload: z.record(z.string(), z.unknown()).nullable(),
});

export type AuditLogEvent = z.infer<typeof auditLogEvent>;

export class AuditLogFilterDto extends Z.class({
	eventName: z.string().optional(),
	userId: z.string().optional(),
	after: z.string().datetime().optional(),
	before: z.string().datetime().optional(),
	skip: z.coerce.number().int().min(0).optional(),
	take: z.coerce.number().int().min(1).max(100).optional(),
}) {}

export const auditLogListResponse = z.object({
	data: z.array(auditLogEvent),
	count: z.number().int().min(0),
	skip: z.number().int().min(0),
	take: z.number().int().min(1),
});

export type AuditLogListResponse = z.infer<typeof auditLogListResponse>;
