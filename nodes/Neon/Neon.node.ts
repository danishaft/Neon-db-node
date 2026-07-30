import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { description as databaseResourceDescription } from './actions/operations';
import { execute as deleteRows } from './actions/operations/delete.operation';
import { execute as executeQuery } from './actions/operations/executeQuery.operation';
import { execute as insertRows } from './actions/operations/insert.operation';
import { execute as selectRows } from './actions/operations/select.operation';
import { execute as updateRows } from './actions/operations/update.operation';
import { getErrorMessage } from './helpers/errors';
import type { NeonNodeCredentials, NeonNodeOptions, QueryMode } from './helpers/interface';
import { getMappingColumns, getSchemas, getTableColumns, getTables } from './methods';
import { neonApiCredentialTest } from './methods/credentialTest';
import { configureNeon } from './transport';

type Operation = 'delete' | 'executeQuery' | 'insert' | 'select' | 'update';

type OperationExecutor = (
	this: IExecuteFunctions,
	items: INodeExecutionData[],
	options: NeonNodeOptions,
) => Promise<INodeExecutionData[]>;

const operationExecutors: Record<Operation, OperationExecutor> = {
	delete: deleteRows,
	executeQuery,
	insert: insertRows,
	select: selectRows,
	update: updateRows,
};

function isOperation(value: string): value is Operation {
	return value in operationExecutors;
}

function getNodeOptions(context: IExecuteFunctions): NeonNodeOptions {
	return {
		cascade: context.getNodeParameter('options.cascade', 0, false) as boolean,
		delayClosingIdleConnection: context.getNodeParameter(
			'options.delayClosingIdleConnection',
			0,
			0,
		) as number,
		outputColumns: context.getNodeParameter('options.outputColumns', 0, []) as string[],
		outputLargeFormatNumberAs: context.getNodeParameter(
			'options.outputLargeFormatNumberAs',
			0,
			'string',
		) as 'number' | 'string',
		queryMode: context.getNodeParameter('options.queryMode', 0, 'single') as QueryMode,
		queryParameters: context.getNodeParameter('options.queryParameters', 0, '') as string,
		replaceEmptyStrings: context.getNodeParameter(
			'options.replaceEmptyStrings',
			0,
			false,
		) as boolean,
		skipOnConflict: context.getNodeParameter('options.skipOnConflict', 0, false) as boolean,
	};
}

export class Neon implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Neon',
		name: 'neon',
		icon: {
			light: 'file:neon.svg',
			dark: 'file:neon.dark.svg',
		},
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Query and modify a Neon Postgres database',
		defaults: {
			name: 'Neon',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
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
						description: 'Work with rows in a database table',
					},
				],
				default: 'row',
			},
			...databaseResourceDescription,
		],
	};

	methods = {
		loadOptions: {
			getTableColumns,
		},
		listSearch: {
			getSchemas,
			getTables,
		},
		resourceMapping: {
			getMappingColumns,
		},
		credentialTest: {
			neonApiCredentialTest,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		if (resource !== 'row' || !isOperation(operation)) {
			throw new NodeOperationError(
				this.getNode(),
				`Unsupported Neon operation: ${resource}.${operation}`,
			);
		}

		const credentials = await this.getCredentials<NeonNodeCredentials>('neonApi');
		const options = getNodeOptions(this);
		const connection = await configureNeon(credentials, options);

		try {
			const result = await operationExecutors[operation].call(this, this.getInputData(), {
				...options,
				db: connection.db,
			});
			return [result];
		} catch (error) {
			if (error instanceof NodeOperationError) {
				throw new NodeOperationError(this.getNode(), error);
			}

			throw new NodeOperationError(this.getNode(), getErrorMessage(error));
		} finally {
			await connection.close();
		}
	}
}
