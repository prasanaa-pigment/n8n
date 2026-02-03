import { prompt } from '@/prompts/builder';

/**
 * Responder evaluation types that map to different evaluation strategies.
 */
export type ResponderEvalType =
	| 'plan_clarifying_questions'
	| 'plan_output'
	| 'datatable_instructions'
	| 'general_response';

export interface ResponderEvalCriteria {
	type: ResponderEvalType;
	criteria: string;
}

const FORBIDDEN_PHRASES = [
	'activate workflow',
	'activate the workflow',
	'click the activate button',
];

function buildForbiddenPhrasesSection(): string {
	return FORBIDDEN_PHRASES.map((p) => `- "${p}"`).join('\n');
}

function buildTypeSpecificGuidance(evalType: ResponderEvalType): string {
	switch (evalType) {
		case 'plan_clarifying_questions':
			return [
				'Additionally evaluate:',
				'- Are the clarifying questions relevant to the user request?',
				'- Are questions well-formed and specific (not vague)?',
				'- Is the number of questions appropriate (not too many, not too few)?',
				'- Do questions help disambiguate the user intent?',
			].join('\n');

		case 'plan_output':
			return [
				'Additionally evaluate:',
				'- Is the plan description accurate relative to the workflow built?',
				'- Does it cover all nodes and their purposes?',
				'- Is the explanation of the workflow flow logical and complete?',
			].join('\n');

		case 'datatable_instructions':
			return [
				'Additionally evaluate:',
				'- Are the data table creation instructions clear and actionable?',
				'- Do the column names/types match what the workflow expects?',
				'- Is the user told exactly what to create manually?',
			].join('\n');

		case 'general_response':
			return '';
	}
}

/**
 * Build the LLM judge prompt for evaluating a responder output.
 */
export function buildResponderJudgePrompt(args: {
	userPrompt: string;
	responderOutput: string;
	evalCriteria: ResponderEvalCriteria;
}): string {
	const { userPrompt, responderOutput, evalCriteria } = args;
	const typeGuidance = buildTypeSpecificGuidance(evalCriteria.type);

	return prompt()
		.section(
			'role',
			'You are an expert evaluator assessing the quality of an AI assistant response in a workflow automation context.',
		)
		.section(
			'task',
			[
				'Evaluate the responder output against the provided criteria.',
				'Score each dimension from 0.0 to 1.0.',
				'',
				'Return your evaluation as JSON with this exact structure:',
				'```json',
				'{',
				'  "relevance": { "score": 0.0, "comment": "..." },',
				'  "accuracy": { "score": 0.0, "comment": "..." },',
				'  "completeness": { "score": 0.0, "comment": "..." },',
				'  "clarity": { "score": 0.0, "comment": "..." },',
				'  "tone": { "score": 0.0, "comment": "..." },',
				'  "criteriaMatch": { "score": 0.0, "comment": "..." },',
				'  "forbiddenPhrases": { "score": 0.0, "comment": "..." },',
				'  "overallScore": 0.0,',
				'  "summary": "..."',
				'}',
				'```',
			].join('\n'),
		)
		.section(
			'dimensions',
			[
				'**relevance** (0-1): Does the response address the user request?',
				'**accuracy** (0-1): Is the information factually correct?',
				'**completeness** (0-1): Does it cover everything needed?',
				'**clarity** (0-1): Is the response well-structured and easy to understand?',
				'**tone** (0-1): Is the tone professional and helpful?',
				'**criteriaMatch** (0-1): Does it satisfy the specific evaluation criteria below?',
				'**forbiddenPhrases** (0-1): 1.0 if no forbidden phrases are present, 0.0 if any are found.',
			].join('\n'),
		)
		.section('forbiddenPhrases', buildForbiddenPhrasesSection())
		.section('userPrompt', userPrompt)
		.section('responderOutput', responderOutput)
		.section('evaluationCriteria', evalCriteria.criteria)
		.sectionIf(typeGuidance.length > 0, 'typeSpecificGuidance', typeGuidance)
		.build();
}
