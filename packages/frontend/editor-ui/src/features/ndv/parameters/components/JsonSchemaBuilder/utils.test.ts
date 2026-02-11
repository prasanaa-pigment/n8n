import { describe, it, expect } from 'vitest';
import {
	createEmptyProperty,
	propertyStatesToJsonSchema,
	jsonSchemaToPropertyStates,
	jsonExampleToSchema,
} from './utils';
import type { SchemaPropertyState } from './utils';

describe('createEmptyProperty', () => {
	it('should return a property with default values', () => {
		const prop = createEmptyProperty();
		expect(prop.name).toBe('');
		expect(prop.type).toBe('string');
		expect(prop.description).toBe('');
		expect(prop.required).toBe(false);
		expect(prop.id).toBeTruthy();
	});

	it('should return unique IDs', () => {
		const a = createEmptyProperty();
		const b = createEmptyProperty();
		expect(a.id).not.toBe(b.id);
	});
});

describe('propertyStatesToJsonSchema', () => {
	it('should return empty schema for no properties', () => {
		expect(propertyStatesToJsonSchema([])).toEqual({
			type: 'object',
			properties: {},
		});
	});

	it('should skip properties with empty names', () => {
		const props: SchemaPropertyState[] = [
			{ id: '1', name: '', type: 'string', description: '', required: false },
		];
		expect(propertyStatesToJsonSchema(props)).toEqual({
			type: 'object',
			properties: {},
		});
	});

	it('should convert simple string property', () => {
		const props: SchemaPropertyState[] = [
			{ id: '1', name: 'foo', type: 'string', description: '', required: false },
		];
		expect(propertyStatesToJsonSchema(props)).toEqual({
			type: 'object',
			properties: { foo: { type: 'string' } },
		});
	});

	it('should handle multiple property types', () => {
		const props: SchemaPropertyState[] = [
			{ id: '1', name: 'a', type: 'string', description: '', required: false },
			{ id: '2', name: 'b', type: 'number', description: '', required: false },
			{ id: '3', name: 'c', type: 'boolean', description: '', required: false },
		];
		const schema = propertyStatesToJsonSchema(props);
		expect(schema.properties).toEqual({
			a: { type: 'string' },
			b: { type: 'number' },
			c: { type: 'boolean' },
		});
	});

	it('should include required array for required properties', () => {
		const props: SchemaPropertyState[] = [
			{ id: '1', name: 'a', type: 'string', description: '', required: true },
			{ id: '2', name: 'b', type: 'number', description: '', required: false },
		];
		const schema = propertyStatesToJsonSchema(props);
		expect(schema.required).toEqual(['a']);
	});

	it('should include description when present', () => {
		const props: SchemaPropertyState[] = [
			{ id: '1', name: 'foo', type: 'string', description: 'A foo field', required: false },
		];
		const schema = propertyStatesToJsonSchema(props);
		expect(schema.properties!.foo).toEqual({ type: 'string', description: 'A foo field' });
	});

	it('should handle array properties', () => {
		const props: SchemaPropertyState[] = [
			{
				id: '1',
				name: 'tags',
				type: 'array',
				description: '',
				required: false,
				arrayItemType: 'string',
			},
		];
		const schema = propertyStatesToJsonSchema(props);
		expect(schema.properties!.tags).toEqual({
			type: 'array',
			items: { type: 'string' },
		});
	});

	it('should handle nested object properties', () => {
		const props: SchemaPropertyState[] = [
			{
				id: '1',
				name: 'address',
				type: 'object',
				description: '',
				required: false,
				nestedProperties: [
					{ id: '2', name: 'street', type: 'string', description: '', required: true },
					{ id: '3', name: 'city', type: 'string', description: '', required: false },
				],
			},
		];
		const schema = propertyStatesToJsonSchema(props);
		expect(schema.properties!.address).toEqual({
			type: 'object',
			properties: {
				street: { type: 'string' },
				city: { type: 'string' },
			},
			required: ['street'],
		});
	});

	it('should handle enum values', () => {
		const props: SchemaPropertyState[] = [
			{
				id: '1',
				name: 'status',
				type: 'string',
				description: '',
				required: false,
				enumValues: ['active', 'inactive'],
			},
		];
		const schema = propertyStatesToJsonSchema(props);
		expect(schema.properties!.status).toEqual({
			type: 'string',
			enum: ['active', 'inactive'],
		});
	});

	it('should handle arrays of objects', () => {
		const props: SchemaPropertyState[] = [
			{
				id: '1',
				name: 'items',
				type: 'array',
				description: '',
				required: false,
				arrayItemType: 'object',
				nestedProperties: [
					{ id: '2', name: 'name', type: 'string', description: '', required: true },
				],
			},
		];
		const schema = propertyStatesToJsonSchema(props);
		expect(schema.properties!.items).toEqual({
			type: 'array',
			items: {
				type: 'object',
				properties: { name: { type: 'string' } },
				required: ['name'],
			},
		});
	});
});

