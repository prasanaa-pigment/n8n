import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';

import { runWithOptionalLimiter, withTimeout } from '../../harness/evaluation-helpers';
import type { EvaluationContext, Evaluator, Feedback } from '../../harness/harness-types';
import type { ResponderEvalCriteria } from './responder-judge.prompt';
import { buildResponderJudgePrompt } from './responder-judge.prompt';

const EVALUATOR_NAME = 'responder-judge';

interface ResponderJudgeDimension {
	score: number;
	comment: string;
}

interface ResponderJudgeResult {
	relevance: ResponderJudgeDimension;
	accuracy: ResponderJudgeDimension;
	completeness: ResponderJudgeDimension;
	clarity: ResponderJudgeDimension;
	tone: ResponderJudgeDimension;
	criteriaMatch: ResponderJudgeDimension;
	forbiddenPhrases: ResponderJudgeDimension;
	overallScore: number;
	summary: string;
}

/**
 * Context for responder evaluation, extends standard EvaluationContext
 * with the responder output and per-example criteria.
 */
export interface ResponderEvaluationContext extends EvaluationContext {
	/** The text output from the responder agent */
	responderOutput: string;
	/** Per-example evaluation criteria from the dataset */
	responderEvals: ResponderEvalCriteria;
}

function isResponderContext(ctx: EvaluationContext): ctx is ResponderEvaluationContext {
	return (
		'responderOutput' in ctx &&
		typeof (ctx as ResponderEvaluationContext).responderOutput === 'string' &&
		'responderEvals' in ctx &&
		typeof (ctx as ResponderEvaluationContext).responderEvals === 'object'
	);
}

function parseJudgeResponse(content: string): ResponderJudgeResult {
	// Extract JSON from markdown code block if present
	const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
	const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
	return JSON.parse(jsonStr) as ResponderJudgeResult;
}

const fb = (metric: string, score: number, kind: Feedback['kind'], comment?: string): Feedback => ({
	evaluator: EVALUATOR_NAME,
	metric,
	score,
	kind,
	...(comment ? { comment } : {}),
});

/**
 * Create a responder LLM-judge evaluator.
 *
 * Uses an LLM to evaluate responder output against per-example criteria
 * from the dataset. The evaluator expects a ResponderEvaluationContext
 * with `responderOutput` and `responderEvals` fields.
 *
 * @param llm - The LLM to use for judging
 * @returns An evaluator that produces feedback for responder output
 */
export function createResponderEvaluator(llm: BaseChatModel): Evaluator<EvaluationContext> {
	return {
		name: EVALUATOR_NAME,

		async evaluate(_workflow, ctx: EvaluationContext): Promise<Feedback[]> {
			if (!isResponderContext(ctx)) {
				return [
					fb(
						'error',
						0,
						'score',
						'Missing responderOutput or responderEvals in evaluation context',
					),
				];
			}

			const judgePrompt = buildResponderJudgePrompt({
				userPrompt: ctx.prompt,
				responderOutput: ctx.responderOutput,
				evalCriteria: ctx.responderEvals,
			});

			const result = await runWithOptionalLimiter(async () => {
				const response = await withTimeout({
					promise: llm.invoke([new HumanMessage(judgePrompt)]),
					timeoutMs: ctx.timeoutMs,
					label: 'responder-judge:evaluate',
				});

				const content =
					typeof response.content === 'string'
						? response.content
						: JSON.stringify(response.content);

				return parseJudgeResponse(content);
			}, ctx.llmCallLimiter);

			return [
				fb('relevance', result.relevance.score, 'metric', result.relevance.comment),
				fb('accuracy', result.accuracy.score, 'metric', result.accuracy.comment),
				fb('completeness', result.completeness.score, 'metric', result.completeness.comment),
				fb('clarity', result.clarity.score, 'metric', result.clarity.comment),
				fb('tone', result.tone.score, 'metric', result.tone.comment),
				fb('criteriaMatch', result.criteriaMatch.score, 'metric', result.criteriaMatch.comment),
				fb(
					'forbiddenPhrases',
					result.forbiddenPhrases.score,
					'metric',
					result.forbiddenPhrases.comment,
				),
				fb('overallScore', result.overallScore, 'score', result.summary),
			];
		},
	};
}
