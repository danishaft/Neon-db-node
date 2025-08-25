import type { ILoadOptionsFunctions, ResourceMapperFields } from 'n8n-workflow';

import { configureNeon } from '../transport';
import type { NeonNodeCredentials } from '../helpers/interface';
import { mapPostgresType, getEnumValues } from '../helpers/utils';

export async function getMappingColumns(
	this: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
	const credentials = await this.getCredentials<NeonNodeCredentials>('neonApi');

	const { db } = await configureNeon(credentials);

	const schema = this.getNodeParameter('schema', 0, {
		extractValue: true,
	}) as string;

	const table = this.getNodeParameter('tableId', 0, {
		extractValue: true,
	}) as string;

	// Operation parameter not needed for resource mapping

	// Get enhanced column schema with all metadata
	const columns = await db.any(`
		SELECT
			column_name,
			data_type,
			is_nullable,
			udt_name,
			column_default,
			character_maximum_length,
			numeric_precision,
			numeric_scale,
			is_generated,
			identity_generation
		FROM information_schema.columns
		WHERE table_schema = $1 AND table_name = $2
		ORDER BY ordinal_position
	`, [schema, table]);

	const fields = columns.map((col) => {
		const canBeUsedToMatch = true; // For now, all columns can be used to match
		const type = mapPostgresType(col.data_type);

		// Get enum options if it's an enum type
		let options;
		if (type === 'options' && col.udt_name) {
			// Use the existing getEnumValues function from utils
			getEnumValues(db, col.udt_name).then(enumValues => {
				if (enumValues.length > 0) {
					options = enumValues.map(value => ({ name: value, value }));
				}
			}).catch(() => {
				// Graceful fallback if enum query fails
				options = undefined;
			});
		}

		const hasDefault = Boolean(col.column_default);
		const isGenerated =
			col.is_generated === 'ALWAYS' ||
			['ALWAYS', 'BY DEFAULT'].includes(col.identity_generation ?? '');
		const nullable = col.is_nullable === 'YES';

		return {
			id: col.column_name,
			displayName: col.column_name,
			required: !nullable && !hasDefault && !isGenerated,
			defaultMatch: (col.column_name === 'id' && canBeUsedToMatch) || false,
			display: true,
			type,
			canBeUsedToMatch,
			options,
		};
	});

	return { fields };
}
