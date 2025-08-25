import { INodeProperties } from "n8n-workflow";

import { schemaRLC, tableRLC } from '../commonDescription';
import { description as selectDescription } from './select.operation';
import { description as insertDescription } from './insert.operation';
import { description as updateDescription } from './update.operation';
import { description as deleteDescription } from './delete.operation';
import { description as executeQueryDescription } from './executeQuery.operation';

export const description: INodeProperties[] = [
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
				name: 'Insert',
				value: 'insert',
				description: 'Insert a new row in a table',
				action: 'Insert a new row in a table',
			},
			{
				name: 'Select',
				value: 'select',
				description: 'Select rows from a table',
				action: 'Select rows from a table',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update rows in a table',
				action: 'Update rows in a table',
			},
		],
		default: 'select',
	},
	// Schema and table selection (imported from commonDescription)
	schemaRLC,
	tableRLC,
	// Resource mapping is handled by individual operation files
	// WHERE, SORT, and Combine Conditions are now imported from commonDescription
	// Operation-specific properties (imported from separated operations)
	...selectDescription,
	...insertDescription,
	...updateDescription,
	...deleteDescription,
	// ExecuteQuery operation properties (imported from operations)
	...executeQueryDescription,
]
