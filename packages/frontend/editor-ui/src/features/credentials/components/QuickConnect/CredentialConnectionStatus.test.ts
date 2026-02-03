import { describe, it, expect, vi } from 'vitest';
import { createComponentRenderer } from '@/__tests__/render';
import { createTestingPinia } from '@pinia/testing';
import CredentialConnectionStatus from './CredentialConnectionStatus.vue';
import { STORES } from '@n8n/stores';
import userEvent from '@testing-library/user-event';
import type { ICredentialType } from 'n8n-workflow';

vi.mock('vue-router', () => ({
	useRouter: () => ({ push: vi.fn(), resolve: vi.fn().mockReturnValue({ href: '' }) }),
	useRoute: () => ({}),
	RouterLink: vi.fn(),
}));

const openAiApiCredentialType: ICredentialType = {
	name: 'openAiApi',
	displayName: 'OpenAI API',
	properties: [],
};

const renderComponent = createComponentRenderer(CredentialConnectionStatus, {
	pinia: createTestingPinia({
		initialState: {
			[STORES.CREDENTIALS]: {
				state: {
					credentialTypes: {
						openAiApi: openAiApiCredentialType,
					},
					credentials: {},
				},
			},
			[STORES.SETTINGS]: {
				settings: {
					enterprise: {},
					templates: { host: '' },
				},
			},
		},
	}),
});

describe('CredentialConnectionStatus', () => {
	it('should show connect button when no credential selected', () => {
		const { getByTestId } = renderComponent({
			props: {
				appName: 'OpenAI',
				credentialType: 'openAiApi',
				selectedCredentialId: null,
				credentialOptions: [],
			},
		});

		expect(getByTestId('credential-connect-button')).toBeInTheDocument();
	});

	it('should show connected pill when credential selected', () => {
		const { container } = renderComponent({
			props: {
				appName: 'OpenAI',
				credentialType: 'openAiApi',
				selectedCredentialId: 'cred-123',
				credentialOptions: [
					{ id: 'cred-123', name: 'My OpenAI Key', typeDisplayName: 'OpenAI API' },
				],
			},
		});

		// The pill should contain the credential name
		expect(container.textContent).toContain('My OpenAI Key');
	});

	it('should emit connect event when connect button clicked', async () => {
		const { getByTestId, emitted } = renderComponent({
			props: {
				appName: 'OpenAI',
				credentialType: 'openAiApi',
				selectedCredentialId: null,
				credentialOptions: [],
			},
		});

		await userEvent.click(getByTestId('credential-connect-button'));

		expect(emitted().connect).toBeTruthy();
	});

	it('should not show connect button when credential is selected', () => {
		const { queryByTestId } = renderComponent({
			props: {
				appName: 'OpenAI',
				credentialType: 'openAiApi',
				selectedCredentialId: 'cred-123',
				credentialOptions: [
					{ id: 'cred-123', name: 'My OpenAI Key', typeDisplayName: 'OpenAI API' },
				],
			},
		});

		expect(queryByTestId('credential-connect-button')).not.toBeInTheDocument();
	});
});
