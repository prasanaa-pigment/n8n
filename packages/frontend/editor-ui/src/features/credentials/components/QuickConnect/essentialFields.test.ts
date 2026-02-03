import { describe, it, expect } from 'vitest';
import {
	getEssentialFields,
	getApiKeyUrl,
	isOAuthCredential,
	hasAdvancedFields,
} from './essentialFields';

describe('essentialFields', () => {
	describe('getEssentialFields', () => {
		it('returns curated essential fields for OpenAI', () => {
			const result = getEssentialFields('openAiApi');
			expect(result).toEqual(['apiKey']);
		});

		it('returns curated essential fields for Postgres', () => {
			const result = getEssentialFields('postgres');
			expect(result).toEqual(['host', 'database', 'user', 'password']);
		});

		it('returns null for uncurated credentials', () => {
			const result = getEssentialFields('unknownCredential');
			expect(result).toBeNull();
		});
	});

	describe('getApiKeyUrl', () => {
		it('returns URL for OpenAI', () => {
			const result = getApiKeyUrl('openAiApi');
			expect(result).toBe('https://platform.openai.com/api-keys');
		});

		it('returns null for credentials without URL', () => {
			const result = getApiKeyUrl('unknownCredential');
			expect(result).toBeNull();
		});
	});

	describe('isOAuthCredential', () => {
		it('returns true for Google OAuth credentials', () => {
			expect(isOAuthCredential('googleSheetsOAuth2Api')).toBe(true);
			expect(isOAuthCredential('gmailOAuth2')).toBe(true);
		});

		it('returns false for API key credentials', () => {
			expect(isOAuthCredential('openAiApi')).toBe(false);
		});
	});

	describe('hasAdvancedFields', () => {
		it('returns true when credential has more fields than essential', () => {
			// OpenAI has apiKey as essential but also organizationId and baseUrl
			const allFields = ['apiKey', 'organizationId', 'baseUrl'];
			expect(hasAdvancedFields('openAiApi', allFields)).toBe(true);
		});

		it('returns false when all fields are essential', () => {
			const allFields = ['apiKey'];
			expect(hasAdvancedFields('anthropicApi', allFields)).toBe(false);
		});
	});
});
