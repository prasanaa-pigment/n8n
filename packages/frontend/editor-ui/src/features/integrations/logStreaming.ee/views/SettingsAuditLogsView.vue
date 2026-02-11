<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref, computed, watch } from 'vue';
import type { AuditLogEvent, AuditLogFilterDto } from '@n8n/api-types';
import { getAuditLogs } from '@n8n/rest-api-client';
import { useDocumentTitle } from '@/app/composables/useDocumentTitle';
import { useI18n } from '@n8n/i18n';
import { useRootStore } from '@n8n/stores/useRootStore';
import { useDebounce } from '@/app/composables/useDebounce';
import ResourcesListLayout from '@/app/components/layouts/ResourcesListLayout.vue';
import AuditLogPayload from '../components/AuditLogPayload.vue';
import type { BaseFilters, DatatableColumn } from '@/Interface';
import { ElDatePicker } from 'element-plus';
import {
	N8nHeading,
	N8nInputLabel,
	N8nSelect,
	N8nOption,
	N8nText,
	N8nInput,
	N8nCheckbox,
	N8nTooltip,
} from '@n8n/design-system';

interface AuditLogResource extends AuditLogEvent {
	id: string;
	name: string;
}

interface AuditLogFilters extends BaseFilters {
	eventName: string;
	userId: string;
}

const documentTitle = useDocumentTitle();
const i18n = useI18n();
const rootStore = useRootStore();
const { debounce } = useDebounce();

const auditLogs = ref<AuditLogResource[]>([]);
const isLoading = ref(true);
const autoRefresh = ref(false);
const autoRefreshTimeout = ref<NodeJS.Timeout | null>(null);
const autoRefreshDelay = ref(10 * 1000); // 10 seconds

const filters = ref<AuditLogFilters>({
	search: '',
	homeProject: '',
	eventName: '',
	userId: '',
});

const dateRange = ref<[Date, Date] | null>(null);

// Pagination state
const currentPage = ref(1);
const pageSize = ref(50);
const totalRecords = ref(0);

// Available event names for the dropdown
const eventNames = ref<string[]>([
	'n8n.audit.user.login.success',
	'n8n.audit.user.login.failed',
	'n8n.audit.user.signedup',
	'n8n.audit.user.updated',
	'n8n.audit.user.deleted',
	'n8n.audit.user.invited',
	'n8n.audit.user.invitation.accepted',
	'n8n.audit.user.credentials.created',
	'n8n.audit.user.credentials.updated',
	'n8n.audit.user.credentials.deleted',
	'n8n.audit.user.credentials.shared',
	'n8n.audit.user.api.created',
	'n8n.audit.user.api.deleted',
	'n8n.audit.user.mfa.enabled',
	'n8n.audit.user.mfa.disabled',
	'n8n.audit.workflow.created',
	'n8n.audit.workflow.updated',
	'n8n.audit.workflow.deleted',
	'n8n.audit.workflow.activated',
	'n8n.audit.workflow.deactivated',
	'n8n.audit.workflow.archived',
	'n8n.audit.workflow.unarchived',
	'n8n.audit.workflow.executed',
	'n8n.audit.workflow.version.updated',
	'n8n.audit.variable.created',
	'n8n.audit.variable.updated',
	'n8n.audit.variable.deleted',
	'n8n.audit.package.installed',
]);

const columns = computed<DatatableColumn[]>(() => [
	{
		id: 0,
		path: 'eventName',
		label: i18n.baseText('settings.auditLogs.table.header.event'),
		classes: ['audit-log-event-column'],
	},
	{
		id: 1,
		path: 'timestamp',
		label: i18n.baseText('settings.auditLogs.table.header.timestamp'),
		classes: ['audit-log-timestamp-column'],
	},
	{
		id: 2,
		path: 'userId',
		label: i18n.baseText('settings.auditLogs.table.header.user'),
		classes: ['audit-log-user-column'],
	},
	{
		id: 3,
		path: 'payload',
		label: i18n.baseText('settings.auditLogs.table.header.details'),
		classes: ['audit-log-details-column'],
	},
]);

