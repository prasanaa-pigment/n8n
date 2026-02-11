import type { AuditLogFilterDto } from '@n8n/api-types';
import { Service } from '@n8n/di';
import type { FindOptionsWhere } from '@n8n/typeorm';
import { LessThan, MoreThan, And } from '@n8n/typeorm';

import type { AuditLog } from './database/entities';
import { AuditLogRepository } from './database/repositories/audit-log.repository';
import { LogStreamingDestinationService } from './log-streaming-destination.service';

@Service()
export class AuditLogService {
	constructor(
		private readonly auditLogRepository: AuditLogRepository,
		private readonly logStreamingDestinationService: LogStreamingDestinationService,
	) {}

	async getEvents(filter: AuditLogFilterDto): Promise<AuditLog[]> {
		const where: FindOptionsWhere<AuditLog> = {};

		if (filter.eventName) {
			where.eventName = filter.eventName;
		}

		if (filter.userId) {
			where.userId = filter.userId;
		}

		if (filter.after && filter.before) {
			where.timestamp = And(MoreThan(new Date(filter.after)), LessThan(new Date(filter.before)));
		} else if (filter.after) {
			where.timestamp = MoreThan(new Date(filter.after));
		} else if (filter.before) {
			where.timestamp = LessThan(new Date(filter.before));
		}

		const dbEvents = await this.auditLogRepository.find({
			take: 50,
			order: { timestamp: 'DESC' },
			where,
		});

		const bufferedEvents = this.getFilteredBufferedEvents(filter);

		return [...bufferedEvents, ...dbEvents]
			.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
			.slice(0, 50);
	}

	private getFilteredBufferedEvents(filter: AuditLogFilterDto): AuditLog[] {
		const dbDestination = this.logStreamingDestinationService.getDatabaseDestination();
		if (!dbDestination) return [];

		const afterDate = filter.after ? new Date(filter.after) : undefined;
		const beforeDate = filter.before ? new Date(filter.before) : undefined;

		return dbDestination.getBufferedEvents().filter((event) => {
			if (filter.eventName && event.eventName !== filter.eventName) return false;
			if (filter.userId && event.userId !== filter.userId) return false;
			if (afterDate && event.timestamp <= afterDate) return false;
			if (beforeDate && event.timestamp >= beforeDate) return false;
			return true;
		});
	}
}
