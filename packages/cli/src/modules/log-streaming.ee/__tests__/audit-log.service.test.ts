import type { UserRepository } from '@n8n/db';
import { mock } from 'jest-mock-extended';
import { And, LessThan, MoreThan } from '@n8n/typeorm';

import type { AuditLog } from '../database/entities';
import type { AuditLogRepository } from '../database/repositories/audit-log.repository';
import type { LogStreamingDestinationService } from '../log-streaming-destination.service';
import type { MessageEventBusDestinationDatabase } from '../destinations/message-event-bus-destination-database.ee';
import { AuditLogService } from '../audit-log.service';

describe('AuditLogService', () => {
	const auditLogRepository = mock<AuditLogRepository>();
	const userRepository = mock<UserRepository>();
	const logStreamingDestinationService = mock<LogStreamingDestinationService>();
	const dbDestination = mock<MessageEventBusDestinationDatabase>();

	let service: AuditLogService;

	beforeEach(() => {
		jest.clearAllMocks();
		logStreamingDestinationService.getDatabaseDestination.mockReturnValue(dbDestination);
		dbDestination.getBufferedEvents.mockReturnValue([]);
		userRepository.findManyByIds.mockResolvedValue([]);
		service = new AuditLogService(
			auditLogRepository,
			userRepository,
			logStreamingDestinationService,
		);
	});

	describe('getEvents', () => {
		const mockAuditLog = {
			id: 'audit-1',
			eventName: 'n8n.audit.workflow.created',
			message: 'Workflow created',
			userId: 'user-1',
			timestamp: new Date('2024-01-01T10:00:00.000Z'),
			payload: { workflowId: 'workflow-123' },
			createdAt: new Date('2024-01-01T10:00:00.000Z'),
			updatedAt: new Date('2024-01-01T10:00:00.000Z'),
		} as unknown as AuditLog;

		const mockAuditLog2 = {
			id: 'audit-2',
			eventName: 'n8n.audit.workflow.updated',
			message: 'Workflow updated',
			userId: 'user-2',
			timestamp: new Date('2024-01-02T10:00:00.000Z'),
			payload: { workflowId: 'workflow-456' },
			createdAt: new Date('2024-01-02T10:00:00.000Z'),
			updatedAt: new Date('2024-01-02T10:00:00.000Z'),
		} as unknown as AuditLog;

		it('should retrieve events with no filters', async () => {
			auditLogRepository.findAndCount.mockResolvedValue([[mockAuditLog, mockAuditLog2], 2]);

			const result = await service.getEvents({});

			expect(result.data).toHaveLength(2);
			expect(result.count).toBe(2);
			expect(result.skip).toBe(0);
			expect(result.take).toBe(50);
			expect(auditLogRepository.findAndCount).toHaveBeenCalledWith({
				skip: 0,
				take: 50,
				order: { timestamp: 'DESC' },
				where: {},
				relations: ['user'],
			});
		});

		it('should filter events by eventName', async () => {
			auditLogRepository.findAndCount.mockResolvedValue([[mockAuditLog], 1]);

			const result = await service.getEvents({ eventName: 'n8n.audit.workflow.created' });

			expect(result.data).toHaveLength(1);
			expect(result.data[0].eventName).toBe('n8n.audit.workflow.created');
			expect(result.count).toBe(1);
			expect(auditLogRepository.findAndCount).toHaveBeenCalledWith({
				skip: 0,
				take: 50,
				order: { timestamp: 'DESC' },
				where: { eventName: 'n8n.audit.workflow.created' },
				relations: ['user'],
			});
		});

		it('should filter events by userId', async () => {
			auditLogRepository.findAndCount.mockResolvedValue([[mockAuditLog], 1]);

			const result = await service.getEvents({ userId: 'user-1' });

			expect(result.data).toHaveLength(1);
			expect(result.count).toBe(1);
			expect(auditLogRepository.findAndCount).toHaveBeenCalledWith({
				skip: 0,
				take: 50,
				order: { timestamp: 'DESC' },
				where: { userId: 'user-1' },
				relations: ['user'],
			});
		});

		it('should filter events by after timestamp (more recent than)', async () => {
			const afterDate = '2024-01-01T12:00:00.000Z';
			auditLogRepository.findAndCount.mockResolvedValue([[mockAuditLog2], 1]);

			const result = await service.getEvents({ after: afterDate });

			expect(result.data).toHaveLength(1);
			expect(result.count).toBe(1);
			expect(auditLogRepository.findAndCount).toHaveBeenCalledWith({
				skip: 0,
				take: 50,
				order: { timestamp: 'DESC' },
				where: { timestamp: MoreThan(new Date(afterDate)) },
				relations: ['user'],
			});
		});

		it('should filter events by before timestamp (older than)', async () => {
			const beforeDate = '2024-01-02T00:00:00.000Z';
			auditLogRepository.findAndCount.mockResolvedValue([[mockAuditLog], 1]);

			const result = await service.getEvents({ before: beforeDate });

			expect(result.data).toHaveLength(1);
			expect(result.count).toBe(1);
			expect(auditLogRepository.findAndCount).toHaveBeenCalledWith({
				skip: 0,
				take: 50,
				order: { timestamp: 'DESC' },
				where: { timestamp: LessThan(new Date(beforeDate)) },
				relations: ['user'],
			});
		});

		it('should filter events by after and before timestamp range', async () => {
			const afterDate = '2024-01-01T00:00:00.000Z';
			const beforeDate = '2024-01-03T00:00:00.000Z';
			auditLogRepository.findAndCount.mockResolvedValue([[mockAuditLog, mockAuditLog2], 2]);

			const result = await service.getEvents({ after: afterDate, before: beforeDate });

			expect(result.data).toHaveLength(2);
			expect(result.count).toBe(2);
			expect(auditLogRepository.findAndCount).toHaveBeenCalledWith({
				skip: 0,
				take: 50,
				order: { timestamp: 'DESC' },
				where: {
					timestamp: And(MoreThan(new Date(afterDate)), LessThan(new Date(beforeDate))),
				},
				relations: ['user'],
			});
		});

		it('should apply all filters together', async () => {
			const afterDate = '2023-12-31T00:00:00.000Z';
			const beforeDate = '2024-01-02T00:00:00.000Z';
			auditLogRepository.findAndCount.mockResolvedValue([[mockAuditLog], 1]);

			const result = await service.getEvents({
				eventName: 'n8n.audit.workflow.created',
				userId: 'user-1',
				after: afterDate,
				before: beforeDate,
			});

			expect(result.data).toHaveLength(1);
			expect(result.count).toBe(1);
			expect(auditLogRepository.findAndCount).toHaveBeenCalledWith({
				skip: 0,
				take: 50,
				order: { timestamp: 'DESC' },
				where: {
					eventName: 'n8n.audit.workflow.created',
					userId: 'user-1',
					timestamp: And(MoreThan(new Date(afterDate)), LessThan(new Date(beforeDate))),
				},
				relations: ['user'],
			});
		});

		it('should limit results to 50 records by default', async () => {
			const manyLogs = Array.from({ length: 50 }, (_, i) => ({
				...mockAuditLog,
				id: `audit-${i}`,
			}));
			auditLogRepository.findAndCount.mockResolvedValue([manyLogs, 100]);

			const result = await service.getEvents({});

			expect(result.data).toHaveLength(50);
			expect(result.count).toBe(100);
			expect(result.take).toBe(50);
			expect(auditLogRepository.findAndCount).toHaveBeenCalledWith(
				expect.objectContaining({ take: 50 }),
			);
		});

		it('should order results by timestamp DESC', async () => {
			auditLogRepository.findAndCount.mockResolvedValue([[mockAuditLog2, mockAuditLog], 2]);

			await service.getEvents({});

			expect(auditLogRepository.findAndCount).toHaveBeenCalledWith(
				expect.objectContaining({ order: { timestamp: 'DESC' } }),
			);
		});

		it('should return empty array when no events found', async () => {
			auditLogRepository.findAndCount.mockResolvedValue([[], 0]);

			const result = await service.getEvents({});

			expect(result.data).toHaveLength(0);
			expect(result.count).toBe(0);
		});

		it('should use custom skip parameter', async () => {
			auditLogRepository.findAndCount.mockResolvedValue([[mockAuditLog2], 100]);

			const result = await service.getEvents({ skip: 10 });

			expect(result.skip).toBe(10);
			expect(auditLogRepository.findAndCount).toHaveBeenCalledWith(
				expect.objectContaining({ skip: 10 }),
			);
		});

		it('should use custom take parameter', async () => {
			const manyLogs = Array.from({ length: 25 }, (_, i) => ({
				...mockAuditLog,
				id: `audit-${i}`,
			}));
			auditLogRepository.findAndCount.mockResolvedValue([manyLogs, 100]);

			const result = await service.getEvents({ take: 25 });

			expect(result.data).toHaveLength(25);
			expect(result.take).toBe(25);
			expect(auditLogRepository.findAndCount).toHaveBeenCalledWith(
				expect.objectContaining({ take: 25 }),
			);
		});

		it('should use both skip and take parameters for pagination', async () => {
			const manyLogs = Array.from({ length: 10 }, (_, i) => ({
				...mockAuditLog,
				id: `audit-${i + 20}`,
			}));
			auditLogRepository.findAndCount.mockResolvedValue([manyLogs, 100]);

			const result = await service.getEvents({ skip: 20, take: 10 });

			expect(result.data).toHaveLength(10);
			expect(result.skip).toBe(20);
			expect(result.take).toBe(10);
			expect(result.count).toBe(100);
			expect(auditLogRepository.findAndCount).toHaveBeenCalledWith({
				skip: 20,
				take: 10,
				order: { timestamp: 'DESC' },
				where: {},
			});
		});
	});

	describe('buffered events', () => {
		const dbEvent = {
			id: 'db-1',
			eventName: 'n8n.audit.workflow.created',
			message: 'Workflow created',
			userId: 'user-1',
			timestamp: new Date('2024-01-01T10:00:00.000Z'),
			payload: { workflowId: 'wf-1' },
		} as unknown as AuditLog;

		const bufferedEvent = {
			id: 'buf-1',
			eventName: 'n8n.audit.workflow.updated',
			message: 'Workflow updated',
			userId: 'user-2',
			timestamp: new Date('2024-01-02T10:00:00.000Z'),
			payload: { workflowId: 'wf-2' },
		} as unknown as AuditLog;

		it('should merge buffered events with db events', async () => {
			auditLogRepository.find.mockResolvedValue([dbEvent]);
			dbDestination.getBufferedEvents.mockReturnValue([bufferedEvent]);

			const result = await service.getEvents({});

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('buf-1');
			expect(result[1].id).toBe('db-1');
		});

		it('should sort merged events by timestamp DESC', async () => {
			const olderBuffered = {
				...bufferedEvent,
				id: 'buf-old',
				timestamp: new Date('2023-12-01T10:00:00.000Z'),
			} as unknown as AuditLog;

			auditLogRepository.find.mockResolvedValue([dbEvent]);
			dbDestination.getBufferedEvents.mockReturnValue([olderBuffered]);

			const result = await service.getEvents({});

			expect(result[0].id).toBe('db-1');
			expect(result[1].id).toBe('buf-old');
		});

		it('should filter buffered events by eventName', async () => {
			auditLogRepository.find.mockResolvedValue([]);
			dbDestination.getBufferedEvents.mockReturnValue([bufferedEvent]);

			const result = await service.getEvents({
				eventName: 'n8n.audit.workflow.created',
			});

			expect(result).toHaveLength(0);
		});

		it('should filter buffered events by userId', async () => {
			auditLogRepository.find.mockResolvedValue([]);
			dbDestination.getBufferedEvents.mockReturnValue([bufferedEvent]);

			const result = await service.getEvents({ userId: 'user-1' });

			expect(result).toHaveLength(0);
		});

		it('should filter buffered events by after timestamp', async () => {
			auditLogRepository.find.mockResolvedValue([]);
			dbDestination.getBufferedEvents.mockReturnValue([bufferedEvent]);

			const result = await service.getEvents({
				after: '2024-01-03T00:00:00.000Z',
			});

			expect(result).toHaveLength(0);
		});

		it('should filter buffered events by before timestamp', async () => {
			auditLogRepository.find.mockResolvedValue([]);
			dbDestination.getBufferedEvents.mockReturnValue([bufferedEvent]);

			const result = await service.getEvents({
				before: '2024-01-01T00:00:00.000Z',
			});

			expect(result).toHaveLength(0);
		});

		it('should include matching buffered events with filters', async () => {
			auditLogRepository.find.mockResolvedValue([]);
			dbDestination.getBufferedEvents.mockReturnValue([bufferedEvent]);

			const result = await service.getEvents({
				eventName: 'n8n.audit.workflow.updated',
				userId: 'user-2',
			});

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('buf-1');
		});

		it('should cap merged results at 50', async () => {
			const manyDbEvents = Array.from(
				{ length: 50 },
				(_, i) =>
					({
						...dbEvent,
						id: `db-${i}`,
					}) as unknown as AuditLog,
			);
			auditLogRepository.find.mockResolvedValue(manyDbEvents);
			dbDestination.getBufferedEvents.mockReturnValue([bufferedEvent]);

			const result = await service.getEvents({});

			expect(result).toHaveLength(50);
		});

		it('should handle missing database destination gracefully', async () => {
			logStreamingDestinationService.getDatabaseDestination.mockReturnValue(undefined);
			auditLogRepository.find.mockResolvedValue([dbEvent]);

			const result = await service.getEvents({});

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('db-1');
		});

		it('should enrich buffered events with user data', async () => {
			const bufferedWithUser = {
				...bufferedEvent,
				userId: 'user-2',
				user: undefined,
			} as unknown as AuditLog;

			auditLogRepository.find.mockResolvedValue([]);
			dbDestination.getBufferedEvents.mockReturnValue([bufferedWithUser]);
			userRepository.findManyByIds.mockResolvedValue([
				{ id: 'user-2', email: 'user2@test.com', firstName: 'Jane', lastName: 'Doe' },
			] as never);

			const result = await service.getEvents({});

			expect(result).toHaveLength(1);
			expect(userRepository.findManyByIds).toHaveBeenCalledWith(['user-2']);
			expect(result[0].user).toEqual(
				expect.objectContaining({ id: 'user-2', email: 'user2@test.com' }),
			);
		});

		it('should not call userRepository when no buffered events have userId', async () => {
			const bufferedNoUser = {
				...bufferedEvent,
				userId: null,
				user: undefined,
			} as unknown as AuditLog;

			auditLogRepository.find.mockResolvedValue([]);
			dbDestination.getBufferedEvents.mockReturnValue([bufferedNoUser]);

			await service.getEvents({});

			expect(userRepository.findManyByIds).not.toHaveBeenCalled();
		});

		it('should not enrich db events that already have user from LEFT JOIN', async () => {
			const dbEventWithUser = {
				...dbEvent,
				user: { id: 'user-1', email: 'user1@test.com', firstName: 'John', lastName: 'Smith' },
			} as unknown as AuditLog;

			auditLogRepository.find.mockResolvedValue([dbEventWithUser]);
			dbDestination.getBufferedEvents.mockReturnValue([]);

			const result = await service.getEvents({});

			expect(result).toHaveLength(1);
			expect(userRepository.findManyByIds).not.toHaveBeenCalled();
			expect(result[0].user).toEqual(
				expect.objectContaining({ id: 'user-1', email: 'user1@test.com' }),
			);
		});

		it('should set user to null for buffered events with userId of deleted user', async () => {
			const bufferedDeletedUser = {
				...bufferedEvent,
				userId: 'deleted-user',
				user: undefined,
			} as unknown as AuditLog;

			auditLogRepository.find.mockResolvedValue([]);
			dbDestination.getBufferedEvents.mockReturnValue([bufferedDeletedUser]);
			userRepository.findManyByIds.mockResolvedValue([]);

			const result = await service.getEvents({});

			expect(result).toHaveLength(1);
			expect(result[0].user).toBeNull();
		});

		it('should deduplicate userIds when enriching buffered events', async () => {
			const buffered1 = {
				...bufferedEvent,
				id: 'buf-1',
				userId: 'user-2',
				user: undefined,
			} as unknown as AuditLog;
			const buffered2 = {
				...bufferedEvent,
				id: 'buf-2',
				userId: 'user-2',
				timestamp: new Date('2024-01-03T10:00:00.000Z'),
				user: undefined,
			} as unknown as AuditLog;

			auditLogRepository.find.mockResolvedValue([]);
			dbDestination.getBufferedEvents.mockReturnValue([buffered1, buffered2]);
			userRepository.findManyByIds.mockResolvedValue([
				{ id: 'user-2', email: 'user2@test.com', firstName: 'Jane', lastName: 'Doe' },
			] as never);

			const result = await service.getEvents({});

			expect(result).toHaveLength(2);
			expect(userRepository.findManyByIds).toHaveBeenCalledWith(['user-2']);
		});
	});
});
