import type { WorkflowJSON } from '@n8n/workflow-sdk';

import { buildCodeBuilderPrompt } from '../../code-builder/prompts/index';

describe('buildCodeBuilderPrompt', () => {
	describe('extended thinking compatibility', () => {
		it('does not contain <thinking> tag instructions in system prompt', async () => {
			const prompt = buildCodeBuilderPrompt();
			const messages = await prompt.formatMessages({ userMessage: 'test' });
			const systemMessage = messages.find((m) => m._getType() === 'system');

			// With native extended thinking enabled, the prompt should NOT reference
			// <thinking> XML tags which cause the model to emit reasoning in output tokens
			const content = Array.isArray(systemMessage?.content)
				? systemMessage.content.map((b) => ('text' in b ? b.text : '')).join('')
				: String(systemMessage?.content ?? '');

			expect(content).not.toMatch(/<thinking>/);
			expect(content).not.toMatch(/`<thinking>`/);
			expect(content).not.toMatch(/Inside.*thinking.*tags/i);
		});
	});

	describe('preGeneratedCode option', () => {
		it('uses preGeneratedCode when provided instead of generating', async () => {
			const workflow: WorkflowJSON = {
				name: 'Test',
				nodes: [
					{
						id: '1',
						name: 'Start',
						type: 'n8n-nodes-base.manualTrigger',
						typeVersion: 1,
						position: [0, 0],
						parameters: {},
					},
				],
				connections: {},
			};

			const customCode = `// Custom pre-generated code
const start = trigger({ type: 'n8n-nodes-base.manualTrigger' });
return workflow('', 'Test').add(start);`;

			const prompt = buildCodeBuilderPrompt(workflow, undefined, {
				preGeneratedCode: customCode,
			});

			const messages = await prompt.formatMessages({ userMessage: 'test' });
			const humanMessage = messages.find((m) => m._getType() === 'human');
			const content = humanMessage?.content as string;

			// Should contain the custom code, not auto-generated
			expect(content).toContain('// Custom pre-generated code');
		});

		it('falls back to generateWorkflowCode when preGeneratedCode not provided', async () => {
			const workflow: WorkflowJSON = {
				name: 'Fallback Test',
				nodes: [
					{
						id: '1',
						name: 'Start',
						type: 'n8n-nodes-base.manualTrigger',
						typeVersion: 1,
						position: [0, 0],
						parameters: {},
					},
				],
				connections: {},
			};

			const prompt = buildCodeBuilderPrompt(workflow, undefined, {});

			const messages = await prompt.formatMessages({ userMessage: 'test' });
			const humanMessage = messages.find((m) => m._getType() === 'human');
			const content = humanMessage?.content as string;

			// Should contain auto-generated code with workflow name
			expect(content).toContain("workflow('', 'Fallback Test')");
		});
	});
});
