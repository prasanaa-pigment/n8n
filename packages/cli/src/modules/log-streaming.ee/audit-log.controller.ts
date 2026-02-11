import { AuditLogListResponse, auditLogEvent, AuditLogFilterDto } from '@n8n/api-types';
import { AuthenticatedRequest } from '@n8n/db';
import { Get, GlobalScope, Licensed, Query, RestController } from '@n8n/decorators';

import { AuditLogService } from './audit-log.service';

@RestController('/audit-log')
export class AuditLogController {
	constructor(private readonly auditLogService: AuditLogService) {}

	@Get('/events')
	@Licensed('feat:logStreaming')
	@GlobalScope('auditLogs:manage')
	async getEvents(
		_req: AuthenticatedRequest,
		_res: unknown,
		@Query query: AuditLogFilterDto,
	): Promise<AuditLogListResponse> {
		const result = await this.auditLogService.getEvents(query);
		return {
			data: result.data.map((event) => auditLogEvent.parse(event)),
			count: result.count,
			skip: result.skip,
			take: result.take,
		};
	}
}
