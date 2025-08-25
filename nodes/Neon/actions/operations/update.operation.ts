import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { buildWhereClause, mergeDisplayOptions, replaceEmptyStringsByNulls } from '../../helpers/utils';
import type { NeonDatabase, NeonNodeOptions } from '../../helpers/interface';
import { schemaRLC, tableRLC, whereFixedCollection } from '../commonDescription';

const properties: INodeProperties[] = [
	// Schema and table selection (imported from commonDescription)
	schemaRLC,
	tableRLC,
	// Data to send for update operations
	{
		displayName: 'Data to Send',
		name: 'dataToSend',
		type: 'resourceMapper',
		typeOptions: {
			resourceMapperField: 'getMappingColumns',
			resourceMapperMode: 'mappingMode',
			addAllFields: true,
			multipleValues: false,
		},
		displayOptions: {
			show: {
				resource: ['row'],
				operation: ['update'],
			},
		},
		default: {},
		description: 'Map input fields to database columns',
	},
	// WHERE clause builder (imported from commonDescription)
	whereFixedCollection,
];

const displayOptions = {
	show: {
		resource: ['row'],
		operation: ['update'],
	},
};

export const description = mergeDisplayOptions(displayOptions, properties);

export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	nodeOptions: NeonNodeOptions,
	_db?: NeonDatabase,
): Promise<INodeExecutionData[]> {
	const returnData: INodeExecutionData[] = [];
	const db = (nodeOptions as any).db;

	if (!db) {
		throw new NodeOperationError(
			this.getNode(),
			'Database connection not provided to update operation'
		);
	}

	try {
		// Get parameters
		const schema = this.getNodeParameter('schema', 0, { extractValue: true }) as string;
		const table = this.getNodeParameter('tableId', 0, { extractValue: true }) as string;
		const dataToSend = this.getNodeParameter('dataToSend', 0) as any;
		const whereParams = this.getNodeParameter('where', 0) as any;

		if (!schema || !table) {
			throw new NodeOperationError(this.getNode(), 'Schema and table are required for UPDATE operations');
		}

		// Get input data
		for (let i = 0; i < items.length; i++) {
			const item = replaceEmptyStringsByNulls([items[i]], nodeOptions.replaceEmptyStrings || false)[0];
			const data = dataToSend.fields ? dataToSend.fields : item.json;

			// Build UPDATE query
			const setClause = Object.keys(data).map((key, index) => `${key} = $${index + 1}`).join(', ');
			const { clause: whereClause, values: whereValues } = buildWhereClause(whereParams, schema, table);

			if (!whereClause) {
				throw new NodeOperationError(this.getNode(), 'WHERE clause is required for UPDATE operations');
			}

			const values = [...Object.values(data), ...whereValues];
			const query = `UPDATE ${schema}.${table} SET ${setClause} ${whereClause} RETURNING *`;

			// Execute UPDATE
			const result = await db.any(query, values);

			for (const row of result) {
				returnData.push({
					json: row,
				});
			}
		}

	} catch (error) {
		throw new NodeOperationError(this.getNode(), `UPDATE operation failed: ${error.message}`);
	}

	return returnData;
}
