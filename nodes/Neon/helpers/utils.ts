import {
	NodeOperationError,
	type FieldType,
	type IDataObject,
	type IDisplayOptions,
	type INode,
	type INodeExecutionData,
	type INodeProperties,
} from 'n8n-workflow';
import type { ColumnInfo, NeonDatabase, QueryValues, SortRule, WhereClause } from './interface';
import { neonFieldTypeMapping } from './interface';

const allowedWhereOperators = new Set([
	'=',
	'!=',
	'>',
	'>=',
	'<',
	'<=',
	'IS NOT NULL',
	'IS NULL',
	'LIKE',
]);

type EnumRow = {
	enumlabel: string;
};

type SortCollection = {
	values?: SortRule[];
};

// ============================================================================
// COLUMN DESCRIPTION HELPERS
// ============================================================================

/**
 * Builds comprehensive column descriptions for better UX
 * Shows data type, length, nullability, and default values
 */
export function buildColumnDescription(column: ColumnInfo): string {
	let desc = `Type: ${column.data_type.toUpperCase()}`;

	// Add length for character types
	if (column.character_maximum_length) {
		desc += `(${column.character_maximum_length})`;
	}

	// Add precision and scale for numeric types
	if (column.numeric_precision && column.numeric_scale) {
		desc += `(${column.numeric_precision},${column.numeric_scale})`;
	}

	// Add nullability
	desc += `, Nullable: ${column.is_nullable}`;

	// Add default value if exists
	if (column.column_default) {
		desc += `, Default: ${column.column_default}`;
	}

	// Add identity information if applicable
	if (column.identity_generation === 'ALWAYS') {
		desc += `, Auto-generated`;
	}

	return desc;
}

// ============================================================================
// TYPE MAPPING HELPERS
// ============================================================================

/**
 * Maps PostgreSQL data types to n8n field types
 * Used for resource mapping and better data type handling
 */
export function mapPostgresType(postgresType: string): FieldType {
	let mappedType: FieldType = 'string';

	for (const [n8nType, postgresTypes] of Object.entries(neonFieldTypeMapping)) {
		if (postgresTypes.includes(postgresType.toLowerCase())) {
			mappedType = n8nType as FieldType;
			break;
		}
	}

	return mappedType;
}

// ============================================================================
// ENUM VALUE DISCOVERY
// ============================================================================

/**
 * Discovers enum values for a given enum type
 * Used for better UX when working with enum columns
 */
export async function getEnumValues(db: NeonDatabase, enumType: string): Promise<string[]> {
	try {
		const enumValues = await db.any<EnumRow>(
			`
            SELECT enumlabel
            FROM pg_enum
            WHERE enumtypid = (
                SELECT oid
                FROM pg_type
                WHERE typname = $1
            )
            ORDER BY enumsortorder
        `,
			[enumType],
		);

		return enumValues.map((value) => value.enumlabel);
	} catch {
		return [];
	}
}

// ============================================================================
// SQL CLAUSE BUILDING HELPERS
// ============================================================================

/**
 * Adds WHERE clauses to existing query
 * Converts UI filter configuration to SQL WHERE clause with proper parameterization
 */
export function addWhereClauses(
	node: INode,
	itemIndex: number,
	query: string,
	clauses: WhereClause[],
	replacements: QueryValues,
	combineConditions: string,
): [string, QueryValues] {
	if (!clauses || clauses.length === 0) return [query, replacements];

	let combineWith = 'AND';
	if (combineConditions === 'OR') {
		combineWith = 'OR';
	}

	let replacementIndex = replacements.length + 1;
	let whereQuery = ' WHERE';
	const values: QueryValues = [];

	clauses.forEach((clause, index) => {
		const condition = clause.condition === 'equal' ? '=' : clause.condition;
		if (!allowedWhereOperators.has(condition)) {
			throw new NodeOperationError(
				node,
				`Unsupported operator in entry ${index + 1} of 'Select Rows'`,
				{ itemIndex },
			);
		}

		let value = clause.value;
		if (['>', '<', '>=', '<='].includes(condition)) {
			value = Number(value);
			if (Number.isNaN(value)) {
				throw new NodeOperationError(
					node,
					`Operator in entry ${index + 1} of 'Select Rows' works with numbers, but value ${
						clause.value
					} is not a number`,
					{
						itemIndex,
					},
				);
			}
		}

		// Parameterize column names for security
		const columnReplacement = `$${replacementIndex}:name`;
		values.push(clause.column);
		replacementIndex = replacementIndex + 1;

		// Parameterize values (skip for NULL checks)
		let valueReplacement = '';
		if (condition !== 'IS NULL' && condition !== 'IS NOT NULL') {
			valueReplacement = ` $${replacementIndex}`;
			values.push(value);
			replacementIndex = replacementIndex + 1;
		}

		// Add operator between conditions (no trailing operator)
		const operator = index === clauses.length - 1 ? '' : ` ${combineWith}`;

		whereQuery += ` ${columnReplacement} ${condition}${valueReplacement}${operator}`;
	});

	return [`${query}${whereQuery}`, replacements.concat(...values)];
}

