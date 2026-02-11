import type { AuthenticatedRequest } from '@n8n/db';
import { mock } from 'jest-mock-extended';

import type { AuditLog } from '../database/entities';
import { AuditLogController } from '../audit-log.controller';
import type { AuditLogService } from '../audit-log.service';

describe('AuditLogController', () => {
	const auditLogService = mock<AuditLogService>();

	let controller: AuditLogController;

	beforeEach(() => {
		jest.clearAllMocks();
		controller = new AuditLogController(auditLogService);
	});

	describe('getEvents', () => {
		const mockUser = {
			id: 'user-1',
			email: 'user1@test.com',
			firstName: 'John',
			lastName: 'Smith',
		};

		const mockAuditLog = {
			id: 'audit-1',
			eventName: 'n8n.audit.workflow.created',
			message: 'Workflow created',
			userId: 'user-1',
			user: mockUser,
			timestamp: new Date('2024-01-01T10:00:00.000Z'),
			payload: { workflowId: 'workflow-123' },
			createdAt: new Date('2024-01-01T10:00:00.000Z'),
			updatedAt: new Date('2024-01-01T10:00:00.000Z'),
		} as unknown as AuditLog;

		const mockAuditLog2 = {
			id: 'audit-2',
			eventName: 'n8n.audit.workflow.updated',
			message: 'Workflow updated',
			userId: null,
			user: null,
			timestamp: new Date('2024-01-02T10:00:00.000Z'),
			payload: { workflowId: 'workflow-456' },
			createdAt: new Date('2024-01-02T10:00:00.000Z'),
			updatedAt: new Date('2024-01-02T10:00:00.000Z'),
		} as unknown as AuditLog;

		it('should return events with no filters', async () => {
			auditLogService.getEvents.mockResolvedValue({
				data: [mockAuditLog, mockAuditLog2],
				count: 2,
				skip: 0,
				take: 50,
			});

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, {});

			expect(result.data).toHaveLength(2);
			expect(result.count).toBe(2);
			expect(result.skip).toBe(0);
			expect(result.take).toBe(50);
			expect(result.data[0].id).toBe('audit-1');
			expect(result.data[0].eventName).toBe('n8n.audit.workflow.created');
			expect(result.data[1].id).toBe('audit-2');
			expect(result.data[1].eventName).toBe('n8n.audit.workflow.updated');
			expect(auditLogService.getEvents).toHaveBeenCalledWith({});
		});

		it('should pass eventName filter to service', async () => {
			auditLogService.getEvents.mockResolvedValue({
				data: [mockAuditLog],
				count: 1,
				skip: 0,
				take: 50,
			});

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(
				req,
				{},
				{ eventName: 'n8n.audit.workflow.created' },
			);

			expect(result.data).toHaveLength(1);
			expect(result.data[0].eventName).toBe('n8n.audit.workflow.created');
			expect(auditLogService.getEvents).toHaveBeenCalledWith({
				eventName: 'n8n.audit.workflow.created',
			});
		});

		it('should pass userId filter to service', async () => {
			auditLogService.getEvents.mockResolvedValue({
				data: [mockAuditLog],
				count: 1,
				skip: 0,
				take: 50,
			});

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, { userId: 'user-1' });

			expect(result.data).toHaveLength(1);
			expect(auditLogService.getEvents).toHaveBeenCalledWith({ userId: 'user-1' });
		});

		it('should pass after filter to service', async () => {
			auditLogService.getEvents.mockResolvedValue({
				data: [mockAuditLog2],
				count: 1,
				skip: 0,
				take: 50,
			});

			const req = mock<AuthenticatedRequest>();
			const after = '2024-01-01T12:00:00.000Z';
			const result = await controller.getEvents(req, {}, { after });

			expect(result.data).toHaveLength(1);
			expect(result.data[0].id).toBe('audit-2');
			expect(auditLogService.getEvents).toHaveBeenCalledWith({ after });
		});

		it('should pass before filter to service', async () => {
			auditLogService.getEvents.mockResolvedValue({
				data: [mockAuditLog],
				count: 1,
				skip: 0,
				take: 50,
			});

			const req = mock<AuthenticatedRequest>();
			const before = '2024-01-02T00:00:00.000Z';
			const result = await controller.getEvents(req, {}, { before });

			expect(result.data).toHaveLength(1);
			expect(result.data[0].id).toBe('audit-1');
			expect(auditLogService.getEvents).toHaveBeenCalledWith({ before });
		});

		it('should pass all filters to service', async () => {
			auditLogService.getEvents.mockResolvedValue({
				data: [mockAuditLog],
				count: 1,
				skip: 0,
				take: 50,
			});

			const req = mock<AuthenticatedRequest>();
			const query = {
				eventName: 'n8n.audit.workflow.created',
				userId: 'user-1',
				after: '2023-12-31T00:00:00.000Z',
				before: '2024-01-02T00:00:00.000Z',
			};
			const result = await controller.getEvents(req, {}, query);

			expect(result.data).toHaveLength(1);
			expect(auditLogService.getEvents).toHaveBeenCalledWith(query);
		});

		it('should return empty array when no events found', async () => {
			auditLogService.getEvents.mockResolvedValue({
				data: [],
				count: 0,
				skip: 0,
				take: 50,
			});

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, {});

			expect(result.data).toHaveLength(0);
			expect(result.count).toBe(0);
			expect(auditLogService.getEvents).toHaveBeenCalledWith({});
		});

		it('should parse events through auditLogEvent schema and strip extra fields', async () => {
			auditLogService.getEvents.mockResolvedValue({
				data: [mockAuditLog],
				count: 1,
				skip: 0,
				take: 50,
			});

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, {});

			expect(result.data).toHaveLength(1);
			expect(result.data[0]).toHaveProperty('id');
			expect(result.data[0]).toHaveProperty('eventName');
			expect(result.data[0]).toHaveProperty('timestamp');
			expect(result.data[0]).toHaveProperty('payload');
			expect(result.data[0]).toHaveProperty('userId');
			expect(result.data[0]).toHaveProperty('user');
			// Entity-specific fields should be stripped by zod parse
			expect(result.data[0]).not.toHaveProperty('createdAt');
			expect(result.data[0]).not.toHaveProperty('updatedAt');
			expect(result.data[0]).not.toHaveProperty('message');
		});

		it('should include user data in parsed output', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog]);

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, {});

			expect(result.data).toHaveLength(1);
			expect(result.data[0].user).toEqual({
				id: 'user-1',
				email: 'user1@test.com',
				firstName: 'John',
				lastName: 'Smith',
			});
		});

		it('should handle events with null userId and null user', async () => {
			auditLogService.getEvents.mockResolvedValue([mockAuditLog2]);

			const req = mock<AuthenticatedRequest>();
			const result = await controller.getEvents(req, {}, {});

			expect(result.data).toHaveLength(1);
			expect(result.data[0].userId).toBeNull();
			expect(result.data[0].user).toBeNull();
		});
	});
});
