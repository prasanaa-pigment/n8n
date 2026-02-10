/**
 * Text Editor Handler
 *
 * Handles text editor tool commands for the code builder agent.
 * Implements the Anthropic str_replace_based_edit_tool interface for
 * managing workflow code as a virtual file (/workflow.js).
 */

import type {
	TextEditorCommand,
	ViewCommand,
	CreateCommand,
	StrReplaceCommand,
	InsertCommand,
	StrReplacement,
	BatchReplaceResult,
} from './text-editor.types';
import {
	NoMatchFoundError,
	MultipleMatchesError,
	InvalidLineNumberError,
	InvalidViewRangeError,
	InvalidPathError,
	FileNotFoundError,
} from './text-editor.types';

/** The only supported file path for workflow code */
const WORKFLOW_FILE_PATH = '/workflow.js';

/** Max length for old_str previews in batch results */
const PREVIEW_MAX_LENGTH = 80;

function truncatePreview(str: string): string {
	if (str.length <= PREVIEW_MAX_LENGTH) return str;
	return str.slice(0, PREVIEW_MAX_LENGTH) + '...';
}

/**
 * Format code with line numbers (matches view command output)
 *
 * @param code - The code to format
 * @returns Code with line numbers in "N: content" format
 */
export function formatCodeWithLineNumbers(code: string): string {
	const lines = code.split('\n');
	return lines.map((line, i) => `${i + 1}: ${line}`).join('\n');
}

/** Min prefix length to consider a near-match useful */
const MIN_PREFIX_LENGTH = 10;

/** Number of file lines to show around divergence point */
const CONTEXT_LINES = 3;

/** Max chars of old_str to show around divergence */
const OLD_STR_CONTEXT_LENGTH = 40;

function escapeWhitespace(str: string): string {
	return str.replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
}

/**
 * Find where old_str diverges from the code and return diagnostic context.
 * Uses binary search for the longest prefix of searchStr that exists in code,
 * then shows the divergence point with actual file lines.
 */
export function findDivergenceContext(code: string, searchStr: string): string | undefined {
	// Binary search for longest matching prefix
	let lo = 0;
	let hi = searchStr.length;

	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (code.includes(searchStr.substring(0, mid))) {
			lo = mid;
		} else {
			hi = mid - 1;
		}
	}

	const matchLength = lo;
	if (matchLength < MIN_PREFIX_LENGTH) return undefined;

	const matchPos = code.indexOf(searchStr.substring(0, matchLength));
	const divergePos = matchPos + matchLength;
	const percentage = Math.round((matchLength / searchStr.length) * 100);

	// Compute divergence line number (1-indexed)
	const codeUpToDiverge = code.substring(0, divergePos);
	const divergeLine = codeUpToDiverge.split('\n').length;

	// Extract old_str context around divergence
	const oldStrRemainder = searchStr.substring(matchLength, matchLength + OLD_STR_CONTEXT_LENGTH);
	const oldStrPrefix = searchStr.substring(Math.max(0, matchLength - 20), matchLength);

	// Extract full file lines around divergence
	const codeLines = code.split('\n');
	const startLine = Math.max(0, divergeLine - CONTEXT_LINES);
	const endLine = Math.min(codeLines.length, divergeLine + 1);
	const fileContext = codeLines
		.slice(startLine, endLine)
		.map((line, i) => `    ${startLine + i + 1}: ${line}`)
		.join('\n');

	return (
		`Closest match (${percentage}% of old_str matched, diverges at line ${divergeLine}):\n` +
		`  old_str: ...${escapeWhitespace(oldStrPrefix)}>>> ${escapeWhitespace(oldStrRemainder)}\n` +
		`  file:\n${fileContext}`
	);
}

/** Debug log callback type */
type DebugLogFn = (context: string, message: string, data?: Record<string, unknown>) => void;

/**
 * Handler for text editor tool commands
 *
 * Manages a single virtual file (/workflow.js) containing workflow SDK code.
 * Supports view, create, str_replace, and insert commands.
 */
export class TextEditorHandler {
	private code: string | null = null;
	private debugLog: DebugLogFn;

	constructor(debugLog?: DebugLogFn) {
		// Use provided debug log or no-op
		this.debugLog = debugLog ?? (() => {});
	}

	/**
	 * Execute a text editor command
	 *
	 * @param command - The command to execute
	 * @returns Result message for the LLM
	 * @throws Various errors for invalid operations
	 */
	execute(command: TextEditorCommand): string {
		this.debugLog('EXECUTE', `Executing command: ${command.command}`, {
			path: command.path,
			hasCode: this.code !== null,
			codeLength: this.code?.length ?? 0,
		});

		// Create-specific path validation with a more helpful error message
		if (command.command === 'create' && command.path !== WORKFLOW_FILE_PATH) {
			throw new Error(
				'Cannot create multiple workflows. You can only extend the existing workflow at /workflow.js.',
			);
		}

		// Validate path for all commands
		this.validatePath(command.path);

		let result: string;
		switch (command.command) {
			case 'view':
				result = this.handleView(command);
				break;
			case 'create':
				result = this.handleCreate(command);
				break;
			case 'str_replace':
				result = this.handleStrReplace(command);
				break;
			case 'insert':
				result = this.handleInsert(command);
				break;
			default:
				result = `Unknown command: ${(command as { command: string }).command}`;
		}

		this.debugLog('EXECUTE', `Command ${command.command} completed`, {
			resultLength: result.length,
			newCodeLength: this.code?.length ?? 0,
		});

		return result;
	}

