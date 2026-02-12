<script lang="ts" setup>
import { useDocumentTitle } from '@/app/composables/useDocumentTitle';
import { useToast } from '@/app/composables/useToast';
import { useSSOStore } from '../sso.store';
import { useI18n } from '@n8n/i18n';
import { computed, onMounted, ref } from 'vue';
import CopyInput from '@/app/components/CopyInput.vue';
import { useRootStore } from '@n8n/stores/useRootStore';

import { N8nButton, N8nHeading, N8nInfoTip, N8nInput, N8nCheckbox } from '@n8n/design-system';

const i18n = useI18n();
const ssoStore = useSSOStore();
const toast = useToast();
const documentTitle = useDocumentTitle();
const rootStore = useRootStore();

// ── Google ──
const googleEnabled = ref(false);
const googleClientId = ref('');
const googleClientSecret = ref('');
const googleAllowedDomain = ref('');

// ── GitHub ──
const githubEnabled = ref(false);
const githubClientId = ref('');
const githubClientSecret = ref('');

const savingGoogle = ref(false);
const savingGitHub = ref(false);

const restEndpoint = computed(() => rootStore.restUrl);

const googleCallbackUrl = computed(
	() => `${window.location.origin}${restEndpoint.value}/sso/social/google/callback`,
);

const githubCallbackUrl = computed(
	() => `${window.location.origin}${restEndpoint.value}/sso/social/github/callback`,
);

const loadConfig = async () => {
	try {
		const config = await ssoStore.getSocialLoginConfig();

		googleEnabled.value = config.google.enabled;
		googleClientId.value = config.google.clientId;
		googleClientSecret.value = config.google.clientSecret;
		googleAllowedDomain.value = config.google.allowedDomain;

		githubEnabled.value = config.github.enabled;
		githubClientId.value = config.github.clientId;
		githubClientSecret.value = config.github.clientSecret;
	} catch (error) {
		toast.showError(error, i18n.baseText('socialLoginSettings.loadError'));
	}
};

const saveGoogleConfig = async () => {
	try {
		savingGoogle.value = true;
		const config = await ssoStore.saveGoogleSocialLoginConfig({
			enabled: googleEnabled.value,
			clientId: googleClientId.value,
			clientSecret: googleClientSecret.value,
			allowedDomain: googleAllowedDomain.value,
		});
		googleClientSecret.value = config.google.clientSecret;
		toast.showMessage({
			title: i18n.baseText('socialLoginSettings.google.saveSuccess'),
			type: 'success',
		});
	} catch (error) {
		toast.showError(error, i18n.baseText('socialLoginSettings.google.saveError'));
	} finally {
		savingGoogle.value = false;
	}
};

const saveGitHubConfig = async () => {
	try {
		savingGitHub.value = true;
		const config = await ssoStore.saveGitHubSocialLoginConfig({
			enabled: githubEnabled.value,
			clientId: githubClientId.value,
			clientSecret: githubClientSecret.value,
		});
		githubClientSecret.value = config.github.clientSecret;
		toast.showMessage({
			title: i18n.baseText('socialLoginSettings.github.saveSuccess'),
			type: 'success',
		});
	} catch (error) {
		toast.showError(error, i18n.baseText('socialLoginSettings.github.saveError'));
	} finally {
		savingGitHub.value = false;
	}
};

onMounted(async () => {
	documentTitle.set(i18n.baseText('socialLoginSettings.title'));
	await loadConfig();
});
</script>

