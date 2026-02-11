import type { AuditLogListResponse, AuditLogFilterDto } from '@n8n/api-types';

import type { IRestApiContext } from '../types';
import { makeRestApiRequest } from '../utils';

export async function getAuditLogs(
	context: IRestApiContext,
	filters?: AuditLogFilterDto,
): Promise<AuditLogListResponse> {
	const params: Record<string, string | number> = {};
	if (filters?.eventName) params.eventName = filters.eventName;
	if (filters?.userId) params.userId = filters.userId;
	if (filters?.after) params.after = filters.after;
	if (filters?.before) params.before = filters.before;
	if (filters?.skip !== undefined) params.skip = filters.skip;
	if (filters?.take !== undefined) params.take = filters.take;

	return await makeRestApiRequest(
		context,
		'GET',
		'/audit-log/events',
		Object.keys(params).length > 0 ? params : undefined,
	);
}
