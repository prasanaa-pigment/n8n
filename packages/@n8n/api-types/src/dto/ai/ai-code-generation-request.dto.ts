import { z } from 'zod';

import { Z } from '../../zod-class';

export class AiCodeGenerationRequestDto extends Z.class({
	prompt: z.string().min(1).max(2000),
	language: z.enum(['javaScript', 'python']),
	mode: z.enum(['runOnceForAllItems', 'runOnceForEachItem']).optional(),
	existingCode: z.string().optional().default(''),
	inputSchema: z.string().optional(),
}) {}
