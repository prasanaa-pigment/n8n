<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
	ICredentialType,
	INodeProperties,
	ICredentialDataDecryptedObject,
	CredentialInformation,
	ICredentialsDecrypted,
	INodeParameters,
} from 'n8n-workflow';
import { NodeHelpers } from 'n8n-workflow';
import { N8nButton, N8nLink, N8nIcon, N8nTooltip, N8nCollapsiblePanel } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import { useCredentialsStore } from '../../credentials.store';
import { useProjectsStore } from '@/features/collaboration/projects/projects.store';
import CredentialInputs from '../CredentialEdit/CredentialInputs.vue';
import OauthButton from '../CredentialEdit/OauthButton.vue';
import GoogleAuthButton from '../CredentialEdit/GoogleAuthButton.vue';
import {
	isOAuthCredential,
	getApiKeyUrl,
	partitionFields,
	getEssentialFields,
} from './essentialFields';
import type { IUpdateInformation } from '@/Interface';

const props = defineProps<{
	credentialType: ICredentialType;
	credentialTypeName: string;
}>();

const emit = defineEmits<{
	success: [credentialId: string];
	error: [message: string];
}>();

const i18n = useI18n();
const credentialsStore = useCredentialsStore();
const projectsStore = useProjectsStore();

// State
const credentialData = ref<ICredentialDataDecryptedObject>({});
const isLoading = ref(false);
const advancedSettingsOpen = ref(false);

// Computed
const isOAuth = computed(() => isOAuthCredential(props.credentialTypeName));

const isGoogleOAuth = computed(() => props.credentialTypeName.toLowerCase().includes('google'));

const credentialProperties = computed<INodeProperties[]>(() => {
	if (!props.credentialType?.properties) {
		return [];
	}
	return props.credentialType.properties.filter((prop) => {
		// Filter out hidden properties
		if (prop.type === 'hidden') {
			return false;
		}
		return true;
	});
});

const partitionedFields = computed(() => {
	return partitionFields(props.credentialTypeName, credentialProperties.value);
});

const hasAdvancedProperties = computed(() => partitionedFields.value.advanced.length > 0);

const apiKeyUrl = computed(() => getApiKeyUrl(props.credentialTypeName));

const documentationUrl = computed(() => props.credentialType?.documentationUrl ?? null);

const essentialFieldNames = computed(() => getEssentialFields(props.credentialTypeName));

const isCuratedCredential = computed(() => essentialFieldNames.value !== null);

const isEssentialFieldsFilled = computed(() => {
	if (isCuratedCredential.value && essentialFieldNames.value) {
		// For curated credentials: check that all essential fields have values
		return essentialFieldNames.value.every((fieldName) => {
			const value = credentialData.value[fieldName];
			return value !== undefined && value !== null && value !== '';
		});
	} else {
		// For uncurated credentials: check that all required fields have values
		return credentialProperties.value
			.filter((prop) => prop.required === true)
			.every((prop) => {
				const value = credentialData.value[prop.name];
				return value !== undefined && value !== null && value !== '';
			});
	}
});

// Initialize credential data with defaults from properties
function initializeCredentialData() {
	const data: ICredentialDataDecryptedObject = {};
	if (props.credentialType?.properties) {
		for (const property of props.credentialType.properties) {
			if (property.default !== undefined) {
				data[property.name] = property.default as CredentialInformation;
			}
		}
	}
	credentialData.value = data;
}

// Watch for credential type changes and reinitialize
watch(
	() => props.credentialType,
	() => {
		initializeCredentialData();
	},
	{ immediate: true },
);

function onDataChange(updateInfo: IUpdateInformation) {
	credentialData.value = {
		...credentialData.value,
		[updateInfo.name]: updateInfo.value as CredentialInformation,
	};
}

async function onOAuthConnect() {
	isLoading.value = true;
	try {
		// For OAuth, we save the credential first, then the OAuth flow is initiated
		const credentialId = await saveCredential();
		if (credentialId) {
			emit('success', credentialId);
		}
	} catch (error) {
		const message =
			error instanceof Error ? error.message : i18n.baseText('quickConnect.error.saveFailed');
		emit('error', message);
	} finally {
		isLoading.value = false;
	}
}

async function onSave() {
	isLoading.value = true;
	try {
		const credentialId = await saveCredential();
		if (!credentialId) {
			return;
		}

		// Test the credential
		const testResult = await testCredential(credentialId);
		if (testResult.success) {
			emit('success', credentialId);
		} else {
			emit(
				'error',
				i18n.baseText('quickConnect.error.testFailed', {
					interpolate: { message: testResult.message },
				}),
			);
		}
	} catch (error) {
		const message =
			error instanceof Error ? error.message : i18n.baseText('quickConnect.error.saveFailed');
		emit('error', message);
	} finally {
		isLoading.value = false;
	}
}