	/**
	 * Validate that the path is the supported workflow file
	 */
	private validatePath(path: string): void {
		if (path !== WORKFLOW_FILE_PATH) {
			throw new InvalidPathError(path);
		}
	}

	/**
	 * Handle view command - display file content with line numbers
	 */
	private handleView(command: ViewCommand): string {
		this.debugLog('VIEW', 'Handling view command', {
			hasViewRange: !!command.view_range,
			viewRange: command.view_range,
		});

		if (!this.code) {
			this.debugLog('VIEW', 'File not found - no code exists');
			throw new FileNotFoundError();
		}

		const lines = this.code.split('\n');
		this.debugLog('VIEW', 'File loaded', { totalLines: lines.length });

		// Handle view_range if specified
		if (command.view_range) {
			const [start, rawEnd] = command.view_range;
			const end = rawEnd === -1 ? lines.length : rawEnd;

			// Validate range (1-indexed)
			if (start < 1 || start > lines.length) {
				this.debugLog('VIEW', 'Invalid line range', { start, end, totalLines: lines.length });
				throw new InvalidLineNumberError(start, lines.length);
			}
			if (end < start) {
				this.debugLog('VIEW', 'Invalid view range', { start, end, totalLines: lines.length });
				throw new InvalidViewRangeError(start, end, lines.length);
			}

			// Convert to 0-indexed and extract range
			const startIdx = start - 1;
			const endIdx = Math.min(end, lines.length);
			const selectedLines = lines.slice(startIdx, endIdx);

			this.debugLog('VIEW', 'Returning range', {
				startLine: start,
				endLine: endIdx,
				linesReturned: selectedLines.length,
			});

			return selectedLines.map((line, i) => `${startIdx + i + 1}: ${line}`).join('\n');
		}

		this.debugLog('VIEW', 'Returning full file', { linesReturned: lines.length });
		// Return full file with line numbers
		return formatCodeWithLineNumbers(this.code);
	}

	/**
	 * Handle create command - create or overwrite the workflow file
	 */
	private handleCreate(command: CreateCommand): string {
		this.debugLog('CREATE', 'Creating workflow file', {
			fileTextLength: command.file_text.length,
			hadExistingCode: this.code !== null,
		});
		this.code = command.file_text;
		return 'File created successfully.';
	}

	/**
	 * Handle str_replace command - replace exact string match
	 */
	private handleStrReplace(command: StrReplaceCommand): string {
		this.debugLog('STR_REPLACE', 'Handling str_replace command', {
			oldStrLength: command.old_str.length,
			newStrLength: command.new_str.length,
			oldStrPreview: command.old_str.substring(0, 100),
			newStrPreview: command.new_str.substring(0, 100),
		});

		if (this.code === null) {
			this.debugLog('STR_REPLACE', 'File not found - no code exists');
			throw new FileNotFoundError();
		}

		const { old_str, new_str } = command;

		// Count occurrences
		const count = this.countOccurrences(this.code, old_str);
		this.debugLog('STR_REPLACE', 'Occurrence count', { count });

		if (count === 0) {
			// Try toggling trailing newline — common LLM mistake
			const normalized = old_str.endsWith('\n') ? old_str.slice(0, -1) : old_str + '\n';
			const normalizedCount = this.countOccurrences(this.code, normalized);
			if (normalizedCount === 1) {
				this.debugLog('STR_REPLACE', 'Auto-corrected trailing newline mismatch');
				const escapedNew = new_str.replace(/\$/g, '$$$$');
				this.code = this.code.replace(normalized, escapedNew);
				return 'Edit applied successfully.';
			}

			this.debugLog('STR_REPLACE', 'No match found for replacement');
			const context = findDivergenceContext(this.code, old_str);
			throw new NoMatchFoundError(old_str, context);
		}

		if (count > 1) {
			this.debugLog('STR_REPLACE', 'Multiple matches found - cannot replace', { count });
			throw new MultipleMatchesError(count);
		}

		// Replace the single occurrence
		// Escape $ characters in new_str to prevent special replacement patterns
		// ($', $&, $`, $1-$9) from being interpreted by String.prototype.replace()
		const escapedNewStr = new_str.replace(/\$/g, '$$$$');
		const oldCodeLength = this.code.length;
		this.code = this.code.replace(old_str, escapedNewStr);
		this.debugLog('STR_REPLACE', 'Edit applied successfully', {
			oldCodeLength,
			newCodeLength: this.code.length,
			sizeDelta: this.code.length - oldCodeLength,
		});
		return 'Edit applied successfully.';
	}

