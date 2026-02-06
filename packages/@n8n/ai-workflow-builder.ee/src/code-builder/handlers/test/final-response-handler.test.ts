/**
 * Tests for FinalResponseHandler
 */

import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { WorkflowJSON, NodeJSON } from '@n8n/workflow-sdk';

import { WarningTracker } from '../../state/warning-tracker';
import type { ParseAndValidateResult } from '../../types';
import { FinalResponseHandler } from '../final-response-handler';

describe('FinalResponseHandler', () => {
	const mockDebugLog = jest.fn();
	const mockParseAndValidate = jest.fn<Promise<ParseAndValidateResult>, [string, WorkflowJSON?]>();

	const createHandler = () =>
		new FinalResponseHandler({
			parseAndValidate: mockParseAndValidate,
			debugLog: mockDebugLog,
		});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('process', () => {
		const createResponse = (content: string) => new AIMessage({ content });

		it('should return success with workflow when validation passes', async () => {
			const handler = createHandler();
			const messages: BaseMessage[] = [];
			const warningTracker = new WarningTracker();

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

			const result = await handler.process({
				response: createResponse('```typescript\nconst workflow = {};\n```'),
				currentWorkflow: undefined,
				messages,
				warningTracker,
			});

			expect(result.success).toBe(true);
			expect(result.workflow).toEqual(mockWorkflow);
			expect(messages).toHaveLength(0);
		});

		it('should inject synthetic AIMessage+ToolMessage when structured output cannot be parsed', async () => {
			const handler = createHandler();
			const messages: BaseMessage[] = [];
			const warningTracker = new WarningTracker();

			const result = await handler.process({
				response: createResponse('Here is some text without code blocks'),
				currentWorkflow: undefined,
				messages,
				warningTracker,
			});

			expect(result.success).toBe(false);
			expect(result.isParseError).toBe(true);
			// Should inject synthetic AIMessage + ToolMessage pair
			expect(messages).toHaveLength(2);
			expect(messages[0]).toBeInstanceOf(AIMessage);
			expect((messages[0] as AIMessage).tool_calls).toHaveLength(1);
			expect((messages[0] as AIMessage).tool_calls![0].name).toBe('validate_workflow');
			expect(messages[1]).toBeInstanceOf(ToolMessage);
			expect((messages[1] as ToolMessage).content).toContain('Could not parse');
		});

		it('should inject synthetic AIMessage+ToolMessage when validation has warnings', async () => {
			const handler = createHandler();
			const messages: BaseMessage[] = [];
			const warningTracker = new WarningTracker();

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

			const result = await handler.process({
				response: createResponse('```typescript\nconst workflow = {};\n```'),
				currentWorkflow: undefined,
				messages,
				warningTracker,
			});

			expect(result.success).toBe(false);
			// Should inject synthetic AIMessage + ToolMessage pair
			expect(messages).toHaveLength(2);
			expect(messages[0]).toBeInstanceOf(AIMessage);
			expect((messages[0] as AIMessage).tool_calls).toHaveLength(1);
			expect((messages[0] as AIMessage).tool_calls![0].name).toBe('validate_workflow');
			expect(messages[1]).toBeInstanceOf(ToolMessage);
			expect((messages[1] as ToolMessage).content).toContain('W001');
		});

		it('should inject synthetic AIMessage+ToolMessage when parsing fails', async () => {
			const handler = createHandler();
			const messages: BaseMessage[] = [];
			const warningTracker = new WarningTracker();

			mockParseAndValidate.mockRejectedValue(new Error('Parse failed'));

			const result = await handler.process({
				response: createResponse('```typescript\nconst workflow = {};\n```'),
				currentWorkflow: undefined,
				messages,
				warningTracker,
			});

			expect(result.success).toBe(false);
			expect(result.isParseError).toBe(true);
			// Should inject synthetic AIMessage + ToolMessage pair
			expect(messages).toHaveLength(2);
			expect(messages[0]).toBeInstanceOf(AIMessage);
			expect((messages[0] as AIMessage).tool_calls).toHaveLength(1);
			expect((messages[0] as AIMessage).tool_calls![0].name).toBe('validate_workflow');
			expect(messages[1]).toBeInstanceOf(ToolMessage);
			expect((messages[1] as ToolMessage).content).toContain('parsing error');
		});
	});
});
