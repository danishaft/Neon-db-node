import type {
	INodeType,
	INodeTypeDescription,
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import { configureNeon } from './transport';
import type { NeonNodeCredentials, NeonNodeOptions } from './helpers/interface';
import { execute as executeQueryOperation } from './actions/operations/executeQuery.operation';
import { execute as selectExecute } from './actions/operations/select.operation';
import { execute as insertExecute } from './actions/operations/insert.operation';
import { execute as updateExecute } from './actions/operations/update.operation';
import { execute as deleteExecute } from './actions/operations/delete.operation';
import { description as databaseResourceDescription } from './actions/operations';
import { getTableColumns, getMappingColumns, getSchemas, getTables } from './methods';
import { neonApiCredentialTest } from './methods/credentialTest';


export class Neon implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Neon',
		name: 'neon',
		icon: 'file:neon.svg',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Connect to Neon database and perform operations',
		defaults: {
			name: 'Neon',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'neonApi',
				required: true,
				testedBy: 'neonApiCredentialTest',
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Row',
						value: 'row',
						description: 'Work with individual rows',
					},
				],
				default: 'row',
			},
			...databaseResourceDescription,
		],
	};

	methods = {
		loadOptions: {
			// Column Discovery (for dropdowns)
			getTableColumns
		},

		listSearch: {
			// Schema Discovery (for resource locator)
			getSchemas,

			// Table Discovery (for resource locator)
			getTables,
		},

		resourceMapping: {
			// Resource Mapping (for advanced field mapping)
			getMappingColumns,
		},

		credentialTest: {
			neonApiCredentialTest
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		// Get credentials
		const credentials = await this.getCredentials('neonApi') as NeonNodeCredentials;

		if (resource === 'row') {
			if (operation === 'executeQuery') {
				// Use separated executeQuery operation
				const items = this.getInputData();
				const nodeOptions: NeonNodeOptions = {
					queryMode: this.getNodeParameter('options.queryMode', 0, 'single') as any,
					queryParameters: this.getNodeParameter('options.queryParameters', 0, '') as string,
					delayClosingIdleConnection: this.getNodeParameter('options.delayClosingIdleConnection', 0, 0) as number,
					outputLargeFormatNumberAs: this.getNodeParameter('options.outputLargeFormatNumberAs', 0, 'string') as 'string' | 'number',
					replaceEmptyStrings: this.getNodeParameter('options.replaceEmptyStrings', 0, false) as boolean,
				};

				// Get database connection
				const { db } = await configureNeon(credentials, nodeOptions);

				// Call the operation with database connection
				const result = await executeQueryOperation.call(this, items, { ...nodeOptions, db });
				returnData.push(...result);
			} else if (operation === 'select') {
					const items = this.getInputData();
					const nodeOptions: NeonNodeOptions = {
						queryMode: this.getNodeParameter('options.queryMode', 0, 'single') as any,
						delayClosingIdleConnection: this.getNodeParameter('options.delayClosingIdleConnection', 0, 0) as number,
						outputLargeFormatNumberAs: this.getNodeParameter('options.outputLargeFormatNumberAs', 0, 'string') as 'string' | 'number',
						outputColumns: this.getNodeParameter('options.outputColumns', 0, []) as string[],
					};

					const { db } = await configureNeon(credentials, nodeOptions);
					const result = await selectExecute.call(this, items, { ...nodeOptions, db } as any);
					returnData.push(...result);
			} else if (operation === 'insert') {
				// Use separated INSERT operation
					const items = this.getInputData();
					const nodeOptions: NeonNodeOptions = {
						queryMode: this.getNodeParameter('options.queryMode', 0, 'single') as any,
						delayClosingIdleConnection: this.getNodeParameter('options.delayClosingIdleConnection', 0, 0) as number,
						outputLargeFormatNumberAs: this.getNodeParameter('options.outputLargeFormatNumberAs', 0, 'string') as 'string' | 'number',
						replaceEmptyStrings: this.getNodeParameter('options.replaceEmptyStrings', 0, false) as boolean,
						skipOnConflict: this.getNodeParameter('options.skipOnConflict', 0, false) as boolean
					};

					const { db, client } = await configureNeon(credentials, nodeOptions);

					const result = await insertExecute.call(this, items, { ...nodeOptions, db, client} as any);
					returnData.push(...result);
			} else if (operation === 'update') {
				// Use separated UPDATE operation
					const items = this.getInputData();
					const nodeOptions = {
						queryMode: this.getNodeParameter('options.queryMode', 0, 'single') as any,
						delayClosingIdleConnection: this.getNodeParameter('options.delayClosingIdleConnection', 0, 0) as number,
						outputLargeFormatNumberAs: this.getNodeParameter('options.outputLargeFormatNumberAs', 0, 'string') as 'string' | 'number',
						replaceEmptyStrings: this.getNodeParameter('options.replaceEmptyStrings', 0, false) as boolean,
					};

					const { db } = await configureNeon(credentials);

					const result = await updateExecute.call(this, items, { ...nodeOptions, db } as any);
					returnData.push(...result);
			} else if (operation === 'delete') {
				// Use separated DELETE operation
				try {
					const { db } = await configureNeon(credentials);
					const items = this.getInputData();
					const nodeOptions = {};
					const result = await deleteExecute.call(this, items, { ...nodeOptions, db } as any);
					returnData.push(...result);
				} catch (error) {
					throw new NodeOperationError(this.getNode(), `DELETE operation failed: ${error.message}`);
				}
			} else {
				// Unknown operation
				returnData.push({
					json: {
						message: `Operation '${operation}' not yet implemented`,
						operation,
						resource,
					},
				});
			}
		}

		return [returnData];
	}
}
