import type { StructuredToolInterface } from '@langchain/core/tools';

import type { StreamOutput, ToolProgressChunk } from '../../../types/streaming';
import { WarningTracker } from '../../state/warning-tracker';
import { ToolDispatchHandler } from '../tool-dispatch-handler';
import type { ValidateToolHandler } from '../validate-tool-handler';

/** Type guard for ToolProgressChunk */
function isToolProgressChunk(chunk: unknown): chunk is ToolProgressChunk {
	return (
		typeof chunk === 'object' &&
		chunk !== null &&
		'type' in chunk &&
		(chunk as ToolProgressChunk).type === 'tool'
	);
}

describe('ToolDispatchHandler', () => {
	const mockDebugLog = jest.fn();
	const mockValidateToolHandler = {} as ValidateToolHandler;

	function createHandler(toolsMap: Map<string, StructuredToolInterface>) {
		return new ToolDispatchHandler({
			toolsMap,
			validateToolHandler: mockValidateToolHandler,
			debugLog: mockDebugLog,
		});
	}

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('executeGeneralToolCall (via dispatch)', () => {
		it('should include toolCallId in all tool progress events for successful tool', async () => {
			const mockTool = {
				name: 'mock_tool',
				invoke: jest.fn().mockResolvedValue('result'),
			} as unknown as StructuredToolInterface;

			const handler = createHandler(new Map([['mock_tool', mockTool]]));
			const warningTracker = new WarningTracker();

			const chunks: StreamOutput[] = [];
			const generator = handler.dispatch({
				toolCalls: [{ id: 'call-123', name: 'mock_tool', args: {} }],
				messages: [],
				iteration: 1,
				warningTracker,
			});

			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			const toolChunks = chunks.flatMap((c) => c.messages ?? []).filter(isToolProgressChunk);

			// All tool progress chunks should include toolCallId
			expect(toolChunks.length).toBeGreaterThanOrEqual(2);
			for (const chunk of toolChunks) {
				expect(chunk.toolCallId).toBe('call-123');
			}
		});

		it('should include toolCallId in tool progress events when tool not found', async () => {
			const handler = createHandler(new Map());
			const warningTracker = new WarningTracker();

			const chunks: StreamOutput[] = [];
			const generator = handler.dispatch({
				toolCalls: [{ id: 'call-456', name: 'nonexistent_tool', args: {} }],
				messages: [],
				iteration: 1,
				warningTracker,
			});

			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			const toolChunks = chunks.flatMap((c) => c.messages ?? []).filter(isToolProgressChunk);

			expect(toolChunks.length).toBeGreaterThanOrEqual(2);
			for (const chunk of toolChunks) {
				expect(chunk.toolCallId).toBe('call-456');
			}
		});

		it('should include toolCallId in tool progress events when tool throws', async () => {
			const mockTool = {
				name: 'failing_tool',
				invoke: jest.fn().mockRejectedValue(new Error('Tool failed')),
			} as unknown as StructuredToolInterface;

			const handler = createHandler(new Map([['failing_tool', mockTool]]));
			const warningTracker = new WarningTracker();

			const chunks: StreamOutput[] = [];
			const generator = handler.dispatch({
				toolCalls: [{ id: 'call-789', name: 'failing_tool', args: {} }],
				messages: [],
				iteration: 1,
				warningTracker,
			});

			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			const toolChunks = chunks.flatMap((c) => c.messages ?? []).filter(isToolProgressChunk);

			expect(toolChunks.length).toBeGreaterThanOrEqual(2);
			for (const chunk of toolChunks) {
				expect(chunk.toolCallId).toBe('call-789');
			}
		});

		it('should yield error status when tool is not found', async () => {
			const handler = createHandler(new Map());
			const warningTracker = new WarningTracker();

			const chunks: StreamOutput[] = [];
			const generator = handler.dispatch({
				toolCalls: [{ id: 'test-id', name: 'nonexistent_tool', args: {} }],
				messages: [],
				iteration: 1,
				warningTracker,
			});

			for await (const chunk of generator) {
				chunks.push(chunk);
			}

			// Should have at least 2 chunks: running and error
			expect(chunks.length).toBeGreaterThanOrEqual(2);

			// Find the tool progress chunks
			const toolChunks = chunks.flatMap((c) => c.messages ?? []).filter(isToolProgressChunk);

			// Should have running status
			const runningChunk = toolChunks.find((c) => c.status === 'running');
			expect(runningChunk).toBeDefined();
			expect(runningChunk?.toolName).toBe('nonexistent_tool');

			// Should have error status (this is the bug - currently missing)
			const errorChunk = toolChunks.find((c) => c.status === 'error');
			expect(errorChunk).toBeDefined();
			expect(errorChunk?.toolName).toBe('nonexistent_tool');
			expect(errorChunk?.error).toContain('not found');
		});
	});
});
