import { describe, it, expect, vi } from 'vitest';
import { createComponentRenderer } from '@/__tests__/render';
import { createTestingPinia } from '@pinia/testing';
import QuickConnectForm from './QuickConnectForm.vue';
import { STORES } from '@n8n/stores';
import type { ICredentialType } from 'n8n-workflow';

vi.mock('vue-router', () => ({
	useRouter: () => ({ push: vi.fn(), resolve: vi.fn().mockReturnValue({ href: '' }) }),
	useRoute: () => ({}),
	RouterLink: vi.fn(),
}));

const openAiApiCredentialType: ICredentialType = {
	name: 'openAiApi',
	displayName: 'OpenAI API',
	properties: [{ name: 'apiKey', displayName: 'API Key', type: 'string', default: '' }],
};

const googleSheetsOAuth2ApiCredentialType: ICredentialType = {
	name: 'googleSheetsOAuth2Api',
	displayName: 'Google Sheets OAuth2 API',
	properties: [],
};

const renderComponent = createComponentRenderer(QuickConnectForm, {
	pinia: createTestingPinia({
		initialState: {
			[STORES.SETTINGS]: {
				settings: {
					enterprise: {},
					templates: { host: '' },
				},
			},
			[STORES.PROJECTS]: {
				personalProject: {
					id: 'personal-project',
					type: 'personal',
				},
			},
		},
	}),
});

describe('QuickConnectForm', () => {
	it('should show OAuth button for OAuth credentials', () => {
		const { getByTestId } = renderComponent({
			props: {
				credentialType: googleSheetsOAuth2ApiCredentialType,
				credentialTypeName: 'googleSheetsOAuth2Api',
			},
		});

		expect(getByTestId('quick-connect-oauth-button')).toBeInTheDocument();
	});

	it('should show essential fields for API key credentials', () => {
		const { getByTestId } = renderComponent({
			props: {
				credentialType: openAiApiCredentialType,
				credentialTypeName: 'openAiApi',
			},
		});

		// Should show save button (for API key flow)
		expect(getByTestId('quick-connect-save-button')).toBeInTheDocument();
	});

	it('should show "Get your API key" link when available', () => {
		const { getByTestId } = renderComponent({
			props: {
				credentialType: openAiApiCredentialType,
				credentialTypeName: 'openAiApi',
			},
		});

		expect(getByTestId('quick-connect-api-key-link')).toBeInTheDocument();
		expect(getByTestId('quick-connect-api-key-link')).toHaveAttribute(
			'href',
			'https://platform.openai.com/api-keys',
		);
	});
});
