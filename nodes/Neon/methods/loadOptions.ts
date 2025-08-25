import { ILoadOptionsFunctions, INodePropertyOptions, NodeOperationError } from "n8n-workflow";
import { NeonNodeCredentials } from "../helpers/interface";
import { configureNeon } from "../transport";
import { buildColumnDescription, getEnumValues } from "../helpers/utils";

export async function getTableColumns(
	this: ILoadOptionsFunctions
): Promise<INodePropertyOptions[]> {
	const returnData: INodePropertyOptions[] = [];

	try {
		const credentials = await this.getCredentials('neonApi') as NeonNodeCredentials;
		const { db } = await configureNeon(credentials);

		// Get schema and table with extractValue support
		const schema = this.getNodeParameter('schema', 'public', {
			extractValue: true,
		}) as string;

		const tableName = this.getNodeParameter('tableId', '', {
			extractValue: true,
		}) as string;

		if (!schema || !tableName) {
			return returnData;
		}

		// Enhanced column discovery with better metadata
		const columns = await db.any(`
			SELECT
				column_name,
				data_type,
				is_nullable,
				udt_name,
				column_default,
				character_maximum_length,
				numeric_precision,
				numeric_scale
			FROM information_schema.columns
			WHERE table_schema = $1 AND table_name = $2
			ORDER BY ordinal_position
		`, [schema, tableName]);

		// Format the results with better descriptions and enum values
		for (const column of columns) {
			let description = buildColumnDescription(column);

			// Add enum values if it's an enum type
			if (column.data_type === 'USER-DEFINED' && column.udt_name) {
				try {
					const enumValues = await getEnumValues(db, column.udt_name);
					if (enumValues.length > 0) {
						description += `, Values: [${enumValues.join(', ')}]`;
					}
				} catch (error) {
					// Gracefully handle enum discovery errors
					console.warn(`Failed to get enum values for ${column.udt_name}:`, error.message);
				}
			}

			returnData.push({
				name: column.column_name,
				value: column.column_name,
				description: description,
			});
		}

	} catch (error) {
		throw new NodeOperationError(this.getNode(), `Failed to load columns: ${error.message}`);
	}

	return returnData;
}
