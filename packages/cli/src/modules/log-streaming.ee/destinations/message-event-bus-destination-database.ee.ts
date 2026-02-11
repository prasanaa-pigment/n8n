import { Container } from '@n8n/di';
import type {
	MessageEventBusDestinationDatabaseOptions,
	MessageEventBusDestinationOptions,
} from 'n8n-workflow';
import { MessageEventBusDestinationTypeNames } from 'n8n-workflow';
import { v4 as uuid } from 'uuid';

import type {
	MessageEventBus,
	MessageWithCallback,
} from '@/eventbus/message-event-bus/message-event-bus';

import { MessageEventBusDestination } from './message-event-bus-destination.ee';
import { AuditLog } from '../database/entities/audit-log.entity';
import { AuditLogRepository } from '../database/repositories/audit-log.repository';

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BATCH_SIZE = 100;

export const isMessageEventBusDestinationDatabaseOptions = (
	candidate: unknown,
): candidate is MessageEventBusDestinationDatabaseOptions => {
	const o = candidate as MessageEventBusDestinationDatabaseOptions;
	if (!o) return false;
	return o.__type === MessageEventBusDestinationTypeNames.database;
};

export class MessageEventBusDestinationDatabase
	extends MessageEventBusDestination
	implements MessageEventBusDestinationDatabaseOptions
{
	private readonly auditLogRepository: AuditLogRepository;

	private bufferedEvents: AuditLog[] = [];

	private flushTimer: NodeJS.Timeout | undefined;

	constructor(
		eventBusInstance: MessageEventBus,
		options: MessageEventBusDestinationDatabaseOptions,
	) {
		super(eventBusInstance, options);
		this.__type = options.__type ?? MessageEventBusDestinationTypeNames.database;
		this.label = options.label ?? 'Local Database';

		this.auditLogRepository = Container.get(AuditLogRepository);
		this.scheduleFlushing();
		this.logger.debug(`MessageEventBusDestinationDatabase with id ${this.getId()} initialized`);
	}

	async receiveFromEventBus(emitterPayload: MessageWithCallback): Promise<boolean> {
		const { msg, confirmCallback } = emitterPayload;

		const payload = (this.anonymizeAuditMessages ? msg.anonymize() : msg.payload) ?? {};

		const userId = this.extractUserId(payload);

		const auditLog = Object.assign(new AuditLog(), {
			id: msg.id ?? uuid(),
			eventName: msg.eventName,
			message: msg.message ?? msg.eventName,
			userId,
			timestamp: msg.ts.toJSDate(),
			payload,
		});

		this.bufferedEvents.push(auditLog);

		if (this.bufferedEvents.length >= FLUSH_BATCH_SIZE) {
			void this.flushBuffer();
		}

		confirmCallback(msg, { id: this.id, name: this.label });
		return true;
	}

	getBufferedEvents(): AuditLog[] {
		return [...this.bufferedEvents];
	}

	async flushBuffer(): Promise<void> {
		if (this.bufferedEvents.length === 0) {
			this.scheduleFlushing();
			return;
		}

		this.cancelScheduledFlushing();

		const batch = this.bufferedEvents;
		this.bufferedEvents = [];

		try {
			await this.auditLogRepository.save(batch);
		} catch (error) {
			this.logger.error('Failed to flush audit log buffer, re-queuing events', { error });
			this.bufferedEvents = [...batch, ...this.bufferedEvents];
		} finally {
			this.scheduleFlushing();
		}
	}

	override async close(): Promise<void> {
		this.cancelScheduledFlushing();
		await this.flushBuffer();
		await super.close();
	}

	private scheduleFlushing() {
		this.cancelScheduledFlushing();
		this.flushTimer = setTimeout(async () => await this.flushBuffer(), FLUSH_INTERVAL_MS);
	}

	private cancelScheduledFlushing() {
		if (this.flushTimer !== undefined) {
			clearTimeout(this.flushTimer);
			this.flushTimer = undefined;
		}
	}

	private extractUserId(payload: Record<string, unknown>): string | null {
		if (typeof payload.userId === 'string') {
			return payload.userId;
		}

		const user = payload.user;
		if (user && typeof user === 'object' && 'id' in user && typeof user.id === 'string') {
			return user.id;
		}

		return null;
	}

	serialize(): MessageEventBusDestinationDatabaseOptions {
		return {
			...super.serialize(),
		};
	}

	static deserialize(
		eventBusInstance: MessageEventBus,
		data: MessageEventBusDestinationOptions,
	): MessageEventBusDestinationDatabase | null {
		if (
			'__type' in data &&
			data.__type === MessageEventBusDestinationTypeNames.database &&
			isMessageEventBusDestinationDatabaseOptions(data)
		) {
			return new MessageEventBusDestinationDatabase(eventBusInstance, data);
		}
		return null;
	}

	toString() {
		return JSON.stringify(this.serialize());
	}
}
