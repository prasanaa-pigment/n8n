import type {
	OidcConfigDto,
	SamlPreferences,
	SocialLoginConfigResponse,
	GoogleSocialLoginConfigDto,
	GitHubSocialLoginConfigDto,
} from '@n8n/api-types';
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useRootStore } from '@n8n/stores/useRootStore';
import * as ssoApi from '@n8n/rest-api-client/api/sso';
import type { SamlPreferencesExtractedData } from '@n8n/rest-api-client/api/sso';
import * as ldapApi from '@n8n/rest-api-client/api/ldap';
import type { LdapConfig } from '@n8n/rest-api-client/api/ldap';
import type { IDataObject } from 'n8n-workflow';
import { UserManagementAuthenticationMethod } from '@/Interface';

export const SupportedProtocols = {
	SAML: 'saml',
	OIDC: 'oidc',
} as const;

export type SupportedProtocolType = (typeof SupportedProtocols)[keyof typeof SupportedProtocols];

export const useSSOStore = defineStore('sso', () => {
	const rootStore = useRootStore();

	const authenticationMethod = ref<UserManagementAuthenticationMethod | undefined>(undefined);
	const selectedAuthProtocol = ref<SupportedProtocolType | undefined>(undefined);

	const showSsoLoginButton = computed(
		() =>
			(isSamlLoginEnabled.value &&
				isEnterpriseSamlEnabled.value &&
				isDefaultAuthenticationSaml.value) ||
			(isOidcLoginEnabled.value &&
				isEnterpriseOidcEnabled.value &&
				isDefaultAuthenticationOidc.value),
	);

	const getSSORedirectUrl = async (existingRedirect?: string) =>
		await ssoApi.initSSO(rootStore.restApiContext, existingRedirect);

	const initialize = (options: {
		authenticationMethod: UserManagementAuthenticationMethod;
		config: {
			ldap?: Pick<LdapConfig, 'loginLabel' | 'loginEnabled'>;
			saml?: Pick<SamlPreferences, 'loginLabel' | 'loginEnabled'>;
			oidc?: Pick<OidcConfigDto, 'loginEnabled'> & {
				loginUrl?: string;
				callbackUrl?: string;
			};
			socialLogin?: {
				google?: { enabled: boolean; loginUrl: string };
				github?: { enabled: boolean; loginUrl: string };
			};
		};
		features: {
			saml: boolean;
			ldap: boolean;
			oidc: boolean;
		};
	}) => {
		authenticationMethod.value = options.authenticationMethod;

		isEnterpriseLdapEnabled.value = options.features.ldap;
		if (options.config.ldap) {
			ldap.value.loginEnabled = options.config.ldap.loginEnabled;
			ldap.value.loginLabel = options.config.ldap.loginLabel;
		}

		isEnterpriseSamlEnabled.value = options.features.saml;
		if (options.config.saml) {
			saml.value.loginEnabled = options.config.saml.loginEnabled;
			saml.value.loginLabel = options.config.saml.loginLabel;
		}

		isEnterpriseOidcEnabled.value = options.features.oidc;
		if (options.config.oidc) {
			oidc.value.loginEnabled = options.config.oidc.loginEnabled;
			oidc.value.loginUrl = options.config.oidc.loginUrl || '';
			oidc.value.callbackUrl = options.config.oidc.callbackUrl || '';
		}

		if (options.config.socialLogin?.google) {
			socialLogin.value.google = options.config.socialLogin.google;
		}
		if (options.config.socialLogin?.github) {
			socialLogin.value.github = options.config.socialLogin.github;
		}
	};

	/**
	 * SAML
	 */

	const saml = ref<Pick<SamlPreferences, 'loginLabel' | 'loginEnabled'>>({
		loginLabel: '',
		loginEnabled: false,
	});

	const samlConfig = ref<SamlPreferences & SamlPreferencesExtractedData>();

	const isSamlLoginEnabled = computed({
		get: () => saml.value.loginEnabled,
		set: (value: boolean) => {
			saml.value.loginEnabled = value;
		},
	});

	const isEnterpriseSamlEnabled = ref(false);

	const isDefaultAuthenticationSaml = computed(
		() => authenticationMethod.value === UserManagementAuthenticationMethod.Saml,
	);

	const getSamlMetadata = async () => await ssoApi.getSamlMetadata(rootStore.restApiContext);

	const getSamlConfig = async () => {
		const config = await ssoApi.getSamlConfig(rootStore.restApiContext);
		samlConfig.value = config;
		saml.value.loginEnabled = config.loginEnabled;
		saml.value.loginLabel = config.loginLabel;
		return config;
	};

	const saveSamlConfig = async (config: Partial<SamlPreferences>) =>
		await ssoApi.saveSamlConfig(rootStore.restApiContext, config);

	const testSamlConfig = async () => await ssoApi.testSamlConfig(rootStore.restApiContext);

	/**
	 * OIDC
	 */

	const oidc = ref<
		Pick<OidcConfigDto, 'loginEnabled'> & {
			loginUrl?: string;
			callbackUrl?: string;
		}
	>({
		loginUrl: '',
		loginEnabled: false,
		callbackUrl: '',
	});

	const oidcConfig = ref<OidcConfigDto | undefined>();

	const isEnterpriseOidcEnabled = ref(false);

	const getOidcConfig = async () => {
		const config = await ssoApi.getOidcConfig(rootStore.restApiContext);
		oidcConfig.value = config;
		return config;
	};

	const saveOidcConfig = async (config: OidcConfigDto) => {
		const savedConfig = await ssoApi.saveOidcConfig(rootStore.restApiContext, config);
		oidcConfig.value = savedConfig;
		return savedConfig;
	};

	const isOidcLoginEnabled = computed({
		get: () => oidc.value.loginEnabled,
		set: (value: boolean) => {
			oidc.value.loginEnabled = value;
		},
	});

	const isDefaultAuthenticationOidc = computed(
		() => authenticationMethod.value === UserManagementAuthenticationMethod.Oidc,
	);

	/**
	 * LDAP Configuration
	 */

	const ldap = ref<Pick<LdapConfig, 'loginLabel' | 'loginEnabled'>>({
		loginLabel: '',
		loginEnabled: false,
	});

	const isEnterpriseLdapEnabled = ref(false);

	const isLdapLoginEnabled = computed(() => ldap.value.loginEnabled);

	const ldapLoginLabel = computed(() => ldap.value.loginLabel);

	const getLdapConfig = async () => {
		const rootStore = useRootStore();
		return await ldapApi.getLdapConfig(rootStore.restApiContext);
	};

	const getLdapSynchronizations = async (pagination: { page: number }) => {
		const rootStore = useRootStore();
		return await ldapApi.getLdapSynchronizations(rootStore.restApiContext, pagination);
	};

	const testLdapConnection = async () => {
		const rootStore = useRootStore();
		return await ldapApi.testLdapConnection(rootStore.restApiContext);
	};

	const updateLdapConfig = async (ldapConfig: LdapConfig) => {
		const rootStore = useRootStore();
		return await ldapApi.updateLdapConfig(rootStore.restApiContext, ldapConfig);
	};

	const runLdapSync = async (data: IDataObject) => {
		const rootStore = useRootStore();
		return await ldapApi.runLdapSync(rootStore.restApiContext, data);
	};

	/**
	 * Social Login (Google, GitHub, etc.)
	 */

	const socialLogin = ref<{
		google: { enabled: boolean; loginUrl: string };
		github: { enabled: boolean; loginUrl: string };
	}>({
		google: { enabled: false, loginUrl: '' },
		github: { enabled: false, loginUrl: '' },
	});

	const isGoogleSocialLoginEnabled = computed(() => socialLogin.value.google.enabled);
	const isGitHubSocialLoginEnabled = computed(() => socialLogin.value.github.enabled);

	const showSocialLoginButtons = computed(
		() => isGoogleSocialLoginEnabled.value || isGitHubSocialLoginEnabled.value,
	);

	/** Full config from admin endpoint (with secrets redacted) */
	const socialLoginAdminConfig = ref<SocialLoginConfigResponse | null>(null);

	const getSocialLoginConfig = async (): Promise<SocialLoginConfigResponse> => {
		const rootStore = useRootStore();
		const config = await ssoApi.getSocialLoginConfig(rootStore.restApiContext);
		socialLoginAdminConfig.value = config;
		return config;
	};

	const saveGoogleSocialLoginConfig = async (
		data: GoogleSocialLoginConfigDto,
	): Promise<SocialLoginConfigResponse> => {
		const rootStore = useRootStore();
		const config = await ssoApi.saveGoogleSocialLoginConfig(rootStore.restApiContext, data);
		socialLoginAdminConfig.value = config;
		return config;
	};

	const saveGitHubSocialLoginConfig = async (
		data: GitHubSocialLoginConfigDto,
	): Promise<SocialLoginConfigResponse> => {
		const rootStore = useRootStore();
		const config = await ssoApi.saveGitHubSocialLoginConfig(rootStore.restApiContext, data);
		socialLoginAdminConfig.value = config;
		return config;
	};

	const initializeSelectedProtocol = () => {
		if (selectedAuthProtocol.value) return;

		selectedAuthProtocol.value = isDefaultAuthenticationOidc.value
			? SupportedProtocols.OIDC
			: SupportedProtocols.SAML;
	};

	return {
		showSsoLoginButton,
		getSSORedirectUrl,
		initialize,
		selectedAuthProtocol,
		initializeSelectedProtocol,

		saml,
		samlConfig,
		isSamlLoginEnabled,
		isEnterpriseSamlEnabled,
		isDefaultAuthenticationSaml,
		getSamlMetadata,
		getSamlConfig,
		saveSamlConfig,
		testSamlConfig,

		oidc,
		oidcConfig,
		isOidcLoginEnabled,
		isEnterpriseOidcEnabled,
		isDefaultAuthenticationOidc,
		getOidcConfig,
		saveOidcConfig,

		ldap,
		isLdapLoginEnabled,
		isEnterpriseLdapEnabled,
		ldapLoginLabel,
		getLdapConfig,
		getLdapSynchronizations,
		testLdapConnection,
		updateLdapConfig,
		runLdapSync,

		socialLogin,
		socialLoginAdminConfig,
		isGoogleSocialLoginEnabled,
		isGitHubSocialLoginEnabled,
		showSocialLoginButtons,
		getSocialLoginConfig,
		saveGoogleSocialLoginConfig,
		saveGitHubSocialLoginConfig,
	};
});
