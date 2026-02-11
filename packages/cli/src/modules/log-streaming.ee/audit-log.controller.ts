import { AuditLogEvent, auditLogEvent } from '@n8n/api-types';
import { Get, GlobalScope, Licensed, RestController } from '@n8n/decorators';

@RestController('/audit-log')
export class AuditLogController {
	constructor() {}

	@Get('/events')
	@Licensed('feat:logStreaming')
	@GlobalScope('auditLogs:manage')
	async getEvents(): Promise<AuditLogEvent[]> {
		return [].map(auditLogEvent.parse);
	}
}
