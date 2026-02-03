/**
 * Subgraph evaluation runner.
 *
 * Orchestrates running evaluations targeting a specific subgraph (e.g., responder)
 * using pre-computed state from LangSmith dataset examples.
 */

import { evaluate } from 'langsmith/evaluation';
import type { Run, Example } from 'langsmith/schemas';
import { traceable } from 'langsmith/traceable';
import type { Client as LangsmithClient } from 'langsmith/client';
import pLimit from 'p-limit';

import { runWithOptionalLimiter, withTimeout } from './evaluation-helpers';
import { toLangsmithEvaluationResult } from './feedback';
import type {
	Evaluator,
	EvaluationContext,
	Feedback,
	RunSummary,
	EvaluationLifecycle,
	LangsmithOptions,
	ExampleResult,
} from './harness-types';
import type { EvalLogger } from './logger';
import { createArtifactSaver } from './output';
import {
	calculateWeightedScore,
	selectScoringItems,
	calculateFiniteAverage,
} from './score-calculator';
import type { SubgraphName } from './subgraph-runner';
import {
	extractPreComputedState,
	type SubgraphRunFn,
	type SubgraphResult,
} from './subgraph-runner';
import type { ResponderEvalCriteria } from '../evaluators/responder/responder-judge.prompt';
import type { SimpleWorkflow } from '../../src/types/workflow';

const DEFAULT_PASS_THRESHOLD = 0.7;

