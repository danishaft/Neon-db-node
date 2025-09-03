import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { checkItemAgainstSchema, getTableSchema, mergeDisplayOptions, replaceEmptyStringsByNulls } from '../../helpers/utils';
import type { NeonDatabase, NeonNodeOptions, QueryValues, QueryWithValues } from '../../helpers/interface';
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
	optionsCollection
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

	const processedItems = replaceEmptyStringsByNulls(
		items,
		nodeOptions.replaceEmptyStrings || false
	);

	let schema = this.getNodeParameter('schema', 0, undefined, {
		extractValue: true,
	}) as string;

	let table = this.getNodeParameter('table', 0, undefined, {
		extractValue: true
	}) as string;

	// Get actual neon table schema for the table
	let tableSchema = await getTableSchema(db, schema, table);
	const queries: QueryWithValues[] = [];

	for (let i = 0; i < processedItems.length; i++) {
		schema = this.getNodeParameter('schema', i, undefined, {
			extractValue: true,
		}) as string;

		table = this.getNodeParameter('table', i, undefined, {
			extractValue: true,
		}) as string;

		// Get columns configuration from resource mapper
		const columns = this.getNodeParameter('columns', i) as IDataObject;
		const mappingMode = columns.mappingMode as string;
		const columnsValue = columns.value as IDataObject;

		// Extract matching columns and update columns from resource mapper
		let item: IDataObject = {};
		let matchingColumns: string[] = [];

		// Debug logging
		console.log('Columns config:', JSON.stringify(columns, null, 2));
		console.log('Columns value:', JSON.stringify(columnsValue, null, 2));

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

		// Fallback: if no matching columns found, try to use the old valuesToUpdate approach
		if (matchingColumns.length === 0 && mappingMode === 'defineBelow') {
			try {
				const valuesToUpdate = this.getNodeParameter('valuesToUpdate', i, {}) as IDataObject;
				if (valuesToUpdate?.values && Array.isArray(valuesToUpdate.values)) {
					// Convert old format to new format
					item = {};
					valuesToUpdate.values.forEach((val: IDataObject) => {
						if (val.column && val.value !== undefined) {
							item[val.column as string] = val.value;
						}
					});
					// Assume first column is for matching (common pattern)
					const firstColumn = Object.keys(item)[0];
					if (firstColumn) {
						matchingColumns = [firstColumn];
					}
				}
			} catch (error) {
				console.log('Fallback to valuesToUpdate failed:', error.message);
			}
		}

		if (matchingColumns.length === 0 && mappingMode === 'defineBelow') {
			throw new NodeOperationError(
				this.getNode(),
				'No matching columns specified. Please select at least one column to match on.',
				{ itemIndex: i }
			);
		}

		// Validate the item against the schema
		item = checkItemAgainstSchema(this.getNode(), item, tableSchema, i);

		// Build the UPDATE query
		let values:  QueryValues = [schema, table];
		let valuesLength = values.length + 1;

		// Build SET clause for updates (exclude the matching columns)
		const updateColumns = Object.keys(item).filter((column) => !matchingColumns.includes(column));

		if (updateColumns.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'No columns to update specified. Please provide values for at least one column to update.',
				{ itemIndex: i }
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
