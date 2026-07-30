import { ILoadOptionsFunctions, INodePropertyOptions, NodeOperationError } from 'n8n-workflow';
import { NeonNodeCredentials } from '../helpers/interface';
import { withNeonDatabase } from '../transport';
import { buildColumnDescription, getEnumValues } from '../helpers/utils';
import { getErrorMessage } from '../helpers/errors';

export async function getTableColumns(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const returnData: INodePropertyOptions[] = [];

	try {
		const credentials = (await this.getCredentials('neonApi')) as NeonNodeCredentials;
		const schema = this.getNodeParameter('schema', 'public', {
			extractValue: true,
		}) as string;

		const tableName = this.getNodeParameter('table', '', {
			extractValue: true,
		}) as string;

		if (!schema || !tableName) {
			return returnData;
		}

		return withNeonDatabase(credentials, async (db) => {
			const columns = await db.any(
				`
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
		`,
				[schema, tableName],
			);

			for (const column of columns) {
				let description = buildColumnDescription(column);

				if (column.data_type === 'USER-DEFINED' && column.udt_name) {
					const enumValues = await getEnumValues(db, column.udt_name);
					if (enumValues.length > 0) {
						description += `, Values: [${enumValues.join(', ')}]`;
					}
				}

				returnData.push({
					name: column.column_name,
					value: column.column_name,
					description,
				});
			}
			return returnData;
		});
	} catch (error) {
		throw new NodeOperationError(
			this.getNode(),
			`Failed to load columns: ${getErrorMessage(error)}`,
		);
	}
}
