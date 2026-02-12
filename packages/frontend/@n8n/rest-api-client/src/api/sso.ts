import type {
	OidcConfigDto,
	SamlPreferences,
	SamlToggleDto,
	SocialLoginConfigResponse,
	GoogleSocialLoginConfigDto,
	GitHubSocialLoginConfigDto,
} from '@n8n/api-types';

import type { IRestApiContext } from '../types';
import { makeRestApiRequest } from '../utils';

export type SamlPreferencesExtractedData = {
	entityID: string;
	returnUrl: string;
};

export const initSSO = async (context: IRestApiContext, redirectUrl = ''): Promise<string> => {
	return await makeRestApiRequest(context, 'GET', `/sso/saml/initsso?redirect=${redirectUrl}`);
};

export const getSamlMetadata = async (context: IRestApiContext): Promise<SamlPreferences> => {
	return await makeRestApiRequest(context, 'GET', '/sso/saml/metadata');
};

export const getSamlConfig = async (
	context: IRestApiContext,
): Promise<SamlPreferences & SamlPreferencesExtractedData> => {
	return await makeRestApiRequest(context, 'GET', '/sso/saml/config');
};

export const saveSamlConfig = async (
	context: IRestApiContext,
	data: Partial<SamlPreferences>,
): Promise<SamlPreferences | undefined> => {
	return await makeRestApiRequest(context, 'POST', '/sso/saml/config', data);
};

export const toggleSamlConfig = async (
	context: IRestApiContext,
	data: SamlToggleDto,
): Promise<void> => {
	return await makeRestApiRequest(context, 'POST', '/sso/saml/config/toggle', data);
};

export const testSamlConfig = async (context: IRestApiContext): Promise<string> => {
	return await makeRestApiRequest(context, 'GET', '/sso/saml/config/test');
};

export const getOidcConfig = async (context: IRestApiContext): Promise<OidcConfigDto> => {
	return await makeRestApiRequest(context, 'GET', '/sso/oidc/config');
};

export const saveOidcConfig = async (
	context: IRestApiContext,
	data: OidcConfigDto,
): Promise<OidcConfigDto> => {
	return await makeRestApiRequest(context, 'POST', '/sso/oidc/config', data);
};

export const initOidcLogin = async (context: IRestApiContext): Promise<string> => {
	return await makeRestApiRequest(context, 'GET', '/sso/oidc/login');
};

// Social Login config

export const getSocialLoginConfig = async (
	context: IRestApiContext,
): Promise<SocialLoginConfigResponse> => {
	return await makeRestApiRequest(context, 'GET', '/sso/social/config');
};

export const saveGoogleSocialLoginConfig = async (
	context: IRestApiContext,
	data: GoogleSocialLoginConfigDto,
): Promise<SocialLoginConfigResponse> => {
	return await makeRestApiRequest(context, 'POST', '/sso/social/google/config', data);
};

export const saveGitHubSocialLoginConfig = async (
	context: IRestApiContext,
	data: GitHubSocialLoginConfigDto,
): Promise<SocialLoginConfigResponse> => {
	return await makeRestApiRequest(context, 'POST', '/sso/social/github/config', data);
};