	/**
	 * Handle insert command - insert text at specific line
	 */
	private handleInsert(command: InsertCommand): string {
		this.debugLog('INSERT', 'Handling insert command', {
			insertLine: command.insert_line,
			insertTextLength: command.insert_text.length,
			insertTextPreview: command.insert_text.substring(0, 100),
		});

		if (this.code === null) {
			this.debugLog('INSERT', 'File not found - no code exists');
			throw new FileNotFoundError();
		}

		const { insert_line, insert_text } = command;
		const lines = this.code.split('\n');

		// Validate line number (0 = beginning, 1-n = after that line)
		if (insert_line < 0 || insert_line > lines.length) {
			this.debugLog('INSERT', 'Invalid line number', {
				insertLine: insert_line,
				totalLines: lines.length,
			});
			throw new InvalidLineNumberError(insert_line, lines.length);
		}

		// Insert at the specified position
		const oldLineCount = lines.length;
		lines.splice(insert_line, 0, insert_text);
		this.code = lines.join('\n');

		this.debugLog('INSERT', 'Text inserted successfully', {
			insertedAtLine: insert_line,
			oldLineCount,
			newLineCount: lines.length,
			newCodeLength: this.code.length,
		});

		return 'Text inserted successfully.';
	}

	/**
	 * Count non-overlapping occurrences of a substring
	 */
	private countOccurrences(text: string, search: string): number {
		if (search.length === 0) {
			return 0;
		}

		let count = 0;
		let pos = 0;

		while ((pos = text.indexOf(search, pos)) !== -1) {
			count++;
			pos += search.length;
		}

		return count;
	}

	/**
	 * Apply multiple str_replace operations atomically.
	 * Rolls back all changes if any single replacement fails.
	 *
	 * @param replacements - Ordered list of replacements to apply
	 * @returns Success message string when all succeed, or BatchReplaceResult[] on failure
	 * @throws FileNotFoundError if no code exists
	 */
	executeBatch(replacements: StrReplacement[]): string | BatchReplaceResult[] {
		if (this.code === null) {
			throw new FileNotFoundError();
		}

		if (replacements.length === 0) {
			return 'No replacements to apply.';
		}

		const snapshot = this.code;
		const results: BatchReplaceResult[] = [];

		for (let i = 0; i < replacements.length; i++) {
			const { old_str, new_str } = replacements[i];
			const preview = truncatePreview(old_str);
			const count = this.countOccurrences(this.code, old_str);

			if (count === 0) {
				this.code = snapshot;
				results.push({
					index: i,
					old_str: preview,
					status: 'failed',
					error: new NoMatchFoundError(old_str).message,
				});
				for (let j = i + 1; j < replacements.length; j++) {
					results.push({
						index: j,
						old_str: truncatePreview(replacements[j].old_str),
						status: 'not_attempted',
					});
				}
				return results;
			}

			if (count > 1) {
				this.code = snapshot;
				results.push({
					index: i,
					old_str: preview,
					status: 'failed',
					error: new MultipleMatchesError(count).message,
				});
				for (let j = i + 1; j < replacements.length; j++) {
					results.push({
						index: j,
						old_str: truncatePreview(replacements[j].old_str),
						status: 'not_attempted',
					});
				}
				return results;
			}

			const escapedNewStr = new_str.replace(/\$/g, '$$$$');
			this.code = this.code.replace(old_str, escapedNewStr);
			results.push({ index: i, old_str: preview, status: 'success' });
		}

		this.debugLog('BATCH_REPLACE', `All ${replacements.length} replacements applied`, {
			count: replacements.length,
		});

		return `All ${replacements.length} replacements applied successfully.`;
	}

	/**
	 * Get the current workflow code
	 */
	getWorkflowCode(): string | null {
		this.debugLog('GET_CODE', 'Getting workflow code', {
			hasCode: this.code !== null,
			codeLength: this.code?.length ?? 0,
		});
		return this.code;
	}

	/**
	 * Set the workflow code (for pre-populating with existing workflow)
	 */
	setWorkflowCode(code: string): void {
		this.debugLog('SET_CODE', 'Setting workflow code', {
			codeLength: code.length,
			codeLines: code.split('\n').length,
		});
		this.code = code;
	}

	/**
	 * Check if workflow code exists
	 */
	hasWorkflowCode(): boolean {
		return this.code !== null;
	}

	/**
	 * Clear the workflow code
	 */
	clearWorkflowCode(): void {
		this.debugLog('CLEAR_CODE', 'Clearing workflow code', {
			hadCode: this.code !== null,
			previousLength: this.code?.length ?? 0,
		});
		this.code = null;
	}
}
