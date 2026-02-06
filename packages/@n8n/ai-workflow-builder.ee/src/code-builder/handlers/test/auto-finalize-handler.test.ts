/**
 * Tests for Auto-Finalize Handler
 */

import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { WorkflowJSON, NodeJSON } from '@n8n/workflow-sdk';

import { WarningTracker } from '../../state/warning-tracker';
import type { ParseAndValidateResult } from '../../types';
import { AutoFinalizeHandler } from '../auto-finalize-handler';

describe('AutoFinalizeHandler', () => {
	const mockDebugLog = jest.fn();
	const mockParseAndValidate = jest.fn<Promise<ParseAndValidateResult>, [string, WorkflowJSON?]>();
	const mockGetErrorContext = jest.fn<string, [string, string]>();

	const createHandler = () =>
		new AutoFinalizeHandler({
			parseAndValidate: mockParseAndValidate,
			getErrorContext: mockGetErrorContext,
			debugLog: mockDebugLog,
		});

	beforeEach(() => {
		jest.clearAllMocks();
		mockGetErrorContext.mockReturnValue('Error context here');
	});

	describe('execute', () => {
		it('should prompt for code creation when no code exists', async () => {
			const handler = createHandler();
			const messages: BaseMessage[] = [];

			const gen = handler.execute({
				code: null,
				currentWorkflow: undefined,
				messages,
			});

			const result = await consumeGenerator(gen);

			expect(result.success).toBe(false);
			expect(result.promptedForCode).toBe(true);
			// Should inject synthetic AIMessage with validate_workflow tool call + ToolMessage
			expect(messages).toHaveLength(2);
			expect(messages[0]).toBeInstanceOf(AIMessage);
			expect((messages[0] as AIMessage).tool_calls).toHaveLength(1);
			expect((messages[0] as AIMessage).tool_calls![0].name).toBe('validate_workflow');
			expect(messages[1]).toBeInstanceOf(ToolMessage);
			expect((messages[1] as ToolMessage).content).toContain('text editor tool');
		});

		it('should return success with workflow when validation passes', async () => {
			const handler = createHandler();
			const messages: BaseMessage[] = [];

			const mockNode: NodeJSON = {
				id: '1',
				name: 'Node',
				type: 'n8n-nodes-base.set',
				position: [0, 0],
				typeVersion: 1,
			};
			const mockWorkflow: WorkflowJSON = {
				id: 'test',
				name: 'Test',
				nodes: [mockNode],
				connections: {},
			};

			mockParseAndValidate.mockResolvedValue({
				workflow: mockWorkflow,
				warnings: [],
			});

			const gen = handler.execute({
				code: 'const workflow = { ... }',
				currentWorkflow: undefined,
				messages,
			});

			const result = await consumeGenerator(gen);

			expect(result.success).toBe(true);
			expect(result.workflow).toEqual(mockWorkflow);
			expect(result.parseDuration).toBeGreaterThanOrEqual(0);
		});

		it('should return failure with feedback when validation has warnings', async () => {
			const handler = createHandler();
			const messages: BaseMessage[] = [];

			const mockWorkflow: WorkflowJSON = {
				id: 'test',
				name: 'Test',
				nodes: [],
				connections: {},
			};

			mockParseAndValidate.mockResolvedValue({
				workflow: mockWorkflow,
				warnings: [{ code: 'W001', message: 'Warning message', nodeName: 'Node1' }],
			});

			const gen = handler.execute({
				code: 'const workflow = { ... }',
				currentWorkflow: undefined,
				messages,
			});

			const result = await consumeGenerator(gen);

			expect(result.success).toBe(false);
			expect(result.workflow).toBeUndefined();
			// Should inject synthetic AIMessage + ToolMessage pair
			expect(messages).toHaveLength(2);
			expect(messages[0]).toBeInstanceOf(AIMessage);
			expect(messages[1]).toBeInstanceOf(ToolMessage);
			expect((messages[1] as ToolMessage).content).toContain('Validation warnings');
		});

		it('should return failure with feedback when parsing fails', async () => {
			const handler = createHandler();
			const messages: BaseMessage[] = [];

			mockParseAndValidate.mockRejectedValue(new Error('Parse failed'));

			const gen = handler.execute({
				code: 'invalid code',
				currentWorkflow: undefined,
				messages,
			});

			const result = await consumeGenerator(gen);

			expect(result.success).toBe(false);
			expect(result.workflow).toBeUndefined();
			// Should inject synthetic AIMessage + ToolMessage pair
			expect(messages).toHaveLength(2);
			expect(messages[0]).toBeInstanceOf(AIMessage);
			expect(messages[1]).toBeInstanceOf(ToolMessage);
			expect((messages[1] as ToolMessage).content).toContain('Parse error');
		});

		it('should track parse duration on failure', async () => {
			const handler = createHandler();
			const messages: BaseMessage[] = [];

			mockParseAndValidate.mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				throw new Error('Parse failed');
			});

			const gen = handler.execute({
				code: 'invalid code',
				currentWorkflow: undefined,
				messages,
			});

			const result = await consumeGenerator(gen);

			expect(result.parseDuration).toBeGreaterThanOrEqual(10);
		});

		it('should send only new warnings and mark them as seen via warningTracker', async () => {
			const handler = createHandler();
			const messages: BaseMessage[] = [];
			const warningTracker = new WarningTracker();

			const mockWorkflow: WorkflowJSON = {
				id: 'test',
				name: 'Test',
				nodes: [],
				connections: {},
			};

			const seenWarning = { code: 'W001', message: 'Already seen', nodeName: 'Node1' };
			const newWarning = { code: 'W002', message: 'New warning', nodeName: 'Node2' };

			// Mark one warning as already seen
			warningTracker.markAsSeen([seenWarning]);

			mockParseAndValidate.mockResolvedValue({
				workflow: mockWorkflow,
				warnings: [seenWarning, newWarning],
			});

			const gen = handler.execute({
				code: 'const workflow = { ... }',
				currentWorkflow: undefined,
				messages,
				warningTracker,
			});

			const result = await consumeGenerator(gen);

			expect(result.success).toBe(false);
			// Should inject synthetic AIMessage + ToolMessage with only new warning
			expect(messages).toHaveLength(2);
			expect(messages[0]).toBeInstanceOf(AIMessage);
			expect(messages[1]).toBeInstanceOf(ToolMessage);
			expect((messages[1] as ToolMessage).content).toContain('W002');
			expect((messages[1] as ToolMessage).content).not.toContain('W001');
			// New warning should now be marked as seen
			expect(warningTracker.allSeen([newWarning])).toBe(true);
		});

		it('should treat all-repeated warnings as success', async () => {
			const handler = createHandler();
			const messages: BaseMessage[] = [];
			const warningTracker = new WarningTracker();

			const mockWorkflow: WorkflowJSON = {
				id: 'test',
				name: 'Test',
				nodes: [
					{ id: '1', name: 'Node', type: 'n8n-nodes-base.set', position: [0, 0], typeVersion: 1 },
				],
				connections: {},
			};

			const warning = {
				code: 'AGENT_NO_SYSTEM_MESSAGE',
				message: 'No system message',
				nodeName: 'Agent',
			};

			// Mark warning as already seen
			warningTracker.markAsSeen([warning]);

			mockParseAndValidate.mockResolvedValue({
				workflow: mockWorkflow,
				warnings: [warning],
			});

			const gen = handler.execute({
				code: 'const workflow = { ... }',
				currentWorkflow: undefined,
				messages,
				warningTracker,
			});

			const result = await consumeGenerator(gen);

			// All warnings repeated → treat as success
			expect(result.success).toBe(true);
			expect(result.workflow).toEqual(mockWorkflow);
			// Should NOT add any feedback message
			expect(messages).toHaveLength(0);
		});
	});
});

// Helper to consume an async generator and return the final result
async function consumeGenerator<T, R>(gen: AsyncGenerator<T, R>): Promise<R> {
	let result: IteratorResult<T, R>;
	do {
		result = await gen.next();
	} while (!result.done);
	return result.value;
}
