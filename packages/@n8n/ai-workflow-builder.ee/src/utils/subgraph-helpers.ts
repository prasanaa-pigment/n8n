import type { BaseMessage } from '@langchain/core/messages';
import { isAIMessage, ToolMessage, HumanMessage } from '@langchain/core/messages';
import type { StructuredTool } from '@langchain/core/tools';
import { isCommand, isGraphInterrupt, END } from '@langchain/langgraph';

import { isBaseMessage } from '../types/langchain';
import type { WorkflowMetadata } from '../types/tools';
import type { WorkflowOperation } from '../types/workflow';

interface CommandUpdate {
	messages?: BaseMessage[];
	workflowOperations?: WorkflowOperation[];
	templateIds?: number[];
	cachedTemplates?: WorkflowMetadata[];
	bestPractices?: string;
}

/**
 * Type guard to check if an object has the shape of CommandUpdate
 */
function isCommandUpdate(value: unknown): value is CommandUpdate {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const obj = value as Record<string, unknown>;
	// messages is optional, but if present must be an array
	if ('messages' in obj && obj.messages !== undefined && !Array.isArray(obj.messages)) {
		return false;
	}
	// workflowOperations is optional, but if present must be an array
	if (
		'workflowOperations' in obj &&
		obj.workflowOperations !== undefined &&
		!Array.isArray(obj.workflowOperations)
	) {
		return false;
	}
	// templateIds is optional, but if present must be an array
	if ('templateIds' in obj && obj.templateIds !== undefined && !Array.isArray(obj.templateIds)) {
		return false;
	}
	// cachedTemplates is optional, but if present must be an array
	if (
		'cachedTemplates' in obj &&
		obj.cachedTemplates !== undefined &&
		!Array.isArray(obj.cachedTemplates)
	) {
		return false;
	}
	// bestPractices is optional, but if present must be a string
	if (
		'bestPractices' in obj &&
		obj.bestPractices !== undefined &&
		typeof obj.bestPractices !== 'string'
	) {
		return false;
	}
	return true;
}

/**
 * Handle interrupt-triggering tools (submit_questions) separately.
 * On initial run, the first call throws GraphInterrupt.
 * On resume, it returns answers — we provide ToolMessages for all calls.
 */
async function handleInterruptTools(
	lastMessage: {
		tool_calls?: Array<{ id?: string; name: string; args?: Record<string, unknown> }>;
	},
	toolMap: Map<string, StructuredTool>,
): Promise<{ handledIds: Set<string>; resultMessages: BaseMessage[] }> {
	const interruptCalls = (lastMessage.tool_calls ?? []).filter(
		(tc) => tc.name === 'submit_questions',
	);
	const handledIds = new Set<string>();
	const resultMessages: BaseMessage[] = [];

	if (interruptCalls.length === 0) {
		return { handledIds, resultMessages };
	}

	const first = interruptCalls[0];
	const interruptTool = toolMap.get(first.name);
	if (!interruptTool) {
		return { handledIds, resultMessages };
	}

	// On initial run this throws GraphInterrupt. On resume it returns the answers.
	const result = await interruptTool.invoke(first.args ?? {}, {
		toolCall: { id: first.id, name: first.name, args: first.args ?? {} },
	});

	// Resumed successfully — create ToolMessages for all submit_questions calls
	for (const tc of interruptCalls) {
		handledIds.add(tc.id ?? '');
		resultMessages.push(new ToolMessage({ content: String(result), tool_call_id: tc.id ?? '' }));
	}

	return { handledIds, resultMessages };
}

/**
 * Execute tools in a subgraph node
 *
 * Adapts the executeToolsInParallel pattern for subgraph use.
 * Executes all tool calls from the last AI message in parallel.
 *
 * @param state - Subgraph state with messages array
 * @param toolMap - Map of tool name to tool instance
 * @returns State update with messages and optional operations
 */
