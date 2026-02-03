/**
 * Curated mapping of credential types to their essential fields.
 * Essential fields are shown by default in the Quick Connect modal.
 * All other fields are hidden under "Advanced settings".
 */
export const ESSENTIAL_FIELDS: Record<string, string[]> = {
	// AI providers
	openAiApi: ['apiKey'],
	anthropicApi: ['apiKey'],
	googlePalmApi: ['apiKey'], // Gemini
	// Communication
	telegramApi: ['accessToken'],
	// Databases
	supabaseApi: ['host', 'serviceRole'],
	postgres: ['host', 'database', 'user', 'password'],
};

/**
 * URLs where users can get their API keys.
 * Shown as "Get your API key" link in the modal.
 */
export const API_KEY_URLS: Record<string, string> = {
	openAiApi: 'https://platform.openai.com/api-keys',
	anthropicApi: 'https://console.anthropic.com/settings/keys',
	googlePalmApi: 'https://aistudio.google.com/apikey',
	telegramApi: 'https://core.telegram.org/bots#botfather',
	supabaseApi: 'https://supabase.com/dashboard/project/_/settings/api',
};

/**
 * OAuth credential type patterns.
 * These credentials show a single "Connect" button instead of form fields.
 */
export const OAUTH_CREDENTIAL_PATTERNS = ['OAuth2', 'oAuth2', 'OAuth', 'oAuth'];

/**
 * Get the essential fields for a credential type.
 * Returns null if the credential type is not in the curated list.
 */
export function getEssentialFields(credentialType: string): string[] | null {
	return ESSENTIAL_FIELDS[credentialType] ?? null;
}

/**
 * Get the API key URL for a credential type.
 * Returns null if no URL is configured.
 */
export function getApiKeyUrl(credentialType: string): string | null {
	return API_KEY_URLS[credentialType] ?? null;
}

/**
 * Check if a credential type is OAuth-based.
 */
export function isOAuthCredential(credentialType: string): boolean {
	return OAUTH_CREDENTIAL_PATTERNS.some((pattern) =>
		credentialType.toLowerCase().includes(pattern.toLowerCase()),
	);
}

/**
 * Check if a credential has advanced fields beyond the essential ones.
 */
export function hasAdvancedFields(credentialType: string, allFieldNames: string[]): boolean {
	const essential = getEssentialFields(credentialType);
	if (!essential) {
		// Not in curated list, no advanced section
		return false;
	}
	return allFieldNames.some((field) => !essential.includes(field));
}

/**
 * Partition fields into essential and advanced.
 */
export function partitionFields<T extends { name: string }>(
	credentialType: string,
	fields: T[],
): { essential: T[]; advanced: T[] } {
	const essentialNames = getEssentialFields(credentialType);

	if (!essentialNames) {
		// Not curated - show all fields as essential
		return { essential: fields, advanced: [] };
	}

	const essential: T[] = [];
	const advanced: T[] = [];

	for (const field of fields) {
		if (essentialNames.includes(field.name)) {
			essential.push(field);
		} else {
			advanced.push(field);
		}
	}

	// Sort essential fields to match the order in ESSENTIAL_FIELDS
	essential.sort((a, b) => essentialNames.indexOf(a.name) - essentialNames.indexOf(b.name));

	return { essential, advanced };
}
