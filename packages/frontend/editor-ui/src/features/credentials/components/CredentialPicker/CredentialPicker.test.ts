import { createComponentRenderer } from '@/__tests__/render';
import { mockedStore } from '@/__tests__/utils';
import { useCredentialsStore } from '../../credentials.store';
import { useUIStore } from '@/app/stores/ui.store';
import { useProjectsStore } from '@/features/collaboration/projects/projects.store';
import { createTestingPinia } from '@pinia/testing';
import CredentialPicker from './CredentialPicker.vue';
import {
	PERSONAL_OPENAI_CREDENTIAL,
	PROJECT_OPENAI_CREDENTIAL,
	GLOBAL_OPENAI_CREDENTIAL,
	TEST_CREDENTIAL_TYPES,
	TEST_CREDENTIALS,
} from './CredentialPicker.test.constants';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/vue';
import { useImprovedCredentials } from '@/experiments/improvedCredentials';
import { computed } from 'vue';

vi.mock('vue-router', () => {
	const push = vi.fn();
	const resolve = vi.fn().mockReturnValue({ href: 'https://test.com' });
	return {
		useRouter: () => ({
			push,
			resolve,
		}),
		useRoute: () => ({}),
		RouterLink: vi.fn(),
	};
});

vi.mock('@/experiments/improvedCredentials', () => ({
	useImprovedCredentials: vi.fn(),
}));

let credentialsStore: ReturnType<typeof mockedStore<typeof useCredentialsStore>>;

const renderComponent = createComponentRenderer(CredentialPicker);

describe('CredentialPicker', () => {
	beforeEach(() => {
		vi.mocked(useImprovedCredentials).mockReturnValue({
			isEnabled: computed(() => false),
		});
		createTestingPinia();
		credentialsStore = mockedStore(useCredentialsStore);
		credentialsStore.state.credentials = TEST_CREDENTIALS;
		credentialsStore.state.credentialTypes = TEST_CREDENTIAL_TYPES;
	});

	it('should render', () => {
		expect(() =>
			renderComponent({
				props: {
					appName: 'OpenAI',
					credentialType: 'openAiApi',
					selectedCredentialId: null,
				},
			}),
		).not.toThrowError();
	});

	it('should render all credentials of the specified type', async () => {
		const TEST_APP_NAME = 'OpenAI';
		const TEST_CREDENTIAL_TYPE = 'openAiApi';
		const { getByTestId } = renderComponent({
			props: {
				appName: TEST_APP_NAME,
				credentialType: TEST_CREDENTIAL_TYPE,
				selectedCredentialId: null,
			},
		});
		expect(getByTestId('credential-dropdown')).toBeInTheDocument();
		expect(getByTestId('credential-dropdown')).toHaveAttribute(
			'credential-type',
			TEST_CREDENTIAL_TYPE,
		);
		// Open the dropdown
		await userEvent.click(getByTestId('credential-dropdown'));
		// Personal openAI credential should be in the dropdown
		expect(
			screen.getByTestId(`node-credentials-select-item-${PERSONAL_OPENAI_CREDENTIAL.id}`),
		).toBeInTheDocument();
		// OpenAI credential that belong to other project should be in the dropdown
		expect(
			screen.queryByTestId(`node-credentials-select-item-${PROJECT_OPENAI_CREDENTIAL.id}`),
		).toBeInTheDocument();
		// Global OpenAI credential should be in the dropdown
		expect(
			screen.queryByTestId(`node-credentials-select-item-${GLOBAL_OPENAI_CREDENTIAL.id}`),
		).toBeInTheDocument();
	});

	it('should only render personal credentials of the specified type', async () => {
		const TEST_APP_NAME = 'OpenAI';
		const TEST_CREDENTIAL_TYPE = 'openAiApi';
		const { getByTestId } = renderComponent({
			props: {
				personalOnly: true,
				appName: TEST_APP_NAME,
				credentialType: TEST_CREDENTIAL_TYPE,
				selectedCredentialId: null,
			},
		});
		expect(getByTestId('credential-dropdown')).toBeInTheDocument();
		expect(getByTestId('credential-dropdown')).toHaveAttribute(
			'credential-type',
			TEST_CREDENTIAL_TYPE,
		);
		// Open the dropdown
		await userEvent.click(getByTestId('credential-dropdown'));
		// Personal openAI credential should be in the dropdown
		expect(
			screen.getByTestId(`node-credentials-select-item-${PERSONAL_OPENAI_CREDENTIAL.id}`),
		).toBeInTheDocument();
		// OpenAI credential that belong to other project should not be in the dropdown
		expect(
			screen.queryByTestId(`node-credentials-select-item-${PROJECT_OPENAI_CREDENTIAL.id}`),
		).not.toBeInTheDocument();
		// Global OpenAI credential should be in the dropdown
		expect(
			screen.queryByTestId(`node-credentials-select-item-${GLOBAL_OPENAI_CREDENTIAL.id}`),
		).toBeInTheDocument();
	});
});

describe('CredentialPicker with improved credentials experiment', () => {
	beforeEach(() => {
		vi.mocked(useImprovedCredentials).mockReturnValue({
			isEnabled: computed(() => true),
		});
		createTestingPinia();
		credentialsStore = mockedStore(useCredentialsStore);
		credentialsStore.state.credentials = TEST_CREDENTIALS;
		credentialsStore.state.credentialTypes = TEST_CREDENTIAL_TYPES;
	});

	it('should show CredentialConnectionStatus when experiment is enabled', () => {
		const { getByTestId, queryByTestId } = renderComponent({
			props: {
				appName: 'OpenAI',
				credentialType: 'openAiApi',
				selectedCredentialId: PERSONAL_OPENAI_CREDENTIAL.id,
			},
		});

		expect(getByTestId('credential-connection-status')).toBeInTheDocument();
		expect(queryByTestId('credential-dropdown')).not.toBeInTheDocument();
	});

	it('should show connect button when experiment is enabled and no credentials', () => {
		credentialsStore.state.credentials = {};

		const { getByTestId } = renderComponent({
			props: {
				appName: 'OpenAI',
				credentialType: 'openAiApi',
				selectedCredentialId: null,
			},
		});

		expect(getByTestId('credential-connect-button')).toBeInTheDocument();
	});

	it('should open QuickConnectModal when connect clicked in experiment', async () => {
		credentialsStore.state.credentials = {};
		const uiStore = mockedStore(useUIStore);
		const projectsStore = mockedStore(useProjectsStore);

		// Set up personal project with create permission
		projectsStore.personalProject = {
			id: 'personal-project',
			type: 'personal',
			name: 'My Project',
			icon: null,
			createdAt: '2024-01-01',
			updatedAt: '2024-01-01',
			relations: [],
			scopes: ['credential:create'],
		};

		const { getByTestId, emitted } = renderComponent({
			props: {
				appName: 'OpenAI',
				credentialType: 'openAiApi',
				selectedCredentialId: null,
			},
		});

		await userEvent.click(getByTestId('credential-connect-button'));

		// Verify the credentialModalOpened event is emitted (indicates createNewCredential was called)
		expect(emitted().credentialModalOpened).toBeTruthy();
		expect(uiStore.openQuickConnectModal).toHaveBeenCalledWith('openAiApi');
	});
});