/**
 * Builds ORDER BY rules from UI parameters
 * Converts the UI sort configuration to actual SQL ORDER BY rules
 * Returns both the clause and parameter values for secure execution
 */
export function addSortRules(
	query: string,
	rules: SortCollection,
	replacements: QueryValues,
): [string, QueryValues] {
	if (!rules.values || rules.values.length === 0) return [query, replacements];

	let replacementIndex = replacements.length + 1;
	let orderByQuery = ' ORDER BY';
	const values: string[] = [];

	for (let index = 0; index < rules.values.length; index++) {
		const rule = rules.values[index];
		const columnReplacement = `$${replacementIndex}:name`;
		values.push(rule.column);
		replacementIndex = replacementIndex + 1;

		const endWith = index === rules.values.length - 1 ? '' : ',';
		const sortDirection = rule.direction === 'DESC' ? 'DESC' : 'ASC';

		orderByQuery += ` ${columnReplacement} ${sortDirection}${endWith}`;
	}

	return [`${query}${orderByQuery}`, replacements.concat(...values)];
}

/**
 * Builds SELECT columns clause from UI parameters
 * Converts the UI output columns configuration to actual SQL SELECT clause
 */
// ============================================================================
// DISPLAY OPTIONS UTILITIES
// ============================================================================

/**
 * Updates display options for properties
 * Merges displayOptions into each individual property for proper filtering
 */
export function mergeDisplayOptions(
	displayOptions: IDisplayOptions,
	properties: INodeProperties[],
) {
	return properties.map((nodeProperty) => {
		return {
			...nodeProperty,
			displayOptions: {
				show: {
					...nodeProperty.displayOptions?.show,
					...displayOptions.show,
				},
				hide: {
					...nodeProperty.displayOptions?.hide,
					...displayOptions.hide,
				},
			},
		};
	});
}

// ============================================================================
// SECURE EXECUTE QUERY UTILITIES
// ============================================================================

/**
 * Extracts n8n resolvable expressions from text
 * Used for processing n8n expressions in SQL queries and parameters
 */
export function getResolvables(text: string): string[] {
	const resolvableRegex = /{{[\s\S]*?}}/g;
	return text.match(resolvableRegex) || [];
}

/**
 * Converts comma-separated string to array
 * Used for parsing query parameters from user input
 */
export function stringToArray(value: string): string[] {
	return value
		.split(',')
		.filter((entry) => entry)
		.map((entry) => entry.trim());
}

/**
 * Checks if a value is valid JSON
 * Used for determining how to handle parameter values
 */
export function isJSON(value: unknown): boolean {
	// Only strings can be valid JSON
	if (typeof value !== 'string') {
		return false;
	}

	try {
		JSON.parse(value);
		return true;
	} catch {
		return false;
	}
}

/**
 * Replaces empty strings with NULL values in input data
 * Useful for handling data from spreadsheets where empty cells become empty strings
 */
export function replaceEmptyStringsByNulls(
	items: INodeExecutionData[],
	replace?: boolean,
): INodeExecutionData[] {
	if (!replace) return items;

	const returnData: INodeExecutionData[] = items.map((item) => {
		const newItem = { ...item };
		const keys = Object.keys(newItem.json);

		for (const key of keys) {
			if (newItem.json[key] === '') {
				newItem.json[key] = null;
			}
		}

		return newItem;
	});

	return returnData;
}

export async function getTableSchema(
	db: NeonDatabase,
	schema: string,
	table: string,
): Promise<ColumnInfo[]> {
	const query = `
    SELECT
      column_name,
      data_type,
      is_nullable,
      udt_name,
      column_default,
      identity_generation,
      is_generated
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = $2
  `;

	const columns = await db.any(query, [schema, table]);
	return columns;
}

export function checkItemAgainstSchema(
	node: INode,
	item: IDataObject,
	columnsInfo: ColumnInfo[],
	index: number,
) {
	if (columnsInfo.length === 0) return item;
	const schema = columnsInfo.reduce((acc, { column_name, data_type, is_nullable }) => {
		acc[column_name] = { type: data_type.toUpperCase(), nullable: is_nullable === 'YES' };
		return acc;
	}, {} as IDataObject);

	const keys = Object.keys(item);

	for (const key of keys) {
		if (schema[key] === undefined) {
			throw new NodeOperationError(node, `Column '${key}' does not exist in selected table`, {
				itemIndex: index,
			});
		}
		if (item[key] === null && !(schema[key] as IDataObject)?.nullable) {
			throw new NodeOperationError(node, `Column '${key}' is not nullable`, {
				itemIndex: index,
			});
		}
	}

	return item;
}

export function convertValuesToObject(values: IDataObject[]) {
	const item = values.reduce((acc, { column, value }) => {
		acc[column as string] = value;
		return acc;
	}, {} as IDataObject);

	return item;
}