interface SubgraphEvaluationConfig {
	subgraph: SubgraphName;
	subgraphRunner: SubgraphRunFn;
	evaluators: Array<Evaluator<EvaluationContext>>;
	datasetName: string;
	langsmithClient: LangsmithClient;
	langsmithOptions: LangsmithOptions;
	lifecycle?: Partial<EvaluationLifecycle>;
	logger: EvalLogger;
	outputDir?: string;
	timeoutMs?: number;
	passThreshold?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFeedback(value: unknown): value is Feedback {
	const kinds = new Set(['score', 'metric', 'detail'] as const);
	return (
		isRecord(value) &&
		typeof value.evaluator === 'string' &&
		typeof value.metric === 'string' &&
		typeof value.score === 'number' &&
		typeof value.kind === 'string' &&
		kinds.has(value.kind as 'score' | 'metric' | 'detail')
	);
}

function isUnknownArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

function extractPromptFromInputs(inputs: Record<string, unknown>): string {
	if (typeof inputs.prompt === 'string') return inputs.prompt;
	if (Array.isArray(inputs.messages) && inputs.messages.length > 0) {
		const first = inputs.messages[0];
		if (isRecord(first) && typeof first.content === 'string') return first.content;
	}
	throw new Error('No prompt found in inputs');
}

function extractResponderEvals(inputs: Record<string, unknown>): ResponderEvalCriteria | undefined {
	const raw = inputs.responderEvals;
	if (!isRecord(raw)) return undefined;
	if (typeof raw.type !== 'string' || typeof raw.criteria !== 'string') return undefined;
	return { type: raw.type, criteria: raw.criteria } as ResponderEvalCriteria;
}

interface SubgraphTargetOutput {
	response?: string;
	workflow?: SimpleWorkflow;
	prompt: string;
	feedback: Feedback[];
}

/**
 * Run a subgraph evaluation against a LangSmith dataset.
 */
export async function runSubgraphEvaluation(config: SubgraphEvaluationConfig): Promise<RunSummary> {
	const {
		subgraph,
		subgraphRunner,
		evaluators,
		datasetName,
		langsmithClient: lsClient,
		langsmithOptions,
		lifecycle,
		logger,
		outputDir,
		timeoutMs,
		passThreshold = DEFAULT_PASS_THRESHOLD,
	} = config;

	process.env.LANGSMITH_TRACING = 'true';

	lifecycle?.onStart?.({
		mode: 'langsmith',
		dataset: datasetName,
		generateWorkflow: async () => ({ name: '', nodes: [], connections: {} }),
		evaluators,
		langsmithOptions,
		langsmithClient: lsClient,
		logger,
	});

	const llmCallLimiter = pLimit(langsmithOptions.concurrency);
	const artifactSaver = outputDir ? createArtifactSaver({ outputDir, logger }) : null;
	const capturedResults: ExampleResult[] = [];

	let targetCallCount = 0;
	const stats = {
		total: 0,
		passed: 0,
		failed: 0,
		errors: 0,
		scoreSum: 0,
		durationSumMs: 0,
	};

	const traceableSubgraphRun = traceable(
		async (args: {
			inputs: Record<string, unknown>;
			runner: SubgraphRunFn;
			genTimeoutMs?: number;
		}): Promise<SubgraphResult> => {
			const state = extractPreComputedState(args.inputs);
			return await runWithOptionalLimiter(async () => {
				return await withTimeout({
					promise: args.runner(state),
					timeoutMs: args.genTimeoutMs,
					label: `subgraph:${subgraph}`,
				});
			}, llmCallLimiter);
		},
		{
			name: `subgraph_${subgraph}`,
			run_type: 'chain',
			client: lsClient,
		},
	);

	const target = async (inputs: Record<string, unknown>): Promise<SubgraphTargetOutput> => {
		targetCallCount++;
		const index = targetCallCount;
		const prompt = extractPromptFromInputs(inputs);
		const startTime = Date.now();

		try {
			const genStart = Date.now();
			const subgraphResult = await traceableSubgraphRun({
				inputs,
				runner: subgraphRunner,
				genTimeoutMs: timeoutMs,
			});
			const genDurationMs = Date.now() - genStart;

			// Build evaluation context with subgraph-specific fields
			const context: EvaluationContext & Record<string, unknown> = {
				prompt,
				llmCallLimiter,
				timeoutMs,
			};

			if (subgraph === 'responder' && subgraphResult.response) {
				context.responderOutput = subgraphResult.response;
				const evalCriteria = extractResponderEvals(inputs);
				if (evalCriteria) {
					context.responderEvals = evalCriteria;
				}
			}

			// Use empty workflow for evaluators that expect it
			const emptyWorkflow: SimpleWorkflow = { name: '', nodes: [], connections: {} };

			// Run evaluators
			const evalStart = Date.now();
			const feedback = (
				await Promise.all(
					evaluators.map(async (evaluator): Promise<Feedback[]> => {
						try {
							return await withTimeout({
								promise: evaluator.evaluate(emptyWorkflow, context),
								timeoutMs,
								label: `evaluator:${evaluator.name}`,
							});
						} catch (error) {
							const msg = error instanceof Error ? error.message : String(error);
							return [
								{
									evaluator: evaluator.name,
									metric: 'error',
									score: 0,
									kind: 'score' as const,
									comment: msg,
								},
							];
						}
					}),
				)
			).flat();
			const evalDurationMs = Date.now() - evalStart;
			const totalDurationMs = Date.now() - startTime;

			const score = calculateWeightedScore(feedback);
			const hasError = feedback.some((f) => f.metric === 'error');
			const status = hasError ? 'error' : score >= passThreshold ? 'pass' : 'fail';

			stats.total++;
			stats.scoreSum += score;
			stats.durationSumMs += totalDurationMs;
			if (status === 'pass') stats.passed++;
			else if (status === 'fail') stats.failed++;
			else stats.errors++;

			const result: ExampleResult = {
				index,
				prompt,
				status,
				score,
				feedback,
				durationMs: totalDurationMs,
				generationDurationMs: genDurationMs,
				evaluationDurationMs: evalDurationMs,
				subgraphOutput: {
					response: subgraphResult.response,
					workflow: subgraphResult.workflow,
				},
			};

			artifactSaver?.saveExample(result);
			capturedResults.push(result);
			lifecycle?.onExampleComplete?.(index, result);

			return {
				response: subgraphResult.response,
				workflow: subgraphResult.workflow,
				prompt,
				feedback,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const totalDurationMs = Date.now() - startTime;
			const feedback: Feedback[] = [
				{ evaluator: 'runner', metric: 'error', score: 0, kind: 'score', comment: errorMessage },
			];

			stats.total++;
			stats.errors++;
			stats.durationSumMs += totalDurationMs;

			const result: ExampleResult = {
				index,
				prompt,
				status: 'error',
				score: 0,
				feedback,
				durationMs: totalDurationMs,
				error: errorMessage,
			};

			artifactSaver?.saveExample(result);
			capturedResults.push(result);
			lifecycle?.onExampleComplete?.(index, result);

			return { prompt, feedback };
		}
	};

	const feedbackExtractor = async (rootRun: Run, _example?: Example) => {
		const outputs = rootRun.outputs;
		const feedback =
			isRecord(outputs) && isUnknownArray(outputs.feedback) && outputs.feedback.every(isFeedback)
				? outputs.feedback
				: undefined;

		if (!feedback) {
			return [{ key: 'evaluationError', score: 0, comment: 'No feedback found' }];
		}
		return feedback.map((fb) => toLangsmithEvaluationResult(fb));
	};

	logger.info(`Starting subgraph "${subgraph}" evaluation with dataset "${datasetName}"...`);

	const evalStartTime = Date.now();
	const experimentResults = await evaluate(target, {
		data: datasetName,
		evaluators: [feedbackExtractor],
		experimentPrefix: langsmithOptions.experimentName,
		maxConcurrency: langsmithOptions.concurrency,
		client: lsClient,
		...(langsmithOptions.repetitions > 1 && {
			numRepetitions: langsmithOptions.repetitions,
		}),
		metadata: {
			subgraph,
			repetitions: langsmithOptions.repetitions,
			concurrency: langsmithOptions.concurrency,
			...langsmithOptions.experimentMetadata,
		},
	});

	logger.info(
		`Subgraph evaluation completed in ${((Date.now() - evalStartTime) / 1000).toFixed(1)}s (target called ${targetCallCount} times)`,
	);

	logger.verbose('Flushing pending trace batches...');
	await lsClient.awaitPendingTraceBatches();

	const experimentName = experimentResults.experimentName;
	logger.info(`Experiment completed: ${experimentName}`);

	// Extract experiment IDs
	let experimentId: string | undefined;
	let datasetId: string | undefined;
	try {
		const manager = (
			experimentResults as unknown as {
				manager?: { _getExperiment?: () => { id: string }; datasetId?: Promise<string> };
			}
		).manager;
		if (manager?._getExperiment) experimentId = manager._getExperiment().id;
		if (manager?.datasetId) datasetId = await manager.datasetId;
	} catch {
		logger.verbose('Could not extract LangSmith IDs from experiment results');
	}

	// Compute evaluator averages
	const evaluatorStats: Record<string, { scores: number[] }> = {};
	for (const result of capturedResults) {
		const byEvaluator: Record<string, Feedback[]> = {};
		for (const fb of result.feedback) {
			if (!byEvaluator[fb.evaluator]) byEvaluator[fb.evaluator] = [];
			byEvaluator[fb.evaluator].push(fb);
		}
		for (const [evaluator, items] of Object.entries(byEvaluator)) {
			if (!evaluatorStats[evaluator]) evaluatorStats[evaluator] = { scores: [] };
			const scoringItems = selectScoringItems(items);
			evaluatorStats[evaluator].scores.push(calculateFiniteAverage(scoringItems));
		}
	}
	const evaluatorAverages: Record<string, number> = {};
	for (const [name, s] of Object.entries(evaluatorStats)) {
		evaluatorAverages[name] = s.scores.reduce((a, b) => a + b, 0) / s.scores.length;
	}

	const summary: RunSummary = {
		totalExamples: stats.total,
		passed: stats.passed,
		failed: stats.failed,
		errors: stats.errors,
		averageScore: stats.total > 0 ? stats.scoreSum / stats.total : 0,
		totalDurationMs: stats.durationSumMs,
		evaluatorAverages,
		...(experimentName &&
			experimentId &&
			datasetId && {
				langsmith: { experimentName, experimentId, datasetId },
			}),
	};

	if (artifactSaver) {
		artifactSaver.saveSummary(summary, capturedResults);
	}

	lifecycle?.onEnd?.(summary);

	return summary;
}
