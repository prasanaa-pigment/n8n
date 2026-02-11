import { DATA_TYPE_ICON_MAP } from '@/app/constants';
import type { IconName } from '@n8n/design-system/components/N8nIcon/icons';

export interface SchemaPropertyType {
	type: string;
	icon: IconName;
}

export const SCHEMA_PROPERTY_TYPES: SchemaPropertyType[] = [
	{ type: 'string', icon: DATA_TYPE_ICON_MAP.string },
	{ type: 'number', icon: DATA_TYPE_ICON_MAP.number },
	{ type: 'integer', icon: DATA_TYPE_ICON_MAP.number },
	{ type: 'boolean', icon: DATA_TYPE_ICON_MAP.boolean },
	{ type: 'array', icon: DATA_TYPE_ICON_MAP.array },
	{ type: 'object', icon: DATA_TYPE_ICON_MAP.object },
];

export const ARRAY_ITEM_TYPES = ['string', 'number', 'integer', 'boolean', 'object'] as const;

export const MAX_NESTING_DEPTH = 3;
