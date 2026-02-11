import type { AuditLogFilterDto } from '@n8n/api-types';
import { UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import type { FindOptionsWhere } from '@n8n/typeorm';
import { LessThan, MoreThan, And } from '@n8n/typeorm';

import type { AuditLog } from './database/entities';
import { AuditLogRepository } from './database/repositories/audit-log.repository';
import { LogStreamingDestinationService } from './log-streaming-destination.service';

export interface AuditLogListResult {
	data: AuditLog[];
	count: number;
	skip: number;
	take: number;
}

@Service()
export class AuditLogService {
	constructor(
		private readonly auditLogRepository: AuditLogRepository,
		private readonly userRepository: UserRepository,
		private readonly logStreamingDestinationService: LogStreamingDestinationService,
	) {}

	async getEvents(filter: AuditLogFilterDto): Promise<AuditLogListResult> {
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

		const skip = filter.skip ?? 0;
		const take = filter.take ?? 50;

		const [data, count] = await this.auditLogRepository.findAndCount({
			skip,
			take,
			order: { timestamp: 'DESC' },
			where,
			relations: ['user'],
		});

		await this.enrichBufferedEventsWithUsers(data);

		return {
			data,
			count,
			skip,
			take,
		};
	}

	private async enrichBufferedEventsWithUsers(events: AuditLog[]): Promise<void> {
		const bufferedWithUserId = events.filter((e) => e.userId && !e.user);
		if (bufferedWithUserId.length === 0) return;

		const userIds = [...new Set(bufferedWithUserId.map((e) => e.userId!))];
		const users = await this.userRepository.findManyByIds(userIds);
		const userMap = new Map(users.map((u) => [u.id, u]));

		for (const event of bufferedWithUserId) {
			event.user = userMap.get(event.userId!) ?? null;
		}
	}
}
