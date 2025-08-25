import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { mergeDisplayOptions, replaceEmptyStringsByNulls } from '../../helpers/utils';
import type { NeonDatabase, NeonNodeOptions } from '../../helpers/interface';
import { schemaRLC, tableRLC } from '../commonDescription';

const properties: INodeProperties[] = [
	// Schema and table selection (imported from commonDescription)
	schemaRLC,
	tableRLC,
	// Data to send for insert operations
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
				operation: ['insert'],
			},
		},
		default: {},
		description: 'Map input fields to database columns',
	},
];

const displayOptions = {
	show: {
		resource: ['row'],
		operation: ['insert'],
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
			'Database connection not provided to insert operation'
		);
	}

	try {
		// Get parameters
		const schema = this.getNodeParameter('schema', 0, { extractValue: true }) as string;
		const table = this.getNodeParameter('tableId', 0, { extractValue: true }) as string;
		const dataToSend = this.getNodeParameter('dataToSend', 0) as any;

		if (!schema || !table) {
			throw new NodeOperationError(this.getNode(), 'Schema and table are required for INSERT operations');
		}

		// Get input data
		for (let i = 0; i < items.length; i++) {
			const item = replaceEmptyStringsByNulls([items[i]], nodeOptions.replaceEmptyStrings || false)[0];
			const data = dataToSend.fields ? dataToSend.fields : item.json;

			// Build INSERT query
			const columns = Object.keys(data);
			const values = Object.values(data);
			const placeholders = values.map((_, index) => `$${index + 1}`);

			const query = `INSERT INTO ${schema}.${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;

			// Execute INSERT
			const result = await db.one(query, values);

			returnData.push({
				json: result,
			});
		}

	} catch (error) {
		throw new NodeOperationError(this.getNode(), `INSERT operation failed: ${error.message}`);
	}

	return returnData;
}