function displayName(log: AuditLogResource): string {
	return log.eventName;
}

function formatEventName(eventName: string): string {
	// Remove 'n8n.audit.' prefix first, then fall back to 'n8n.' prefix
	if (eventName.startsWith('n8n.audit.')) {
		return eventName.substring('n8n.audit.'.length);
	}
	if (eventName.startsWith('n8n.')) {
		return eventName.substring('n8n.'.length);
	}
	return eventName;
}

function formatTimestamp(timestamp: Date | string): string {
	return new Date(timestamp).toLocaleString();
}

function getMessage(log: AuditLogResource): string {
	if (log.message) {
		return log.message;
	}
	return '';
}

function getUserDisplay(log: AuditLogResource): string {
	if (log.payload?.email) {
		return `${log.payload.email}`;
	}
	if (log.payload?._email) {
		return `${log.payload._email}`;
	}
	if (log.userId) {
		return log.userId;
	}
	return i18n.baseText('settings.auditLogs.table.row.system');
}

async function initialize() {
	await fetchAuditLogs();
}

async function fetchAuditLogs() {
	try {
		isLoading.value = true;

		const filterParams: AuditLogFilterDto = {};
		if (filters.value.eventName) filterParams.eventName = filters.value.eventName;
		if (filters.value.userId) filterParams.userId = filters.value.userId;

		if (dateRange.value && dateRange.value.length === 2) {
			filterParams.after = dateRange.value[0].toISOString();
			filterParams.before = dateRange.value[1].toISOString();
		}

		// Add pagination parameters
		filterParams.skip = (currentPage.value - 1) * pageSize.value;
		filterParams.take = pageSize.value;

		const response = await getAuditLogs(rootStore.restApiContext, filterParams);

		auditLogs.value = response.data.map((event) => ({
			...event,
			id: event.id,
			name: event.eventName,
		}));
		totalRecords.value = response.count;
	} catch (err) {
		console.error('Failed to fetch audit logs:', err);
	} finally {
		isLoading.value = false;
	}
}

const debouncedFetchAuditLogs = debounce(fetchAuditLogs, { debounceTime: 300 });

async function onFiltersUpdated(newFilters: AuditLogFilters) {
	filters.value = newFilters;
	currentPage.value = 1; // Reset to first page when filters change
	await debouncedFetchAuditLogs();
}

async function loadAutoRefresh() {
	autoRefreshTimeout.value = setTimeout(async () => {
		if (autoRefresh.value) {
			await fetchAuditLogs();
			void startAutoRefreshInterval();
		}
	}, autoRefreshDelay.value);
}

async function startAutoRefreshInterval() {
	stopAutoRefreshInterval();
	await loadAutoRefresh();
}

function stopAutoRefreshInterval() {
	if (autoRefreshTimeout.value) {
		clearTimeout(autoRefreshTimeout.value);
		autoRefreshTimeout.value = null;
	}
}

watch(dateRange, async () => {
	currentPage.value = 1; // Reset to first page when date range changes
	await debouncedFetchAuditLogs();
});

watch(autoRefresh, (enabled) => {
	if (enabled) {
		void startAutoRefreshInterval();
	} else {
		stopAutoRefreshInterval();
	}
});

onMounted(() => {
	documentTitle.set(i18n.baseText('settings.auditLogs.heading'));
});

onBeforeUnmount(() => {
	stopAutoRefreshInterval();
});
</script>

