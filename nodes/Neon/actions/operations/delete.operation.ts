import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { buildWhereClause, mergeDisplayOptions } from '../../helpers/utils';
import type { NeonDatabase, NeonNodeOptions } from '../../helpers/interface';
import { schemaRLC, tableRLC, whereFixedCollection } from '../commonDescription';

const properties: INodeProperties[] = [
	// Schema and table selection (imported from commonDescription)
	schemaRLC,
	tableRLC,
	// WHERE clause builder (imported from commonDescription)
	whereFixedCollection,
];

const displayOptions = {
	show: {
		resource: ['row'],
		operation: ['delete'],
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
			'Database connection not provided to delete operation'
		);
	}

	try {
		// Get parameters
		const schema = this.getNodeParameter('schema', 0, { extractValue: true }) as string;
		const table = this.getNodeParameter('tableId', 0, { extractValue: true }) as string;
		const whereParams = this.getNodeParameter('where', 0) as any;

		if (!schema || !table) {
			throw new NodeOperationError(this.getNode(), 'Schema and table are required for DELETE operations');
		}

		// Build DELETE query
		const { clause: whereClause, values: whereValues } = buildWhereClause(whereParams, schema, table);

		if (!whereClause) {
			throw new NodeOperationError(this.getNode(), 'WHERE clause is required for DELETE operations');
		}

		const query = `DELETE FROM ${schema}.${table} ${whereClause} RETURNING *`;

		// Execute DELETE
		const result = await db.any(query, whereValues);

		for (const row of result) {
			returnData.push({
				json: row,
			});
		}

	} catch (error) {
		throw new NodeOperationError(this.getNode(), `DELETE operation failed: ${error.message}`);
	}

	return returnData;
}
