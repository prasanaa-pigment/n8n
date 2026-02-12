import { z } from 'zod';

import { Z } from '../../zod-class';

/** Config DTO for a single Google social login provider */
export class GoogleSocialLoginConfigDto extends Z.class({
	enabled: z.boolean().optional().default(false),
	clientId: z.string().default(''),
	clientSecret: z.string().default(''),
	allowedDomain: z.string().default(''),
}) {}

/** Config DTO for a single GitHub social login provider */
export class GitHubSocialLoginConfigDto extends Z.class({
	enabled: z.boolean().optional().default(false),
	clientId: z.string().default(''),
	clientSecret: z.string().default(''),
}) {}

/** The full social login config returned by the GET endpoint */
export const socialLoginConfigResponseSchema = z.object({
	google: z.object({
		enabled: z.boolean(),
		clientId: z.string(),
		clientSecret: z.string(),
		allowedDomain: z.string(),
	}),
	github: z.object({
		enabled: z.boolean(),
		clientId: z.string(),
		clientSecret: z.string(),
	}),
});

export type SocialLoginConfigResponse = z.infer<typeof socialLoginConfigResponseSchema>;
