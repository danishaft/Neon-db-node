import type { ILoadOptionsFunctions, ResourceMapperFields } from 'n8n-workflow';

import { withNeonDatabase } from '../transport';
import type { NeonNodeCredentials } from '../helpers/interface';
import { mapPostgresType, getEnumValues } from '../helpers/utils';

export async function getMappingColumns(
	this: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
	const credentials = await this.getCredentials<NeonNodeCredentials>('neonApi');

	const schema = this.getNodeParameter('schema', 0, {
		extractValue: true,
	}) as string;

	const table = this.getNodeParameter('table', 0, {
		extractValue: true,
	}) as string;

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
			numeric_scale,
			is_generated,
			identity_generation
		FROM information_schema.columns
		WHERE table_schema = $1 AND table_name = $2
		ORDER BY ordinal_position
	`,
			[schema, table],
		);

		const fields = await Promise.all(
			columns.map(async (column) => {
				const type = mapPostgresType(column.data_type);
				const enumValues =
					type === 'options' && column.udt_name ? await getEnumValues(db, column.udt_name) : [];
				const options = enumValues.map((value) => ({ name: value, value }));
				const hasDefault = Boolean(column.column_default);
				const isGenerated =
					column.is_generated === 'ALWAYS' ||
					['ALWAYS', 'BY DEFAULT'].includes(column.identity_generation ?? '');
				const nullable = column.is_nullable === 'YES';

				return {
					id: column.column_name,
					displayName: column.column_name,
					required: !nullable && !hasDefault && !isGenerated,
					defaultMatch: column.column_name === 'id',
					display: true,
					type,
					canBeUsedToMatch: true,
					options: options.length > 0 ? options : undefined,
				};
			}),
		);

		return { fields };
	});
}
