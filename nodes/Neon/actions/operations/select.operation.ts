import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { addSortRules, mergeDisplayOptions, replaceEmptyStringsByNulls, shouldContinueOnFail, addWhereClauses } from '../../helpers/utils';
import type { NeonDatabase, NeonNodeOptions, QueryValues, QueryWithValues, WhereClause } from '../../helpers/interface';
import { whereFixedCollection, sortFixedCollection, combineConditionsCollection, optionsCollection } from '../common.description';

const properties: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['row'],
				operation: ['select'],
			},
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		description: 'Max number of results to return',
		typeOptions: {
			minValue: 1,
		},
		displayOptions: {
			show: {
				returnAll: [false],
			},
		},
	},
	// WHERE clause builder (imported from commonDescription)
	whereFixedCollection,
	// SORT clause builder (imported from commonDescription)
	sortFixedCollection,
	// Combine conditions (imported from commonDescription)
	combineConditionsCollection,
	optionsCollection
];

const displayOptions = {
	show: {
		resource: ['row'],
		operation: ['select'],
	},
	hide: {
		table: [''],
	}
};

export const description = mergeDisplayOptions(displayOptions, properties);

export async function execute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	nodeOptions: NeonNodeOptions,
	_db?: NeonDatabase,
	client?: any,
): Promise<INodeExecutionData[]> {
	const returnData: INodeExecutionData[] = [];
	const db = (nodeOptions as any).db;

	if (!db) {
		throw new NodeOperationError(
			this.getNode(),
			'Database connection not provided to select operation'
		);
	}

	// Replace empty strings with nulls
	const processedItems = replaceEmptyStringsByNulls(
		items,
		nodeOptions.replaceEmptyStrings || false
	);

	// Get schema and table from node parameters
	const schema = this.getNodeParameter('schema', 0, undefined, {
		extractValue: true,
	}) as string;

	const table = this.getNodeParameter('table', 0, undefined, {
		extractValue: true,
	}) as string;

	// Build queries for each item
	const queries: QueryWithValues[] = processedItems.map((_, index) => {
		let query =''
		let values: QueryValues = [schema, table];

		// Get output columns
		const outputColumns = this.getNodeParameter('options.outputColumns', index, ['*']) as string[];

		if (outputColumns.includes('*')) {
			query = 'SELECT * FROM $1:name.$2:name';
		} else {
			values.push(outputColumns);
			query = `SELECT $${values.length}:name FROM $1:name.$2:name`;
		}

		// Add combine conditions clause if specified
		const combineConditions = this.getNodeParameter('combineConditions', index, 'AND') as string;

		const whereClauses =
			((this.getNodeParameter('where', index, []) as IDataObject).values as WhereClause[]) || [];

		[query, values] = addWhereClauses(
			this.getNode(),
			index,
			query,
			whereClauses,
			values,
			combineConditions,
		);

		// Add ORDER BY clause if specified
		const sortParams = this.getNodeParameter('sort', index, {}) as IDataObject;
		if (sortParams?.values && Array.isArray(sortParams.values) && sortParams.values.length > 0) {
			[query, values] = addSortRules(query, sortParams, values);
		}

		// Add LIMIT clause if Return All is false
		const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
		if (!returnAll) {
			const limit = this.getNodeParameter('limit', index, 50) as number;
			query += ` LIMIT ${limit}`;
		}

		return { query, values };
	});

	// Execute all queries
	for (let i = 0; i < queries.length; i++) {
		const { query, values } = queries[i];
		const executionMode = nodeOptions.queryMode || 'single';
		const continueOnFail = shouldContinueOnFail(executionMode);
		let result;

			if (executionMode === 'transaction') {
				// Execute in transaction
				result = await db.tx(async (t: any) => {
					return await t.any(query, values);
				});
			} else if (executionMode === 'independently') {
				// Execute independently with continue on fail option
				try {
					result = await db.any(query, values);
				} catch (error) {
					if (!continueOnFail) {
					throw error;
				}
				// If continue on fail is enabled, log the error but continue
				console.warn(`Query failed but continuing due to continueOnFail: ${error.message}`);
				result = []; // Empty result for failed query
			}
			} else {
				// Single query mode (default)
				result = await db.any(query, values);
			}

			// Add results to return data
			for (const row of result) {
				returnData.push({
					json: row,
				});
			}
	}

	return returnData;
}