export async function executeSubgraphTools(
	state: { messages: BaseMessage[] },
	toolMap: Map<string, StructuredTool>,
): Promise<{
	messages?: BaseMessage[];
	workflowOperations?: WorkflowOperation[] | null;
	templateIds?: number[];
	cachedTemplates?: WorkflowMetadata[];
	bestPractices?: string;
}> {
	const lastMessage = state.messages[state.messages.length - 1];

	if (!lastMessage || !isAIMessage(lastMessage) || !lastMessage.tool_calls?.length) {
		return {};
	}

	// Handle submit_questions calls separately from other tools.
	// On initial run: interrupt() throws GraphInterrupt to pause for user input.
	// On resume: interrupt() returns the user's answers and the tool completes.
	// If the LLM emitted multiple submit_questions calls, only execute the first —
	// provide the same answer as a ToolMessage for duplicates to keep message history valid.
	const { handledIds, resultMessages } = await handleInterruptTools(lastMessage, toolMap);

	// Execute remaining tools in parallel (skipping already-handled submit_questions)
	const toolResults = await Promise.all(
		lastMessage.tool_calls
			.filter((tc) => !handledIds.has(tc.id ?? ''))
			.map(async (toolCall) => {
				const tool = toolMap.get(toolCall.name);
				if (!tool) {
					return new ToolMessage({
						content: `Tool ${toolCall.name} not found`,
						tool_call_id: toolCall.id ?? '',
					});
				}

				try {
					const result: unknown = await tool.invoke(toolCall.args ?? {}, {
						toolCall: {
							id: toolCall.id,
							name: toolCall.name,
							args: toolCall.args ?? {},
						},
					});
					// Result can be a Command (with update) or a BaseMessage
					// We return it as-is and handle the type in the loop below
					return result;
				} catch (error) {
					// Let GraphInterrupt propagate - tools like submit_questions use interrupt() for HITL
					if (isGraphInterrupt(error)) {
						throw error;
					}
					return new ToolMessage({
						content: `Tool failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
						tool_call_id: toolCall.id ?? '',
					});
				}
			}),
	);

	// Unwrap Command objects and collect messages/operations/templateIds/cachedTemplates/bestPractices
	// Start with any interrupt tool messages that were handled separately
	const messages: BaseMessage[] = [...resultMessages];
	const operations: WorkflowOperation[] = [];
	const templateIds: number[] = [];
	const cachedTemplates: WorkflowMetadata[] = [];
	let bestPractices: string | undefined;

	for (const result of toolResults) {
		if (isCommand(result)) {
			// Tool returned Command - extract update using type guard
			if (isCommandUpdate(result.update)) {
				if (result.update.messages) {
					messages.push(...result.update.messages);
				}
				if (result.update.workflowOperations) {
					operations.push(...result.update.workflowOperations);
				}
				if (result.update.templateIds) {
					templateIds.push(...result.update.templateIds);
				}
				if (result.update.cachedTemplates) {
					cachedTemplates.push(...result.update.cachedTemplates);
				}
				if (result.update.bestPractices) {
					bestPractices = result.update.bestPractices;
				}
			}
		} else if (isBaseMessage(result)) {
			// Direct message (ToolMessage, AIMessage, etc.)
			messages.push(result);
		}
	}

	const stateUpdate: {
		messages?: BaseMessage[];
		workflowOperations?: WorkflowOperation[] | null;
		templateIds?: number[];
		cachedTemplates?: WorkflowMetadata[];
		bestPractices?: string;
	} = {};

	if (messages.length > 0) {
		stateUpdate.messages = messages;
	}

	if (operations.length > 0) {
		stateUpdate.workflowOperations = operations;
	}

	if (templateIds.length > 0) {
		stateUpdate.templateIds = templateIds;
	}

	if (cachedTemplates.length > 0) {
		stateUpdate.cachedTemplates = cachedTemplates;
	}

	if (bestPractices) {
		stateUpdate.bestPractices = bestPractices;
	}

	return stateUpdate;
}

/**
 * Extract user request from parent state messages
 * Gets the LAST HumanMessage (most recent user request), not the first
 */
export function extractUserRequest(messages: BaseMessage[], defaultValue = ''): string {
	// Get the LAST HumanMessage (most recent user request for iteration support)
	// Skip resume messages to avoid treating plan decisions/answers as new requests.
	const humanMessages = messages.filter((m) => m instanceof HumanMessage);
	const lastNonResumeMessage = [...humanMessages]
		.reverse()
		.find((msg) => msg.additional_kwargs?.resumeData === undefined);
	const lastUserMessage = lastNonResumeMessage ?? humanMessages[humanMessages.length - 1];
	return typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : defaultValue;
}

/**
 * Standard shouldContinue logic for tool-based subgraphs
 * Checks presence of tool calls to determine if we should continue to tools node.
 */
export function createStandardShouldContinue() {
	return (state: { messages: BaseMessage[] }) => {
		const lastMessage = state.messages[state.messages.length - 1];
		const hasToolCalls =
			lastMessage &&
			'tool_calls' in lastMessage &&
			Array.isArray(lastMessage.tool_calls) &&
			lastMessage.tool_calls.length > 0;

		return hasToolCalls ? 'tools' : END;
	};
}
