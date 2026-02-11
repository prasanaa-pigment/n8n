import type { JsonSchemaValue } from 'n8n-workflow';

export interface SchemaPropertyState {
	id: string;
	name: string;
	type: string;
	description: string;
	required: boolean;
	enumValues?: string[];
	arrayItemType?: string;
	nestedProperties?: SchemaPropertyState[];
}

export function createEmptyProperty(): SchemaPropertyState {
	return {
		id: crypto.randomUUID(),
		name: '',
		type: 'string',
		description: '',
		required: false,
	};
}

function propertyStateToSchemaEntry(prop: SchemaPropertyState): Record<string, unknown> {
	const entry: Record<string, unknown> = { type: prop.type };

	if (prop.description) {
		entry.description = prop.description;
	}

	if (prop.enumValues && prop.enumValues.length > 0) {
		entry.enum = prop.enumValues;
	}

	if (prop.type === 'array') {
		const itemType = prop.arrayItemType ?? 'string';
		if (itemType === 'object' && prop.nestedProperties) {
			entry.items = propertyStatesToJsonSchema(prop.nestedProperties);
		} else {
			entry.items = { type: itemType };
		}
	}

	if (prop.type === 'object' && prop.nestedProperties) {
		const nested = propertyStatesToJsonSchema(prop.nestedProperties);
		entry.properties = nested.properties;
		if (nested.required && nested.required.length > 0) {
			entry.required = nested.required;
		}
	}

	return entry;
}

export function propertyStatesToJsonSchema(properties: SchemaPropertyState[]): JsonSchemaValue {
	const schema: JsonSchemaValue = {
		type: 'object',
		properties: {},
	};

	const required: string[] = [];

	for (const prop of properties) {
		if (!prop.name) continue;
		schema.properties![prop.name] = propertyStateToSchemaEntry(prop);
		if (prop.required) {
			required.push(prop.name);
		}
	}

	if (required.length > 0) {
		schema.required = required;
	}

	return schema;
}

function schemaEntryToPropertyState(
	name: string,
	entry: Record<string, unknown>,
	isRequired: boolean,
): SchemaPropertyState {
	const state: SchemaPropertyState = {
		id: crypto.randomUUID(),
		name,
		type: (entry.type as string) ?? 'string',
		description: (entry.description as string) ?? '',
		required: isRequired,
	};

	if (Array.isArray(entry.enum)) {
		state.enumValues = entry.enum as string[];
	}

	if (entry.type === 'array' && entry.items) {
		const items = entry.items as Record<string, unknown>;
		if (items.type === 'object') {
			state.arrayItemType = 'object';
			state.nestedProperties = jsonSchemaToPropertyStates(items as unknown as JsonSchemaValue);
		} else {
			state.arrayItemType = (items.type as string) ?? 'string';
		}
	}

	if (entry.type === 'object' && entry.properties) {
		state.nestedProperties = jsonSchemaToPropertyStates({
			type: 'object',
			properties: entry.properties as Record<string, unknown>,
			required: entry.required as string[] | undefined,
		});
	}

	return state;
}

export function jsonSchemaToPropertyStates(schema: JsonSchemaValue): SchemaPropertyState[] {
	if (!schema?.properties) return [];

	const requiredFields = schema.required ?? [];

	return Object.entries(schema.properties).map(([name, entry]) =>
		schemaEntryToPropertyState(
			name,
			entry as Record<string, unknown>,
			requiredFields.includes(name),
		),
	);
}

function inferPropertySchema(value: unknown, allFieldsRequired: boolean): Record<string, unknown> {
	if (value === null) {
		return { type: 'string' };
	}

	if (typeof value === 'string') {
		return { type: 'string' };
	}

	if (typeof value === 'boolean') {
		return { type: 'boolean' };
	}

	if (typeof value === 'number') {
		return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return { type: 'array', items: { type: 'string' } };
		}
		const firstItem = value[0] as unknown;
		if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
			return {
				type: 'array',
				items: inferSchema(firstItem as Record<string, unknown>, allFieldsRequired),
			};
		}
		return { type: 'array', items: inferPropertySchema(firstItem, allFieldsRequired) };
	}

	if (typeof value === 'object') {
		return inferSchema(value as Record<string, unknown>, allFieldsRequired) as unknown as Record<
			string,
			unknown
		>;
	}

	return { type: 'string' };
}

function inferSchema(obj: Record<string, unknown>, allFieldsRequired: boolean): JsonSchemaValue {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		properties[key] = inferPropertySchema(value, allFieldsRequired);
		if (allFieldsRequired) {
			required.push(key);
		}
	}

	const schema: JsonSchemaValue = {
		type: 'object',
		properties,
	};

	if (required.length > 0) {
		schema.required = required;
	}

	return schema;
}

export function jsonExampleToSchema(
	exampleJson: string,
	allFieldsRequired = false,
): JsonSchemaValue {
	const parsed = JSON.parse(exampleJson) as unknown;

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error('Input must be a JSON object');
	}

	return inferSchema(parsed as Record<string, unknown>, allFieldsRequired);
}
