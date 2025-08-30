import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	IDataObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { checkItemAgainstSchema, convertValuesToObject, getTableSchema, mergeDisplayOptions, replaceEmptyStringsByNulls, shouldContinueOnFail } from '../../helpers/utils';
import type { NeonClient, NeonDatabase, NeonNodeOptions, QueryValues, QueryWithValues } from '../../helpers/interface';
import { optionsCollection } from '../common.description';


const properties: INodeProperties[] = [
	// Data to send for insert operations
	{
		displayName: 'Map Column Mode',
		name: 'mappingMode',
		type: 'options',
		options: [
			{
				name: 'Auto-Map Input Data to Columns',
				value: 'autoMapInputData',
				description: 'Use when node input properties names exactly match the neon column names',
			},
			{
				name: 'Map Each Column Manually',
				value: 'defineBelow',
				description: 'Set the value for each destination column manually',
			},
		],
		default: 'autoMapInputData',
		description:
			'Whether to map node input properties and the table data automatically or manually',
	},
	{
		displayName: 'Values to Send',
		name: 'valuesToSend',
		placeholder: 'Add Value',
		type: 'fixedCollection',
		typeOptions: {
			multipleValueButtonText: 'Add Value',
			multipleValues: true,
		},
		displayOptions: {
			show: {
				mappingMode: ['defineBelow'],
			},
		},
		default: {},
		options: [
			{
				displayName: 'Values',
				name: 'values',
				values: [
					{
						// eslint-disable-next-line n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options
						displayName: 'Column',
						name: 'column',
						type: 'options',
						// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-options
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/" target="_blank">expression</a>',
						typeOptions: {
							loadOptionsMethod: 'getTableColumns',
							loadOptionsDependsOn: ['schema', 'table'],
						},
						default: '',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
					},
				],
			},
		],
	},
	optionsCollection
];

const displayOptions = {
		show: {
			resource: ['row'],
			operation: ['insert'],
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
	client?: NeonClient,
): Promise<INodeExecutionData[]> {
	const returnData: INodeExecutionData[] = [];
	const db =  (nodeOptions as any).db;

	if (!db) {
		throw new NodeOperationError(
			this.getNode(),
			'Database connection not provided to insert operation'
		);
	}
	// Replace empty strings with nulls
	const processedItems = replaceEmptyStringsByNulls(
		items,
		nodeOptions.replaceEmptyStrings || false
	);

	// Get schema and table from node parameters
	let schema = this.getNodeParameter('schema', 0, undefined, {
		extractValue: true,
	}) as string;

	let table = this.getNodeParameter('table', 0, undefined, {
		extractValue: true,
	}) as string;

	// Get actual neon table schema for the table
	let tableSchema = await getTableSchema(db, schema, table);
	const queries: QueryWithValues[] = processedItems.map((_, index) => {
		const mappingMode = this.getNodeParameter('mappingMode', index) as string;

		let onConflict = '';
		if (nodeOptions.skipOnConflict) {
			onConflict = 'ON CONFLICT DO NOTHING';
		}

		let query = `INSERT INTO $1:name.$2:name($3:name) VALUES($3:csv)${onConflict}`;
		let values: QueryValues = [schema, table];

		let item: IDataObject = {};
		if (mappingMode === 'autoMapInputData') {
			item = processedItems[index].json;
		}

		if (mappingMode === 'defineBelow') {
			const valuesToSend = this.getNodeParameter('valuesToSend', index, {}) as IDataObject;
			if (valuesToSend?.values && Array.isArray(valuesToSend.values)) {
				// Use the existing cleanValues utility function
				item = convertValuesToObject(valuesToSend.values as IDataObject[]);
			}
		}

		values.push(checkItemAgainstSchema(this.getNode(), item, tableSchema, index));

		// For INSERT operations, just add RETURNING * directly
		if(Object.keys(item).length === 0) {
			query = 'INSERT INTO $1:name.$2:name DEFAULT VALUES RETURNING *';
		} else {
			query = query + ' RETURNING *';
		}

		return { query, values };
	})


	// Execute all queries (like Postgres node)
	for (let i = 0; i < queries.length; i++) {
		const { query, values } = queries[i];
		const executionMode = nodeOptions.queryMode || 'single';
		const continueOnFail = shouldContinueOnFail(executionMode);
		let result;
		if(executionMode === 'transaction') {
			// Execute in transaction
			result = await db.tx(async (t: any) => {
				return await t.any(query, values);
			})
		}else if (executionMode === 'independently') {
			// Execute independently with continue on fail option
			try{
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
