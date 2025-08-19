import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	ILoadOptionsFunctions,
	INodeCredentialTestResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	INodeListSearchResult,
	ResourceMapperFields,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

import { validateNeonCredentials, configureNeon } from './helpers/connection';
import { buildColumnDescription, mapPostgresType, getEnumValues } from './helpers/utils';
import type { NeonNodeCredentials } from './helpers/interface';

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
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['row'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create a new row in a table',
						action: 'Create a new row in a table',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete rows from a table',
						action: 'Delete rows from a table',
					},
					{
						name: 'Execute Query',
						value: 'executeQuery',
						description: 'Execute a custom SQL query',
						action: 'Execute a custom SQL query',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get rows from a table',
						action: 'Get rows from a table',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Get many rows from a table',
						action: 'Get many rows from a table',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Update rows in a table',
						action: 'Update rows in a table',
					},
				],
				default: 'get',
			},
			// Schema selection (NEW)
			{
				displayName: 'Schema',
				name: 'schema',
				type: 'resourceLocator',
				default: { mode: 'list', value: 'public' },
				required: true,
				placeholder: 'e.g. public',
				description: 'The schema that contains the table you want to work on. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'getSchemas',
						},
					},
					{
						displayName: 'By Name',
						name: 'name',
						type: 'string',
					},
				],
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['create', 'delete', 'get', 'getAll', 'update'],
					},
				},
			},
			// Table selection (UPDATED - now depends on schema)
			{
				displayName: 'Table Name or ID',
				name: 'tableId',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				description: 'The table you want to work on. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'getTables',
						},
					},
					{
						displayName: 'By Name',
						name: 'name',
						type: 'string',
					},
				],
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['create', 'delete', 'get', 'getAll', 'update'],
					},
				},
			},
			// Output Columns (NEW - for SELECT operations)
			{
				displayName: 'Output Column Names or IDs',
				name: 'outputColumns',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getTableColumns',
					loadOptionsDependsOn: ['schema.value', 'tableId.value'],
				},
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['get', 'getAll'],
					},
				},
				default: [],
				description: 'Choose which columns to return (leave empty for all columns). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			// Resource Mapping (for advanced field mapping)
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
						operation: ['create', 'update'],
					},
				},
				default: {},
				description: 'Map input fields to database columns',
			},
			// WHERE Clause Building (NEW - for filtering operations)
			{
				displayName: 'Filter Rows',
				name: 'where',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				placeholder: 'Add Condition',
				default: {},
				description: 'If not set, all rows will be selected/updated/deleted',
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['get', 'getAll', 'update', 'delete'],
					},
				},
				options: [
					{
						displayName: 'Values',
						name: 'values',
						values: [
							{
								displayName: 'Column Name or ID',
								name: 'column',
								type: 'options',
								description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
								default: '',
								placeholder: 'e.g. ID',
								typeOptions: {
									loadOptionsMethod: 'getTableColumns',
									loadOptionsDependsOn: ['schema.value', 'tableId.value'],
								},
							},
							{
								displayName: 'Operator',
								name: 'condition',
								type: 'options',
								description: 'The operator to check the column against. When using \'LIKE\' operator percent sign (%) matches zero or more characters, underscore (_) matches any single character.',
								options: [
									{
										name: 'Equal',
										value: 'equal',
									},
									{
										name: 'Greater Than',
										value: '>',
									},
									{
										name: 'Greater Than Or Equal',
										value: '>=',
									},
									{
										name: 'Is Not Null',
										value: 'IS NOT NULL',
									},
									{
										name: 'Is Null',
										value: 'IS NULL',
									},
									{
										name: 'Less Than',
										value: '<',
									},
									{
										name: 'Less Than Or Equal',
										value: '<=',
									},
									{
										name: 'Like',
										value: 'LIKE',
									},
									{
										name: 'Not Equal',
										value: '!=',
									},
								],
								default: 'equal',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								displayOptions: {
									hide: {
										condition: ['IS NULL', 'IS NOT NULL'],
									},
								},
								default: '',
							},
						],
					},
				],
			},
			// Combine Conditions (NEW - for WHERE clause logic)
			{
				displayName: 'Combine Conditions',
				name: 'combineConditions',
				type: 'options',
				description: 'How to combine the conditions defined in "Filter Rows": AND requires all conditions to be true, OR requires at least one condition to be true',
				options: [
					{
						name: 'AND',
						value: 'AND',
						description: 'Only rows that meet all the conditions are selected',
					},
					{
						name: 'OR',
						value: 'OR',
						description: 'Rows that meet at least one condition are selected',
					},
				],
				default: 'AND',
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['get', 'getAll', 'update', 'delete'],
					},
				},
			},
			// SORT Clause Building (NEW - for ordering results)
			{
				displayName: 'Sort',
				name: 'sort',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				placeholder: 'Add Sort Rule',
				default: {},
				description: 'How to order the results',
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['get', 'getAll'],
					},
				},
				options: [
					{
						displayName: 'Values',
						name: 'values',
						values: [
							{
								displayName: 'Column Name or ID',
								name: 'column',
								type: 'options',
								description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
								default: '',
								placeholder: 'e.g. created_at',
								typeOptions: {
									loadOptionsMethod: 'getTableColumns',
									loadOptionsDependsOn: ['schema.value', 'tableId.value'],
								},
							},
							{
								displayName: 'Direction',
								name: 'direction',
								type: 'options',
								options: [
									{
										name: 'ASC',
										value: 'ASC',
									},
									{
										name: 'DESC',
										value: 'DESC',
									},
								],
								default: 'ASC',
							},
						],
					},
				],
			},
			// Custom query for executeQuery operation
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['executeQuery'],
					},
				},
				placeholder: 'SELECT * FROM users WHERE active = true',
				description: 'The SQL query to execute',
				default: '',
			},
			// Data to send for create/update operations (LEGACY - keeping for backward compatibility)
			{
				displayName: 'Data to Send (Legacy)',
				name: 'dataToSendLegacy',
				type: 'options',
				options: [
					{
						name: 'Auto-Map Input Data',
						value: 'autoMapInputData',
						description: 'Automatically map input data to columns',
					},
					{
						name: 'Define Below',
						value: 'defineBelow',
						description: 'Manually define the data to send',
					},
				],
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['create', 'update'],
					},
				},
				default: 'autoMapInputData',
			},
			// Fields UI for manual data definition
			{
				displayName: 'Fields',
				name: 'fieldsUi',
				placeholder: 'Add Field',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['create', 'update'],
						dataToSend: ['defineBelow'],
					},
				},
				default: {},
				options: [
					{
						name: 'fieldValues',
						displayName: 'Field',
						values: [
							{
								displayName: 'Column Name or ID',
								name: 'columnName',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getTableColumns',
									loadOptionsDependsOn: ['tableId'],
								},
								description: 'Choose from the list, or specify an ID using an expression. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
								placeholder: 'Select a column',
								default: '',
							},
							{
								displayName: 'Value',
								name: 'fieldValue',
								type: 'string',
								description: 'Value to set in the column',
								default: '',
							},
						],
					},
				],
			},
		],
	};

	methods = {
		credentialTest: {
			async neonApiCredentialTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
								try {
					// Convert credential data to our interface format
					if (!credential.data) {
						return {
							status: 'Error',
							message: 'Credential data is missing',
						};
					}

					const credentials: NeonNodeCredentials = {
						host: credential.data.host as string,
						port: credential.data.port as number,
						database: credential.data.database as string,
						user: credential.data.user as string,
						password: credential.data.password as string,
						ssl: credential.data.ssl as 'require' | 'allow',
					};

					// Test the connection using our helper function
					const result = await validateNeonCredentials(credentials);

					if (result.success) {
						return {
							status: 'OK',
							message: result.message,
						};
					} else {
						return {
							status: 'Error',
							message: result.message,
						};
					}
				} catch (error) {
					return {
						status: 'Error',
						message: `Connection test failed: ${error.message}`,
					};
				}
			},
		},
	};

}