async function saveCredential(): Promise<string | null> {
	// Get a new credential name
	const credentialName = await credentialsStore.getNewCredentialName({
		credentialTypeName: props.credentialTypeName,
	});

	// Get only the non-default data
	const data = NodeHelpers.getNodeParameters(
		props.credentialType.properties,
		credentialData.value as INodeParameters,
		false,
		false,
		null,
		null,
	);

	const credentialDetails: ICredentialsDecrypted = {
		id: '',
		name: credentialName,
		type: props.credentialTypeName,
		data: data as unknown as ICredentialDataDecryptedObject,
	};

	try {
		const credential = await credentialsStore.createNewCredential(
			credentialDetails,
			projectsStore.currentProject?.id ?? projectsStore.personalProject?.id,
		);
		return credential.id;
	} catch (error) {
		throw new Error(i18n.baseText('quickConnect.error.saveFailed'));
	}
}

async function testCredential(
	credentialId: string,
): Promise<{ success: boolean; message: string }> {
	const credentialDetails: ICredentialsDecrypted = {
		id: credentialId,
		name: '',
		type: props.credentialTypeName,
		data: credentialData.value,
	};

	try {
		const result = await credentialsStore.testCredential(credentialDetails);
		if (result.status === 'Error') {
			return { success: false, message: result.message };
		}
		return { success: true, message: '' };
	} catch (error) {
		return {
			success: false,
			message: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}
</script>

<template>
	<div :class="$style.form">
		<!-- OAuth Flow -->
		<template v-if="isOAuth">
			<div :class="$style.oauthSection">
				<GoogleAuthButton
					v-if="isGoogleOAuth"
					data-test-id="quick-connect-oauth-button"
					@click="onOAuthConnect"
				/>
				<OauthButton
					v-else
					:is-google-o-auth-type="false"
					data-test-id="quick-connect-oauth-button"
					@click="onOAuthConnect"
				/>
			</div>
		</template>

		<!-- API Key Flow -->
		<template v-else>
			<CredentialInputs
				:credential-properties="
					partitionedFields.essential.length > 0
						? partitionedFields.essential
						: credentialProperties
				"
				:credential-data="credentialData"
				:documentation-url="documentationUrl ?? ''"
				@update="onDataChange"
			/>

			<div v-if="apiKeyUrl || documentationUrl" :class="$style.helpLinks">
				<N8nLink
					v-if="apiKeyUrl"
					:href="apiKeyUrl"
					new-window
					size="small"
					data-test-id="quick-connect-api-key-link"
				>
					{{ i18n.baseText('quickConnect.getApiKey') }}
				</N8nLink>
				<N8nTooltip v-if="documentationUrl" :content="i18n.baseText('quickConnect.viewDocs')">
					<N8nLink :href="documentationUrl" new-window size="small">
						<N8nIcon icon="circle-help" size="small" />
					</N8nLink>
				</N8nTooltip>
			</div>

			<!-- Advanced settings collapsible section -->
			<N8nCollapsiblePanel
				v-if="hasAdvancedProperties"
				v-model="advancedSettingsOpen"
				:title="i18n.baseText('quickConnect.advancedSettings')"
				:class="$style.advancedSettings"
				data-test-id="quick-connect-advanced-toggle"
			>
				<CredentialInputs
					:credential-properties="partitionedFields.advanced"
					:credential-data="credentialData"
					:documentation-url="documentationUrl ?? ''"
					@update="onDataChange"
				/>
			</N8nCollapsiblePanel>

			<N8nButton
				:class="$style.saveButton"
				:label="
					isLoading ? i18n.baseText('quickConnect.connecting') : i18n.baseText('quickConnect.save')
				"
				:loading="isLoading"
				:disabled="!isEssentialFieldsFilled || isLoading"
				type="primary"
				size="large"
				data-test-id="quick-connect-save-button"
				@click="onSave"
			/>
		</template>
	</div>
</template>

<style module lang="scss">
.form {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--sm);
}

.oauthSection {
	display: flex;
	justify-content: center;
	padding: var(--spacing--lg) 0;
}

.helpLinks {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: var(--spacing--sm);
	font-size: var(--font-size--2xs);
}

.advancedSettings {
	margin-top: var(--spacing--xs);
}

.saveButton {
	width: 100%;
	margin-top: var(--spacing--xs);
}
</style>
