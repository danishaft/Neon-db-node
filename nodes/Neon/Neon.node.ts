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
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

import { validateNeonCredentials, configureNeon } from './helpers/connection';
import { buildColumnDescription, mapPostgresType, getEnumValues, buildSelectColumns, buildSortClause, buildWhereClause } from './helpers/utils';
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
		loadOptions: {
			// Column Discovery (for dropdowns)
			async getTableColumns(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const returnData: INodePropertyOptions[] = [];

				try {
					const credentials = await this.getCredentials('neonApi') as NeonNodeCredentials;
					const { db } = await configureNeon(credentials);

					// Get schema and table with extractValue support
					const schema = this.getNodeParameter('schema', 'public', {
						extractValue: true,
					}) as string;

					const tableName = this.getNodeParameter('tableId', '', {
						extractValue: true,
					}) as string;

					if (!schema || !tableName) {
						return returnData;
					}

					// Enhanced column discovery with better metadata
					const columns = await db.any(`
						SELECT
							column_name,
							data_type,
							is_nullable,
							udt_name,
							column_default,
							character_maximum_length,
							numeric_precision,
							numeric_scale
						FROM information_schema.columns
						WHERE table_schema = $1 AND table_name = $2
						ORDER BY ordinal_position
					`, [schema, tableName]);

					// Format the results with better descriptions and enum values
					for (const column of columns) {
						let description = buildColumnDescription(column);

						// Add enum values if it's an enum type
						if (column.data_type === 'USER-DEFINED' && column.udt_name) {
							try {
								const enumValues = await getEnumValues(db, column.udt_name);
								if (enumValues.length > 0) {
									description += `, Values: [${enumValues.join(', ')}]`;
								}
							} catch (error) {
								// Gracefully handle enum discovery errors
								console.warn(`Failed to get enum values for ${column.udt_name}:`, error.message);
							}
						}

						returnData.push({
							name: column.column_name,
							value: column.column_name,
							description: description,
						});
					}

				} catch (error) {
					throw new NodeOperationError(this.getNode(), `Failed to load columns: ${error.message}`);
				}

				return returnData;
			},
		},

		listSearch: {
			// Schema Discovery (for resource locator)
			async getSchemas(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
				try {
					const credentials = await this.getCredentials('neonApi') as NeonNodeCredentials;
					const { db } = await configureNeon(credentials);

					// Get all user schemas, filter out system schemas
					const schemas = await db.any(`
						SELECT schema_name
						FROM information_schema.schemata
						WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
						ORDER BY schema_name
					`);

					return {
						results: schemas.map((schema) => ({
							name: schema.schema_name,
							value: schema.schema_name,
						})),
					};

				} catch (error) {
					throw new NodeOperationError(this.getNode(), `Failed to load schemas: ${error.message}`);
				}
			},

			// Table Discovery (for resource locator)
			async getTables(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
				try {
					const credentials = await this.getCredentials('neonApi') as NeonNodeCredentials;
					const { db } = await configureNeon(credentials);

					// Get schema with extractValue support
					const schema = this.getNodeParameter('schema', 'public', {
						extractValue: true,
					}) as string;

					if (!schema) {
						return { results: [] };
					}

					// Get tables with better context
					const tables = await db.any(`
						SELECT
							table_name,
							table_type
						FROM information_schema.tables
						WHERE table_schema = $1
						ORDER BY table_name
					`, [schema]);

					return {
						results: tables.map((table) => ({
							name: table.table_name,
							value: table.table_name,
						})),
					};

				} catch (error) {
					throw new NodeOperationError(this.getNode(), `Failed to load tables: ${error.message}`);
				}
			},
		},

		resourceMapping: {
			// Resource Mapping (for advanced field mapping)
			async getMappingColumns(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				try {
					const credentials = await this.getCredentials('neonApi') as NeonNodeCredentials;
					const { db } = await configureNeon(credentials);

					const schema = this.getNodeParameter('schema', 'public', {
						extractValue: true,
					}) as string;

					const tableName = this.getNodeParameter('tableId', '', {
						extractValue: true,
					}) as string;

					if (!schema || !tableName) {
						return { fields: [] };
					}

					// Get enhanced column schema for resource mapping
					const columns = await db.any(`
						SELECT
							column_name,
							data_type,
							is_nullable,
							udt_name,
							column_default
						FROM information_schema.columns
						WHERE table_schema = $1 AND table_name = $2
						ORDER BY ordinal_position
					`, [schema, tableName]);

					// Convert to n8n resource mapper format
					const fields = columns.map((column) => ({
						id: column.column_name,
						name: column.column_name,
						type: mapPostgresType(column.data_type),
						required: column.is_nullable === 'NO',
						default: column.column_default || undefined,
						displayName: column.column_name,
						description: `Type: ${column.data_type}, Nullable: ${column.is_nullable}`,
						defaultMatch: false,
						display: true,
					}));

					return { fields };

				} catch (error) {
					throw new NodeOperationError(this.getNode(), `Failed to load mapping columns: ${error.message}`);
				}
			},
		},

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

		async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
			const returnData: INodeExecutionData[] = [];
			const resource = this.getNodeParameter('resource', 0) as string;
			const operation = this.getNodeParameter('operation', 0) as string;

			// Get credentials
			const credentials = await this.getCredentials('neonApi') as NeonNodeCredentials;

			if (resource === 'row') {
				if (operation === 'executeQuery') {
					// Handle custom SQL query execution
					const query = this.getNodeParameter('query', 0) as string;

					try {
						// Execute query using configureNeon
						const { db } = await configureNeon(credentials);
						const result = await db.any(query);

						// Return the results
						for (const item of result) {
							returnData.push({
								json: item,
							});
						}

					} catch (error) {
						throw new NodeOperationError(this.getNode(), `Query execution failed: ${error.message}`);
					}
				} else if (operation === 'get' || operation === 'getAll') {
					// Handle SELECT operations
					try {
						const { db } = await configureNeon(credentials);

						// Get parameters with extractValue support
						const schema = this.getNodeParameter('schema', 0, { extractValue: true }) as string;
						const table = this.getNodeParameter('tableId', 0, { extractValue: true }) as string;
						const outputColumns = this.getNodeParameter('outputColumns', 0) as string[];
						const whereParams = this.getNodeParameter('where', 0) as any;
						const sortParams = this.getNodeParameter('sort', 0) as any;
						const limit = operation === 'get' ? 1 : undefined;

						if (!schema || !table) {
							throw new NodeOperationError(this.getNode(), 'Schema and table are required for SELECT operations');
						}

						// Build the SELECT query
						const columns = buildSelectColumns(outputColumns);
						const { clause: whereClause, values: whereValues } = buildWhereClause(whereParams, schema, table);
						const sortClause = buildSortClause(sortParams);

						let query = `SELECT ${columns} FROM ${schema}.${table}`;
						if (whereClause) query += ` ${whereClause}`;
						if (sortClause) query += ` ${sortClause}`;
						if (limit) query += ` LIMIT ${limit}`;

						// Execute the query
						const result = await db.any(query, whereValues);

						// Return the results
						for (const item of result) {
							returnData.push({
								json: item,
							});
						}

					} catch (error) {
						throw new NodeOperationError(this.getNode(), `SELECT operation failed: ${error.message}`);
					}
				} else if (operation === 'create') {
					// Handle INSERT operations
					try {
						const { db } = await configureNeon(credentials);

						// Get parameters
						const schema = this.getNodeParameter('schema', 0, { extractValue: true }) as string;
						const table = this.getNodeParameter('tableId', 0, { extractValue: true }) as string;
						const dataToSend = this.getNodeParameter('dataToSend', 0) as any;

						if (!schema || !table) {
							throw new NodeOperationError(this.getNode(), 'Schema and table are required for INSERT operations');
						}

						// Get input data
						const items = this.getInputData();

						for (let i = 0; i < items.length; i++) {
							const item = items[i];
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
				} else if (operation === 'update') {
					// Handle UPDATE operations
					try {
						const { db } = await configureNeon(credentials);

						// Get parameters
						const schema = this.getNodeParameter('schema', 0, { extractValue: true }) as string;
						const table = this.getNodeParameter('tableId', 0, { extractValue: true }) as string;
						const dataToSend = this.getNodeParameter('dataToSend', 0) as any;
						const whereParams = this.getNodeParameter('where', 0) as any;

						if (!schema || !table) {
							throw new NodeOperationError(this.getNode(), 'Schema and table are required for UPDATE operations');
						}

						// Get input data
						const items = this.getInputData();

						for (let i = 0; i < items.length; i++) {
							const item = items[i];
							const data = dataToSend.fields ? dataToSend.fields : item.json;

							// Build UPDATE query
							const setClause = Object.keys(data).map((key, index) => `${key} = $${index + 1}`).join(', ');
							const { clause: whereClause, values: whereValues } = buildWhereClause(whereParams, schema, table);

							if (!whereClause) {
								throw new NodeOperationError(this.getNode(), 'WHERE clause is required for UPDATE operations');
							}

							const values = [...Object.values(data), ...whereValues];
							const query = `UPDATE ${schema}.${table} SET ${setClause} ${whereClause} RETURNING *`;

							// Execute UPDATE
							const result = await db.any(query, values);

							for (const row of result) {
								returnData.push({
									json: row,
								});
							}
						}

					} catch (error) {
						throw new NodeOperationError(this.getNode(), `UPDATE operation failed: ${error.message}`);
					}
				} else if (operation === 'delete') {
					// Handle DELETE operations
					try {
						const { db } = await configureNeon(credentials);

						// Get parameters
						const schema = this.getNodeParameter('schema', 0, { extractValue: true }) as string;
						const table = this.getNodeParameter('tableId', 0, { extractValue: true }) as string;
						const whereParams = this.getNodeParameter('where', 0) as any;

						if (!schema || !table) {
							throw new NodeOperationError(this.getNode(), 'Schema and table are required for DELETE operations');
						}

						// Build DELETE query
						const { clause: whereClause, values: whereValues } = buildWhereClause(whereParams, schema, table);

						if (!whereClause) {
							throw new NodeOperationError(this.getNode(), 'WHERE clause is required for DELETE operations');
						}

						const query = `DELETE FROM ${schema}.${table} ${whereClause} RETURNING *`;

						// Execute DELETE
						const result = await db.any(query, whereValues);

						for (const row of result) {
							returnData.push({
								json: row,
							});
						}

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
	};

}
