import type { QuickConnectOption } from '@n8n/api-types';
import { computed } from 'vue';

import { useSettingsStore } from '@/app/stores/settings.store';
import { useCredentialsStore } from '../credentials.store';

/**
 * Composable for quick connect detection and OAuth type checking.
 * Used to determine when to show quick connect UI vs standard credential selection.
 */
export function useQuickConnect() {
	const settingsStore = useSettingsStore();
	const credentialsStore = useCredentialsStore();

	const quickConnectOptions = computed<QuickConnectOption[]>(
		() => settingsStore.moduleSettings['quick-connect']?.options ?? [],
	);

	/**
	 * Get parent types for a credential type (e.g., googleSheetsOAuth2Api extends googleOAuth2Api extends oAuth2Api).
	 */
	function getParentTypes(credentialTypeName: string): string[] {
		const type = credentialsStore.getCredentialTypeByName(credentialTypeName);

		if (type?.extends === undefined) {
			return [];
		}

		const types: string[] = [];
		for (const typeName of type.extends) {
			types.push(typeName);
			types.push(...getParentTypes(typeName));
		}

		return types;
	}

	/**
	 * Check if a credential type is an OAuth type (extends oAuth2Api or oAuth1Api).
	 */
	function isOAuthCredentialType(credentialTypeName: string): boolean {
		const parentTypes = getParentTypes(credentialTypeName);
		return (
			credentialTypeName === 'oAuth2Api' ||
			credentialTypeName === 'oAuth1Api' ||
			parentTypes.includes('oAuth2Api') ||
			parentTypes.includes('oAuth1Api')
		);
	}

	/**
	 * Check if a credential type is Google OAuth (extends googleOAuth2Api).
	 */
	function isGoogleOAuthType(credentialTypeName: string): boolean {
		const parentTypes = getParentTypes(credentialTypeName);
		return credentialTypeName === 'googleOAuth2Api' || parentTypes.includes('googleOAuth2Api');
	}

	/**
	 * Check if quick connect is configured for a credential type.
	 */
	function hasQuickConnect(credentialTypeName: string, nodeType?: string): boolean {
		return quickConnectOptions.value.some(
			(option) =>
				option.credentialType === credentialTypeName &&
				(nodeType === undefined || option.packageName === nodeType.split('.')[0]),
		);
	}

	/**
	 * Get the quick connect option for a credential type.
	 */
	function getQuickConnectOption(
		credentialTypeName: string,
		nodeType?: string,
	): QuickConnectOption | undefined {
		return quickConnectOptions.value.find(
			(option) =>
				option.credentialType === credentialTypeName &&
				(nodeType === undefined || option.packageName === nodeType.split('.')[0]),
		);
	}

	/**
	 * Check if managed OAuth is available for a credential type.
	 * This checks if the credential type is OAuth-based AND has overwrites configured.
	 *
	 * Note: For now, we check if the credential type is OAuth-based as we don't have
	 * direct access to credential overwrites from the frontend. The actual overwrites
	 * are applied server-side during OAuth flow.
	 */
	function hasManagedOAuthAvailable(credentialTypeName: string): boolean {
		// Check if this is an OAuth credential type
		// The actual managed OAuth detection would require knowing if CREDENTIALS_OVERWRITE_DATA
		// has data for this type, but that info is not directly exposed to frontend.
		// Instead, we rely on the quick connect options being configured for managed OAuth cases.
		return isOAuthCredentialType(credentialTypeName);
	}

	/**
	 * Check if quick connect UI should be shown for a credential type.
	 * Returns true if EITHER quick connect OR managed OAuth is available.
	 */
	function shouldShowQuickConnectUI(credentialTypeName: string, nodeType?: string): boolean {
		return (
			hasQuickConnect(credentialTypeName, nodeType) ||
			(hasManagedOAuthAvailable(credentialTypeName) &&
				quickConnectOptions.value.some((opt) => opt.credentialType === credentialTypeName))
		);
	}

	/**
	 * Get the sign-in button text for a credential type.
	 */
	function getSignInButtonText(credentialTypeName: string, nodeType?: string): string {
		const option = getQuickConnectOption(credentialTypeName, nodeType);
		if (option?.text) {
			return option.text;
		}

		// Fallback to credential display name
		const credentialType = credentialsStore.getCredentialTypeByName(credentialTypeName);
		const displayName = credentialType?.displayName ?? credentialTypeName;

		// Remove common suffixes for cleaner display
		const cleanName = displayName.replace(/\s*(OAuth2?|API|Credentials?)\s*/gi, '').trim();

		return `Sign in with ${cleanName}`;
	}

	return {
		quickConnectOptions,
		getParentTypes,
		isOAuthCredentialType,
		isGoogleOAuthType,
		hasQuickConnect,
		getQuickConnectOption,
		hasManagedOAuthAvailable,
		shouldShowQuickConnectUI,
		getSignInButtonText,
	};
}
