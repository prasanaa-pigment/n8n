/**
 * Local subgraph evaluation runner.
 *
 * Runs subgraph evaluations against a local dataset (JSON file)
 * without requiring LangSmith.
 */

import pLimit from 'p-limit';

import { runWithOptionalLimiter, withTimeout } from './evaluation-helpers';
import type {
	Evaluator,
	EvaluationContext,
	Feedback,
	RunSummary,
	ExampleResult,
	EvaluationLifecycle,
} from './harness-types';
import type { EvalLogger } from './logger';
import { createArtifactSaver } from './output';
import {
	calculateWeightedScore,
	selectScoringItems,
	calculateFiniteAverage,
} from './score-calculator';
import type { SubgraphName } from './subgraph-runner';
import { extractPreComputedState, type SubgraphRunFn } from './subgraph-runner';
import type { ResponderEvalCriteria } from '../evaluators/responder/responder-judge.prompt';
import type { SimpleWorkflow } from '../../src/types/workflow';

const DEFAULT_PASS_THRESHOLD = 0.7;

interface LocalSubgraphEvaluationConfig {
	subgraph: SubgraphName;
	subgraphRunner: SubgraphRunFn;
	evaluators: Array<Evaluator<EvaluationContext>>;
	examples: Array<{ inputs: Record<string, unknown> }>;
	concurrency: number;
	lifecycle?: Partial<EvaluationLifecycle>;
	logger: EvalLogger;
	outputDir?: string;
	timeoutMs?: number;
	passThreshold?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
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

/**
 * Run a subgraph evaluation against a local dataset (no LangSmith required).
 */
export async function runLocalSubgraphEvaluation(
	config: LocalSubgraphEvaluationConfig,
): Promise<RunSummary> {
	const {
		subgraph,
		subgraphRunner,
		evaluators,
		examples,
		concurrency,
		lifecycle,
		logger,
		outputDir,
		timeoutMs,
		passThreshold = DEFAULT_PASS_THRESHOLD,
	} = config;

	const llmCallLimiter = pLimit(concurrency);
	const artifactSaver = outputDir ? createArtifactSaver({ outputDir, logger }) : null;
	const capturedResults: ExampleResult[] = [];

	const stats = {
		total: 0,
		passed: 0,
		failed: 0,
		errors: 0,
		scoreSum: 0,
		durationSumMs: 0,
	};

	logger.info(
		`Starting local subgraph "${subgraph}" evaluation with ${examples.length} examples...`,
	);

	const evalStartTime = Date.now();
	const limit = pLimit(concurrency);

	await Promise.all(
		examples.map((example, idx) =>
			limit(async () => {
				const index = idx + 1;
				const { inputs } = example;
				const prompt = extractPromptFromInputs(inputs);
				const startTime = Date.now();

				try {
					const state = extractPreComputedState(inputs);

					const genStart = Date.now();
					const subgraphResult = await runWithOptionalLimiter(async () => {
						return await withTimeout({
							promise: subgraphRunner(state),
							timeoutMs,
							label: `subgraph:${subgraph}`,
						});
					}, llmCallLimiter);
					const genDurationMs = Date.now() - genStart;

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

					const emptyWorkflow: SimpleWorkflow = { name: '', nodes: [], connections: {} };

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
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					const totalDurationMs = Date.now() - startTime;
					const feedback: Feedback[] = [
						{
							evaluator: 'runner',
							metric: 'error',
							score: 0,
							kind: 'score',
							comment: errorMessage,
						},
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
				}
			}),
		),
	);

	logger.info(
		`Local subgraph evaluation completed in ${((Date.now() - evalStartTime) / 1000).toFixed(1)}s`,
	);

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
	};

	if (artifactSaver) {
		artifactSaver.saveSummary(summary, capturedResults);
	}

	lifecycle?.onEnd?.(summary);

	return summary;
}
