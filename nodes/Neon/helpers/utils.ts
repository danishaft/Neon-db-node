import { jsonParse, NodeOperationError, type FieldType, type IDataObject, type IDisplayOptions, type INodeProperties } from 'n8n-workflow';
import type { ColumnInfo, NeonClient, NeonDatabase } from './interface';
import { neonFieldTypeMapping } from './interface';
import { merge } from 'lodash';
import type { INode, INodeExecutionData } from 'n8n-workflow';

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
export async function getEnumValues(db: any, enumType: string): Promise<string[]> {
    try {
        const enumValues = await db.any(`
            SELECT enumlabel
            FROM pg_enum
            WHERE enumtypid = (
                SELECT oid
                FROM pg_type
                WHERE typname = $1
            )
            ORDER BY enumsortorder
        `, [enumType]);

        return enumValues.map((value: any) => value.enumlabel);
    } catch (error) {
        // Graceful fallback if enum query fails
        console.warn(`Failed to get enum values for ${enumType}:`, error.message);
        return [];
    }
}

// ============================================================================
// SQL CLAUSE BUILDING HELPERS
// ============================================================================

/**
 * Builds WHERE clause from UI parameters
 * Converts the UI filter configuration to actual SQL WHERE clause
 */
export function buildWhereClause(whereParams: any, schema: string, table: string): { clause: string; values: any[] } {
	if (!whereParams || !whereParams.values || whereParams.values.length === 0) {
		return { clause: '', values: [] };
	}

	const conditions: string[] = [];
	const values: any[] = [];
	let paramIndex = 1;

	for (const condition of whereParams.values) {
		const { column, condition: operator, value } = condition;

		if (!column) continue;

		switch (operator) {
			case 'equal':
				conditions.push(`${column} = $${paramIndex}`);
				values.push(value);
				paramIndex++;
				break;
			case '!=':
				conditions.push(`${column} != $${paramIndex}`);
				values.push(value);
				paramIndex++;
				break;
			case 'LIKE':
				conditions.push(`${column} LIKE $${paramIndex}`);
				values.push(value);
				paramIndex++;
				break;
			case '>':
				conditions.push(`${column} > $${paramIndex}`);
				values.push(value);
				paramIndex++;
				break;
			case '<':
				conditions.push(`${column} < $${paramIndex}`);
				values.push(value);
				paramIndex++;
				break;
			case '>=':
				conditions.push(`${column} >= $${paramIndex}`);
				values.push(value);
				paramIndex++;
				break;
			case '<=':
				conditions.push(`${column} <= $${paramIndex}`);
				values.push(value);
				paramIndex++;
				break;
			case 'IS NULL':
				conditions.push(`${column} IS NULL`);
				break;
			case 'IS NOT NULL':
				conditions.push(`${column} IS NOT NULL`);
				break;
		}
	}

	if (conditions.length === 0) {
		return { clause: '', values: [] };
	}

	const combineOperator = whereParams.combineConditions || 'AND';
	const clause = `WHERE ${conditions.join(` ${combineOperator} `)}`;

	return { clause, values };
}

/**
 * Builds ORDER BY clause from UI parameters
 * Converts the UI sort configuration to actual SQL ORDER BY clause
 */
export function buildSortClause(sortParams: any): string {
	if (!sortParams || !sortParams.values || sortParams.values.length === 0) {
		return '';
	}

	const orders: string[] = [];

	for (const sort of sortParams.values) {
		const { column, direction } = sort;

		if (!column) continue;

		orders.push(`${column} ${direction || 'ASC'}`);
	}

	if (orders.length === 0) {
		return '';
	}

	return `ORDER BY ${orders.join(', ')}`;
}

/**
 * Builds SELECT columns clause from UI parameters
 * Converts the UI output columns configuration to actual SQL SELECT clause
 */
export function buildSelectColumns(outputColumns: string[]): string {
	if (!outputColumns || outputColumns.length === 0) {
		return '*';
	}

	return outputColumns.join(', ');
}

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
			displayOptions: merge({}, nodeProperty.displayOptions, displayOptions ),
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
	return value.split(',').filter(entry => entry).map(entry => entry.trim());
}

/**
 * Checks if a value is valid JSON
 * Used for determining how to handle parameter values
 */
export function isJSON(value: any): boolean {
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
 * Determines whether to continue execution on failure based on execution mode
 * Provides intelligent default behavior for Neon's serverless model
 */
export function shouldContinueOnFail(executionMode: string): boolean {
	switch (executionMode) {
		case 'independently': return true;  // Continue on fail (log warning, skip failed query)
		case 'transaction': return false;   // Never continue (rollback everything)
		case 'single': return false;        // Never continue (atomic operation)
		default: return false;
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

export function hasJsonDataTypeInSchema(schema: ColumnInfo[]) {
	return schema.some(({ data_type }) => data_type === 'json');
}

export function convertValuesToJson(
	pgp: NeonClient,
	schema: ColumnInfo[],
	values: IDataObject,
) {
	schema
		.filter(
			({ data_type, column_name }) =>
				data_type === 'json' && values[column_name] !== null && values[column_name] !== undefined,
		)
		.forEach(({ column_name }) => {
			values[column_name] = pgp.as.json(values[column_name], true);
		});

	return values;
}

export const convertArraysToPostgresFormat = (
	data: IDataObject,
	schema: ColumnInfo[],
	node: INode,
	itemIndex = 0,
) => {
	for (const columnInfo of schema) {
		//in case column type is array we need to convert it to fornmat that postgres understands
		if (columnInfo.data_type.toUpperCase() === 'ARRAY') {
			let columnValue = data[columnInfo.column_name];

			if (typeof columnValue === 'string') {
				columnValue = jsonParse(columnValue);
			}

			if (Array.isArray(columnValue)) {
				const arrayEntries = columnValue.map((entry) => {
					if (typeof entry === 'number') {
						return entry;
					}

					if (typeof entry === 'boolean') {
						entry = String(entry);
					}

					if (typeof entry === 'object') {
						entry = JSON.stringify(entry);
					}

					if (typeof entry === 'string') {
						return `"${entry.replace(/"/g, '\\"')}"`; //escape double quotes
					}

					return entry;
				});

				//wrap in {} instead of [] as postgres does and join with ,
				data[columnInfo.column_name] = `{${arrayEntries.join(',')}}`;
			} else {
				if (columnInfo.is_nullable === 'NO') {
					throw new NodeOperationError(
						node,
						`Column '${columnInfo.column_name}' has to be an array`,
						{
							itemIndex,
						},
					);
				}
			}
		}
	}
};

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
