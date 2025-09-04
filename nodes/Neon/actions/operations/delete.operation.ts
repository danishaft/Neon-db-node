import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { addWhereClauses, mergeDisplayOptions} from '../../helpers/utils';
import type { NeonDatabase, NeonNodeOptions, QueryValues, QueryWithValues, WhereClause } from '../../helpers/interface';
import { combineConditionsCollection, optionsCollection, whereFixedCollection } from '../common.description';

const properties: INodeProperties[] = [
	{
		displayName: 'Command',
		name: 'deleteCommand',
		type: 'options',
		default: 'truncate',
		options: [
			{
				name: 'Delete Rows',
				value: 'delete',
				description:
					"Delete the rows that match the 'Select Rows' conditions below. If no selection is made, all rows in the table are deleted.",
			},
			{
				name: 'Truncate Table',
				value: 'truncate',
				description: "Only removes the table's data and preserves the table's structure",
			},
			{
				name: 'Drop Table',
				value: 'drop',
				description: "Deletes the table's data and also the table's structure permanently",
			},
		],
	},
	{
		displayName: 'Restart Sequences',
		name: 'restartSequences',
		type: 'boolean',
		default: false,
		description: 'Whether to reset identity (auto-increment) columns to their initial values',
		displayOptions: {
			show: {
				deleteCommand: ['truncate'],
			},
		},
	},
	{
		...whereFixedCollection,
		displayOptions: {
			show: {
				deleteCommand: ['delete'],
			},
		},
	},
	{
		...combineConditionsCollection,
		displayOptions: {
			show: {
				deleteCommand: ['delete'],
			},
		},
	},
	optionsCollection
];

const displayOptions = {
	show: {
		resource: ['row'],
		operation: ['delete'],
	},
	hide: {
		table: [''],
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

	const queries: QueryWithValues[] = [];

	// Get schema and table from node parameters
	const schema = this.getNodeParameter('schema', 0, undefined, {
		extractValue: true,
	}) as string;

	const table = this.getNodeParameter('table', 0, undefined, {
		extractValue: true,
	}) as string;

	for (let i = 0; i < items.length; i++) {
		const deleteCommand = this.getNodeParameter('deleteCommand', i) as string;

		let query = '';
		let values: QueryValues = [schema, table];

		if (deleteCommand === 'drop') {
			const cascade = nodeOptions.cascade ? ' CASCADE' : '';
			query = `DROP TABLE IF EXISTS $1:name.$2:name${cascade}`;
		}

		if (deleteCommand === 'truncate') {
			const restartSequences = this.getNodeParameter('restartSequences', i, false) as boolean;
			const identity = restartSequences ? ' RESTART IDENTITY' : '';
			const cascade = nodeOptions.cascade ? ' CASCADE' : '';
			query = `TRUNCATE TABLE $1:name.$2:name${identity}${cascade}`;
		}

		if (deleteCommand === 'delete') {
			// Add combine conditions clause if specified
			const combineConditions = this.getNodeParameter('combineConditions', i, 'AND') as string;
			const whereClauses =
			((this.getNodeParameter('where', i, []) as IDataObject).values as WhereClause[]) || [];

			[query, values] = addWhereClauses(
				this.getNode(),
				i,
				'DELETE FROM $1:name.$2:name',
				whereClauses,
				values,
				combineConditions,
			);

			if(query === '') {
				throw new NodeOperationError(
					this.getNode(),
					'Invalid delete command, only drop, delete and truncate are supported',
					{ itemIndex: i }
				);
			}
		}

		if (query === '') {
			throw new NodeOperationError(
				this.getNode(),
				'Invalid delete command, only drop, delete and truncate are supported',
				{ itemIndex: i }
			);
		}

		// Add RETURNING clause for DELETE operations to show what was deleted
		if (deleteCommand === 'delete') {
			query += ' RETURNING *';
		}

		queries.push({ query, values });
	}

	// Execute all queries
	for (let i = 0; i < queries.length; i++) {
		const { query, values } = queries[i];
		const executionMode = nodeOptions.queryMode || 'single';
		const continueOnFail = executionMode === 'independently';
		let result;

			if (executionMode === 'transaction') {
				result = await db.tx(async (t: any) => {
					return await t.any(query, values);
				});
			} else if (executionMode === 'independently') {
				try {
					result = await db.any(query, values);
				} catch (error) {
					if (!continueOnFail) {
						throw error;
					}
					console.warn(`Query failed but continuing due to continueOnFail: ${error.message}`);
					result = []; // Empty result for failed query
				}
			} else {
				result = await db.any(query, values); // Single query mode
			}

			// Add results to return data
			for (const row of result) {
				returnData.push({ json: row });
			}
	}

	return returnData;
}
