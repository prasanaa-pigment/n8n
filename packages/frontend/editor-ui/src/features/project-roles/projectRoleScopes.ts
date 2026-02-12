/**
 * UI-visible permission scopes for project roles.
 * These are the scopes shown in the role editor checkboxes and used for
 * permission counting. Excludes auto-added scopes like :list, :execute, :listProject.
 */

const project = (['read', 'update', 'delete'] as const).map(
	(action) => `project:${action}` as const,
);
const folder = (['read', 'update', 'create', 'move', 'delete'] as const).map(
	(action) => `folder:${action}` as const,
);
const workflow = (
	['read', 'update', 'create', 'publish', 'unpublish', 'move', 'delete'] as const
).map((action) => `workflow:${action}` as const);
const credential = (['read', 'update', 'create', 'share', 'move', 'delete'] as const).map(
	(action) => `credential:${action}` as const,
);
const sourceControl = (['push'] as const).map((action) => `sourceControl:${action}` as const);
const dataTable = (['read', 'readRow', 'update', 'writeRow', 'create', 'delete'] as const).map(
	(action) => `dataTable:${action}` as const,
);
const projectVariable = (['read', 'update', 'create', 'delete'] as const).map(
	(action) => `projectVariable:${action}` as const,
);

export const SCOPE_TYPES = [
	'project',
	'folder',
	'workflow',
	'credential',
	'dataTable',
	'projectVariable',
	'sourceControl',
] as const;

export const SCOPES = {
	project,
	folder,
	workflow,
	credential,
	sourceControl,
	dataTable,
	projectVariable,
} as const;

/** All UI-visible scopes as a flat set, for permission counting */
export const UI_VISIBLE_SCOPES: Set<string> = new Set(Object.values(SCOPES).flat());

/** Total number of UI-visible permissions */
export const TOTAL_PROJECT_PERMISSIONS = UI_VISIBLE_SCOPES.size;
