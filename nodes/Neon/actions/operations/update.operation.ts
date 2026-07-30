import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	checkItemAgainstSchema,
	getTableSchema,
	mergeDisplayOptions,
	replaceEmptyStringsByNulls,
} from '../../helpers/utils';
import type { NeonNodeOptions, QueryValues, QueryWithValues } from '../../helpers/interface';
import { executeQueries, toExecutionData } from '../../helpers/query-runner';
import { optionsCollection } from '../common.description';

const properties: INodeProperties[] = [
	{
		displayName: 'Columns',
		name: 'columns',
		type: 'resourceMapper',
		noDataExpression: true,
		default: {
			mappingMode: 'defineBelow',
			value: null,
		},
		required: true,
		typeOptions: {
			loadOptionsDependsOn: ['table', 'operation'],
			resourceMapper: {
				resourceMapperMethod: 'getMappingColumns',
				mode: 'update',
				fieldWords: {
					singular: 'column',
					plural: 'columns',
				},
				addAllFields: true,
				multiKeyMatch: true,
			},
		},
	},
	optionsCollection,
];

const displayOptions = {
	show: {
		resource: ['row'],
		operation: ['update'],
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
			'Database connection not provided to update operation',
		);
	}

	const processedItems = replaceEmptyStringsByNulls(
		items,
		nodeOptions.replaceEmptyStrings || false,
	);

	const queries: QueryWithValues[] = [];

	for (let i = 0; i < processedItems.length; i++) {
		const schema = this.getNodeParameter('schema', i, undefined, {
			extractValue: true,
		}) as string;

		const table = this.getNodeParameter('table', i, undefined, {
			extractValue: true,
		}) as string;
		const tableSchema = await getTableSchema(db, schema, table);

		// Get columns configuration from resource mapper
		const columns = this.getNodeParameter('columns', i) as IDataObject;
		const mappingMode = columns.mappingMode as string;
		const columnsValue = columns.value as IDataObject;

		// Extract matching columns and update columns from resource mapper
		let item: IDataObject = {};
		let matchingColumns: string[] = [];

		if (mappingMode === 'autoMapInputData') {
			item = processedItems[i].json;
			// Get matching columns from the resource mapper config
			if (columns.matchingColumns && Array.isArray(columns.matchingColumns)) {
				matchingColumns = columns.matchingColumns as string[];
			}
		} else if (mappingMode === 'defineBelow') {
			item = columnsValue as IDataObject;
			// Get matching columns from the resource mapper config
			if (columns.matchingColumns && Array.isArray(columns.matchingColumns)) {
				matchingColumns = columns.matchingColumns as string[];
			}
		}

		if (matchingColumns.length === 0 && mappingMode === 'defineBelow') {
			throw new NodeOperationError(
				this.getNode(),
				'No matching columns specified. Please select at least one column to match on.',
				{ itemIndex: i },
			);
		}

		// Validate the item against the schema
		item = checkItemAgainstSchema(this.getNode(), item, tableSchema, i);

		// Build the UPDATE query
		const values: QueryValues = [schema, table];
		let valuesLength = values.length + 1;

		// Build SET clause for updates (exclude the matching columns)
		const updateColumns = Object.keys(item).filter((column) => !matchingColumns.includes(column));

		if (updateColumns.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'No columns to update specified. Please provide values for at least one column to update.',
				{ itemIndex: i },
			);
		}

		const updates: string[] = [];
		for (const column of updateColumns) {
			updates.push(`$${valuesLength}:name = $${valuesLength + 1}`);
			valuesLength = valuesLength + 2;
			values.push(column, item[column] as string);
		}

		// Build WHERE clause using the matching columns
		const conditions: string[] = [];
		for (const column of matchingColumns) {
			conditions.push(`$${valuesLength}:name = $${valuesLength + 1}`);
			valuesLength = valuesLength + 2;
			values.push(column, item[column] as string);
		}
		const whereCondition = conditions.join(' AND ');

		// Build the complete UPDATE query
		let query = `UPDATE $1:name.$2:name SET ${updates.join(', ')} WHERE ${whereCondition}`;

		// Add RETURNING clause if output columns are specified
		const outputColumns = this.getNodeParameter('options.outputColumns', i, ['*']) as string[];
		if (outputColumns.includes('*')) {
			query += ' RETURNING *';
		} else if (outputColumns.length > 0) {
			values.push(outputColumns);
			query += ` RETURNING $${values.length}:name`;
		}

		queries.push({ query, values });
	}

	const results = await executeQueries(db, queries, nodeOptions.queryMode ?? 'single');
	return toExecutionData(results);
}
