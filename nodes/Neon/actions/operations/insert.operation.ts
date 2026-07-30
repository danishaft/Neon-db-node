import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	IDataObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	checkItemAgainstSchema,
	convertValuesToObject,
	getTableSchema,
	mergeDisplayOptions,
	replaceEmptyStringsByNulls,
} from '../../helpers/utils';
import type { NeonNodeOptions, QueryValues, QueryWithValues } from '../../helpers/interface';
import { executeQueries, toExecutionData } from '../../helpers/query-runner';
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
		displayOptions: {
			show: {
				resource: ['row'],
				operation: ['insert'],
			},
		},
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
	optionsCollection,
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
): Promise<INodeExecutionData[]> {
	const db = nodeOptions.db;

	if (!db) {
		throw new NodeOperationError(
			this.getNode(),
			'Database connection not provided to insert operation',
		);
	}
	// Replace empty strings with nulls
	const processedItems = replaceEmptyStringsByNulls(
		items,
		nodeOptions.replaceEmptyStrings || false,
	);

	// Get schema and table from node parameters
	const schema = this.getNodeParameter('schema', 0, undefined, {
		extractValue: true,
	}) as string;

	const table = this.getNodeParameter('table', 0, undefined, {
		extractValue: true,
	}) as string;

	// Get actual neon table schema for the table
	const tableSchema = await getTableSchema(db, schema, table);
	const queries: QueryWithValues[] = processedItems.map((_, index) => {
		const mappingMode = this.getNodeParameter('mappingMode', index) as string;

		let onConflict = '';
		if (nodeOptions.skipOnConflict) {
			onConflict = 'ON CONFLICT DO NOTHING';
		}

		let query = `INSERT INTO $1:name.$2:name($3:name) VALUES($3:csv)${onConflict}`;
		const values: QueryValues = [schema, table];

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
		if (Object.keys(item).length === 0) {
			query = 'INSERT INTO $1:name.$2:name DEFAULT VALUES RETURNING *';
		} else {
			query = query + ' RETURNING *';
		}

		return { query, values };
	});

	const results = await executeQueries(db, queries, nodeOptions.queryMode ?? 'single');
	return toExecutionData(results);
}
