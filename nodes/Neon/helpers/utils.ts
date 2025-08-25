import type { FieldType, IDisplayOptions, INodeProperties } from 'n8n-workflow';
import type { ColumnInfo } from './interface';
import { neonFieldTypeMapping } from './interface';
import { merge } from 'lodash';
import type { INodeExecutionData } from 'n8n-workflow';

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