describe('jsonSchemaToPropertyStates', () => {
	it('should return empty array for empty schema', () => {
		expect(jsonSchemaToPropertyStates({ type: 'object' })).toEqual([]);
		expect(jsonSchemaToPropertyStates({ type: 'object', properties: {} })).toEqual([]);
	});

	it('should convert simple properties', () => {
		const states = jsonSchemaToPropertyStates({
			type: 'object',
			properties: {
				name: { type: 'string' },
				age: { type: 'integer' },
			},
			required: ['name'],
		});
		expect(states).toHaveLength(2);
		expect(states[0]).toMatchObject({ name: 'name', type: 'string', required: true });
		expect(states[1]).toMatchObject({ name: 'age', type: 'integer', required: false });
	});

	it('should convert array properties', () => {
		const states = jsonSchemaToPropertyStates({
			type: 'object',
			properties: {
				tags: { type: 'array', items: { type: 'string' } },
			},
		});
		expect(states).toHaveLength(1);
		expect(states[0]).toMatchObject({
			name: 'tags',
			type: 'array',
			arrayItemType: 'string',
		});
	});

	it('should convert nested object properties', () => {
		const states = jsonSchemaToPropertyStates({
			type: 'object',
			properties: {
				address: {
					type: 'object',
					properties: {
						street: { type: 'string' },
					},
					required: ['street'],
				},
			},
		});
		expect(states).toHaveLength(1);
		expect(states[0].nestedProperties).toHaveLength(1);
		expect(states[0].nestedProperties![0]).toMatchObject({
			name: 'street',
			type: 'string',
			required: true,
		});
	});

	it('should convert enum properties', () => {
		const states = jsonSchemaToPropertyStates({
			type: 'object',
			properties: {
				status: { type: 'string', enum: ['a', 'b'] },
			},
		});
		expect(states[0].enumValues).toEqual(['a', 'b']);
	});
});

describe('roundtrip conversions', () => {
	it('should roundtrip a simple schema', () => {
		const schema = {
			type: 'object' as const,
			properties: {
				name: { type: 'string' },
				count: { type: 'integer' },
			},
			required: ['name'],
		};
		const states = jsonSchemaToPropertyStates(schema);
		const result = propertyStatesToJsonSchema(states);
		expect(result).toEqual(schema);
	});

	it('should roundtrip a nested schema', () => {
		const schema = {
			type: 'object' as const,
			properties: {
				user: {
					type: 'object',
					properties: {
						email: { type: 'string' },
					},
					required: ['email'],
				},
			},
		};
		const states = jsonSchemaToPropertyStates(schema);
		const result = propertyStatesToJsonSchema(states);
		expect(result).toEqual(schema);
	});

	it('should roundtrip an array schema', () => {
		const schema = {
			type: 'object' as const,
			properties: {
				tags: { type: 'array', items: { type: 'string' } },
			},
		};
		const states = jsonSchemaToPropertyStates(schema);
		const result = propertyStatesToJsonSchema(states);
		expect(result).toEqual(schema);
	});
});

describe('jsonExampleToSchema', () => {
	it('should infer schema from a simple object', () => {
		const schema = jsonExampleToSchema('{"name": "John", "age": 30}');
		expect(schema).toEqual({
			type: 'object',
			properties: {
				name: { type: 'string' },
				age: { type: 'integer' },
			},
		});
	});

	it('should mark all fields required when allFieldsRequired is true', () => {
		const schema = jsonExampleToSchema('{"name": "John", "age": 30}', true);
		expect(schema.required).toEqual(['name', 'age']);
	});

	it('should not add required when allFieldsRequired is false', () => {
		const schema = jsonExampleToSchema('{"name": "John"}', false);
		expect(schema.required).toBeUndefined();
	});

	it('should detect float vs integer', () => {
		const schema = jsonExampleToSchema('{"a": 1, "b": 1.5}');
		expect(schema.properties!.a).toEqual({ type: 'integer' });
		expect(schema.properties!.b).toEqual({ type: 'number' });
	});

	it('should detect boolean type', () => {
		const schema = jsonExampleToSchema('{"active": true}');
		expect(schema.properties!.active).toEqual({ type: 'boolean' });
	});

	it('should handle null values as string type', () => {
		const schema = jsonExampleToSchema('{"value": null}');
		expect(schema.properties!.value).toEqual({ type: 'string' });
	});

	it('should handle nested objects', () => {
		const schema = jsonExampleToSchema('{"user": {"name": "John"}}');
		expect(schema.properties!.user).toEqual({
			type: 'object',
			properties: { name: { type: 'string' } },
		});
	});

	it('should handle nested required fields', () => {
		const schema = jsonExampleToSchema('{"user": {"name": "John"}}', true);
		expect(schema.properties!.user).toEqual({
			type: 'object',
			properties: { name: { type: 'string' } },
			required: ['name'],
		});
	});

	it('should handle empty arrays', () => {
		const schema = jsonExampleToSchema('{"items": []}');
		expect(schema.properties!.items).toEqual({ type: 'array', items: { type: 'string' } });
	});

	it('should handle arrays of strings', () => {
		const schema = jsonExampleToSchema('{"tags": ["a", "b"]}');
		expect(schema.properties!.tags).toEqual({ type: 'array', items: { type: 'string' } });
	});

	it('should handle arrays of objects', () => {
		const schema = jsonExampleToSchema('{"items": [{"name": "test"}]}');
		expect(schema.properties!.items).toEqual({
			type: 'array',
			items: {
				type: 'object',
				properties: { name: { type: 'string' } },
			},
		});
	});

	it('should throw on invalid JSON', () => {
		expect(() => jsonExampleToSchema('not json')).toThrow();
	});

	it('should throw on non-object input', () => {
		expect(() => jsonExampleToSchema('"just a string"')).toThrow('Input must be a JSON object');
		expect(() => jsonExampleToSchema('[1,2,3]')).toThrow('Input must be a JSON object');
		expect(() => jsonExampleToSchema('null')).toThrow('Input must be a JSON object');
	});
});