<template>
	<div class="pb-2xl">
		<div :class="$style.heading">
			<N8nHeading size="2xlarge">{{ i18n.baseText('socialLoginSettings.title') }}</N8nHeading>
		</div>
		<N8nInfoTip>
			{{ i18n.baseText('socialLoginSettings.info') }}
		</N8nInfoTip>

		<!-- ── Google ── -->
		<div :class="$style.providerSection">
			<N8nHeading size="large" :class="$style.providerHeading">{{
				i18n.baseText('socialLoginSettings.google.heading')
			}}</N8nHeading>

			<div :class="$style.group">
				<label>{{ i18n.baseText('socialLoginSettings.redirectUrl') }}</label>
				<CopyInput
					:value="googleCallbackUrl"
					:copy-button-text="i18n.baseText('generic.clickToCopy')"
					:toast-title="i18n.baseText('socialLoginSettings.redirectUrlCopied')"
				/>
				<small>{{ i18n.baseText('socialLoginSettings.google.redirectUrlHint') }}</small>
			</div>
			<div :class="$style.group">
				<label>{{ i18n.baseText('socialLoginSettings.clientId') }}</label>
				<N8nInput
					:model-value="googleClientId"
					type="text"
					data-test-id="social-login-google-client-id"
					@update:model-value="(v: string) => (googleClientId = v)"
				/>
				<small>{{ i18n.baseText('socialLoginSettings.google.clientIdHint') }}</small>
			</div>
			<div :class="$style.group">
				<label>{{ i18n.baseText('socialLoginSettings.clientSecret') }}</label>
				<N8nInput
					:model-value="googleClientSecret"
					type="password"
					data-test-id="social-login-google-client-secret"
					@update:model-value="(v: string) => (googleClientSecret = v)"
				/>
				<small>{{ i18n.baseText('socialLoginSettings.google.clientSecretHint') }}</small>
			</div>
			<div :class="$style.group">
				<label>{{ i18n.baseText('socialLoginSettings.google.allowedDomain') }}</label>
				<N8nInput
					:model-value="googleAllowedDomain"
					type="text"
					data-test-id="social-login-google-allowed-domain"
					:placeholder="i18n.baseText('socialLoginSettings.google.allowedDomainPlaceholder')"
					@update:model-value="(v: string) => (googleAllowedDomain = v)"
				/>
				<small>{{ i18n.baseText('socialLoginSettings.google.allowedDomainHint') }}</small>
			</div>
			<div :class="[$style.group, $style.checkboxGroup]">
				<N8nCheckbox
					v-model="googleEnabled"
					data-test-id="social-login-google-enabled"
					:label="i18n.baseText('socialLoginSettings.enabled')"
				/>
			</div>
			<div :class="$style.buttons">
				<N8nButton
					size="large"
					:loading="savingGoogle"
					:disabled="savingGoogle"
					data-test-id="social-login-google-save"
					@click="saveGoogleConfig"
				>
					{{ i18n.baseText('socialLoginSettings.save') }}
				</N8nButton>
			</div>
		</div>

		<!-- ── GitHub ── -->
		<div :class="$style.providerSection">
			<N8nHeading size="large" :class="$style.providerHeading">{{
				i18n.baseText('socialLoginSettings.github.heading')
			}}</N8nHeading>

			<div :class="$style.group">
				<label>{{ i18n.baseText('socialLoginSettings.redirectUrl') }}</label>
				<CopyInput
					:value="githubCallbackUrl"
					:copy-button-text="i18n.baseText('generic.clickToCopy')"
					:toast-title="i18n.baseText('socialLoginSettings.redirectUrlCopied')"
				/>
				<small>{{ i18n.baseText('socialLoginSettings.github.redirectUrlHint') }}</small>
			</div>
			<div :class="$style.group">
				<label>{{ i18n.baseText('socialLoginSettings.clientId') }}</label>
				<N8nInput
					:model-value="githubClientId"
					type="text"
					data-test-id="social-login-github-client-id"
					@update:model-value="(v: string) => (githubClientId = v)"
				/>
				<small>{{ i18n.baseText('socialLoginSettings.github.clientIdHint') }}</small>
			</div>
			<div :class="$style.group">
				<label>{{ i18n.baseText('socialLoginSettings.clientSecret') }}</label>
				<N8nInput
					:model-value="githubClientSecret"
					type="password"
					data-test-id="social-login-github-client-secret"
					@update:model-value="(v: string) => (githubClientSecret = v)"
				/>
				<small>{{ i18n.baseText('socialLoginSettings.github.clientSecretHint') }}</small>
			</div>
			<div :class="[$style.group, $style.checkboxGroup]">
				<N8nCheckbox
					v-model="githubEnabled"
					data-test-id="social-login-github-enabled"
					:label="i18n.baseText('socialLoginSettings.enabled')"
				/>
			</div>
			<div :class="$style.buttons">
				<N8nButton
					size="large"
					:loading="savingGitHub"
					:disabled="savingGitHub"
					data-test-id="social-login-github-save"
					@click="saveGitHubConfig"
				>
					{{ i18n.baseText('socialLoginSettings.save') }}
				</N8nButton>
			</div>
		</div>
	</div>
</template>

<style lang="scss" module>
.heading {
	margin-bottom: var(--spacing--sm);
}

.providerSection {
	margin-top: var(--spacing--2xl);
	padding-top: var(--spacing--xl);
	border-top: 1px solid var(--color--foreground);
}

.providerHeading {
	margin-bottom: var(--spacing--xs);
}

.group {
	padding: var(--spacing--xl) 0 0;

	> label {
		display: inline-block;
		font-size: var(--font-size--sm);
		font-weight: var(--font-weight--medium);
		padding: 0 0 var(--spacing--2xs);
	}

	small {
		display: block;
		padding: var(--spacing--2xs) 0 0;
		font-size: var(--font-size--2xs);
		color: var(--color--text);
	}
}

.checkboxGroup label > *:first-child {
	vertical-align: text-top;
}

.buttons {
	display: flex;
	justify-content: flex-start;
	padding: var(--spacing--2xl) 0 var(--spacing--2xs);

	button {
		margin: 0 var(--spacing--sm) 0 0;
	}
}
</style>