<template>
	<div :class="$style.auditLogsContainer">
		<!-- @ts-expect-error - ResourcesListLayout type definitions don't match our use case -->
		<ResourcesListLayout
			v-model:filters="filters"
			resource-key="auditLogs"
			:display-name="displayName"
			:resources="auditLogs"
			:initialize="initialize"
			:disabled="false"
			:loading="isLoading"
			:shareable="false"
			:ui-config="{
				searchEnabled: false,
				showFiltersDropdown: true,
				sortEnabled: false,
			}"
			type="datatable"
			:type-props="{ columns }"
			@update:filters="onFiltersUpdated"
		>
			<template #header>
				<div class="mb-2xl">
					<N8nHeading size="2xlarge">
						{{ i18n.baseText('settings.auditLogs.heading') }}
					</N8nHeading>
				</div>
			</template>

			<template #breadcrumbs>
				<N8nTooltip placement="top">
					<template #content>
						{{ i18n.baseText('settings.auditLogs.autoRefresh.tooltip') }}
					</template>
					<N8nCheckbox
						v-model="autoRefresh"
						:label="i18n.baseText('settings.auditLogs.autoRefresh.label')"
						data-test-id="auto-refresh-checkbox"
					/>
				</N8nTooltip>
			</template>

			<template #filters="{ setKeyValue }">
				<div class="mb-s">
					<N8nInputLabel
						:label="i18n.baseText('settings.auditLogs.filter.eventName.label')"
						:bold="false"
						size="small"
						color="text-base"
						class="mb-3xs"
					/>
					<N8nSelect
						:model-value="filters.eventName"
						:placeholder="i18n.baseText('settings.auditLogs.filter.eventName.placeholder')"
						clearable
						filterable
						data-test-id="audit-logs-event-filter"
						@update:model-value="setKeyValue('eventName', $event)"
					>
						<N8nOption
							v-for="eventName in eventNames"
							:key="eventName"
							:value="eventName"
							:label="eventName"
						/>
					</N8nSelect>
				</div>

				<div class="mb-s">
					<N8nInputLabel
						:label="i18n.baseText('settings.auditLogs.filter.userId.label')"
						:bold="false"
						size="small"
						color="text-base"
						class="mb-3xs"
					/>
					<N8nInput
						:model-value="filters.userId"
						:placeholder="i18n.baseText('settings.auditLogs.filter.userId.placeholder')"
						clearable
						data-test-id="audit-logs-user-filter"
						@update:model-value="setKeyValue('userId', $event)"
					/>
				</div>

				<div>
					<N8nInputLabel
						:label="i18n.baseText('settings.auditLogs.filter.dateRange.label')"
						:bold="false"
						size="small"
						color="text-base"
						class="mb-3xs"
					/>
					<ElDatePicker
						v-model="dateRange"
						type="datetimerange"
						:placeholder="i18n.baseText('settings.auditLogs.filter.dateRange.placeholder')"
						:start-placeholder="i18n.baseText('settings.auditLogs.filter.dateRange.start')"
						:end-placeholder="i18n.baseText('settings.auditLogs.filter.dateRange.end')"
						:clearable="true"
						size="default"
						data-test-id="audit-logs-date-filter"
					/>
				</div>
			</template>

			<template #default="{ data }">
				<tr data-test-id="audit-log-row">
					<td>
						<N8nText color="text-base" size="small">
							{{ formatTimestamp(data.timestamp) }}
						</N8nText>
					</td>
					<td>
						<N8nText :class="$style.eventName" color="text-dark" size="small" bold>
							{{ formatEventName(data.eventName) }}
						</N8nText>
					</td>
					<td>
						<N8nText v-if="getMessage(data)" color="text-base" size="small">
							{{ getMessage(data) }}
						</N8nText>
						<N8nText v-else color="text-light" size="small" italic> — </N8nText>
					</td>
					<td>
						<div :class="$style.userCell">
							<N8nText color="text-base" size="small">
								{{ getUserDisplay(data) }}
							</N8nText>
							<N8nText
								v-if="data.payload?.userEmail"
								color="text-light"
								size="small"
								:class="$style.userEmail"
							>
								{{ data.payload.userEmail }}
							</N8nText>
						</div>
					</td>
					<td>
						<AuditLogPayload :event-name="data.eventName" :payload="data.payload" />
					</td>
				</tr>
			</template>
		</ResourcesListLayout>
	</div>
</template>

<style lang="scss" module>
.auditLogsContainer {
	display: flex;
	flex-direction: column;
	height: 100%;
}

.eventName {
	font-family: var(--font-family--monospace, 'Courier New', monospace);
}

.userCell {
	display: flex;
	flex-direction: column;
	gap: var(--spacing--4xs);
}

.userEmail {
	font-size: var(--font-size--2xs);
}
</style>
