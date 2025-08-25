import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { buildSelectColumns, buildWhereClause, buildSortClause, mergeDisplayOptions } from '../../helpers/utils';
import type { NeonDatabase, NeonNodeOptions } from '../../helpers/interface';
import { outputColumns, whereFixedCollection, sortFixedCollection, combineConditionsCollection } from '../commonDescription';

const properties: INodeProperties[] = [
	// Output columns (imported from commonDescription)
	outputColumns,
	// WHERE clause builder (imported from commonDescription)
	whereFixedCollection,
	// SORT clause builder (imported from commonDescription)
	sortFixedCollection,
	// Combine conditions (imported from commonDescription)
	combineConditionsCollection,
];

const displayOptions = {
	show: {
		resource: ['row'],
		operation: ['select'],
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
			'Database connection not provided to select operation'
		);
	}

	try {
		// Get parameters
		const schema = this.getNodeParameter('schema', 0, { extractValue: true }) as string;
		const table = this.getNodeParameter('tableId', 0, { extractValue: true }) as string;
		const outputColumns = this.getNodeParameter('outputColumns', 0) as string[];
		const whereParams = this.getNodeParameter('where', 0) as any;
		const sortParams = this.getNodeParameter('sort', 0) as any;

		if (!schema || !table) {
			throw new NodeOperationError(this.getNode(), 'Schema and table are required for SELECT operations');
		}

		// Build the SELECT query
		const columns = buildSelectColumns(outputColumns);
		const { clause: whereClause, values: whereValues } = buildWhereClause(whereParams, schema, table);
		const sortClause = buildSortClause(sortParams);

		let query = `SELECT ${columns} FROM ${schema}.${table}`;
		if (whereClause) query += ` ${whereClause}`;
		if (sortClause) query += ` ${sortClause}`;

		// Execute the query
		const result = await db.any(query, whereValues);

		// Return the results
		for (const item of result) {
			returnData.push({
				json: item,
			});
		}

	} catch (error) {
		throw new NodeOperationError(this.getNode(), `SELECT operation failed: ${error.message}`);
	}

	return returnData;
}
