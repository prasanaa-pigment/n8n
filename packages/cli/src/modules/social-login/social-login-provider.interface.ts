import type { AuthProviderType } from '@n8n/db';

export interface SocialLoginUserInfo {
	/** Unique identifier from the provider (e.g. Google 'sub' claim) */
	providerId: string;

	/** User's email address */
	email: string;

	/** User's first name */
	firstName?: string;

	/** User's last name */
	lastName?: string;
}

export interface SocialLoginAuthorizationResult {
	/** URL to redirect the user to */
	url: string;

	/** Signed state string to store in cookie for CSRF protection */
	state: string;
}

export interface SocialLoginProvider {
	/** Provider name used in routes and identifiers (e.g. 'google', 'github') */
	readonly name: string;

	/** The AuthProviderType for storing in AuthIdentity */
	readonly providerType: AuthProviderType;

	/** Whether this provider is enabled and properly configured */
	isEnabled(): boolean;

	/** Generate the authorization URL and state for the OAuth2 flow */
	getAuthorizationUrl(callbackUrl: string): Promise<SocialLoginAuthorizationResult>;

	/** Exchange the callback parameters for user info */
	exchangeCodeForUser(callbackUrl: URL, storedState: string): Promise<SocialLoginUserInfo>;
}
