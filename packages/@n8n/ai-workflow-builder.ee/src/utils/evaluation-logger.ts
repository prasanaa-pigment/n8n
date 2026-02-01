/**
 * Evaluation Logger
 *
 * Centralized logger for capturing comprehensive debugging information during evaluations.
 * Accumulates all log entries and tool outputs for serialization to log.txt.
 *
 * When provided to the CodeWorkflowBuilder and passed through to agents:
 * - Captures all debugLog() output from orchestrator and agents
 * - Captures full tool call inputs and outputs with timing
 * - Preserves console output for dev experience
 */

import { inspect } from 'node:util';

interface LogEntry {
	timestamp: string;
	context: string;
	message: string;
	data?: unknown;
}

interface ToolCallEntry {
	timestamp: string;
	tool: string;
	input: unknown;
	output: string;
	durationMs: number;
}

export class EvaluationLogger {
	private entries: LogEntry[] = [];
	private toolCalls: ToolCallEntry[] = [];

	/**
	 * Log a debug message - replaces console.log in debugLog() methods.
	 * Also outputs to console to preserve existing dev experience.
	 */
	log(context: string, message: string, data?: Record<string, unknown>): void {
		const timestamp = new Date().toISOString();
		this.entries.push({ timestamp, context, message, data });

		// Also output to console (preserves existing behavior)
		const prefix = `[${context}][${timestamp}]`;
		if (data) {
			const formatted = inspect(data, { depth: null, colors: true });
			console.log(`${prefix} ${message}\n${formatted}`);
		} else {
			console.log(`${prefix} ${message}`);
		}
	}

	/**
	 * Log a tool call with full input/output.
	 */
	logToolCall(tool: string, input: unknown, output: string, durationMs: number): void {
		const timestamp = new Date().toISOString();
		this.toolCalls.push({ timestamp, tool, input, output, durationMs });
	}

	/**
	 * Serialize all logs for writing to log.txt.
	 */
	serialize(): string {
		const lines: string[] = [];

		lines.push('='.repeat(80));
		lines.push(`EVALUATION LOG - ${new Date().toISOString()}`);
		lines.push('='.repeat(80));
		lines.push('');

		// Log entries
		lines.push('[LOG ENTRIES]');
		lines.push('-'.repeat(80));
		for (const entry of this.entries) {
			const ts = entry.timestamp.split('T')[1]?.slice(0, 12) ?? entry.timestamp;
			lines.push(`[${ts}] [${entry.context}] ${entry.message}`);
			if (entry.data) {
				lines.push(inspect(entry.data, { depth: null, colors: false, breakLength: 120 }));
			}
		}
		lines.push('');

		// Tool calls with full output
		lines.push('[TOOL CALLS]');
		lines.push('-'.repeat(80));
		for (const call of this.toolCalls) {
			lines.push(`\n[TOOL: ${call.tool}] (${call.durationMs}ms)`);
			lines.push(`Input: ${JSON.stringify(call.input, null, 2)}`);
			lines.push(`Output:\n${call.output}`);
		}

		return lines.join('\n');
	}
}
