import type { INodeProperties } from 'n8n-workflow';
import { QueryValues } from '../helpers/interface';

export const optionsCollection: INodeProperties = {
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add option',
	default: {},
	options: [
		{
			displayName: 'Delay Closing Idle Connection',
			name: 'delayClosingIdleConnection',
			type: 'number',
			default: 0,
			description: 'Number of seconds to wait before idle connection would be eligible for closing',
		},
		{
			displayName: 'Output Column Names or IDs',
			name: 'outputColumns',
			type: 'multiOptions',
			description: 'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/" target="_blank">expression</a>. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			typeOptions: {
				loadOptionsMethod: 'getTableColumns',
				loadOptionsDependsOn: ['schema', 'table'],
			},
			default: [],
			displayOptions: {
				show: {
					'/operation': ['select'],
				},
			},
		},
		{
			displayName: 'Output Large-Format Number As',
			name: 'outputLargeFormatNumberAs',
			type: 'options',
			noDataExpression: true,
			options: [
				{
					name: 'String',
					value: 'string',
					description: 'Convert large numbers to strings to prevent data loss',
				},
				{
					name: 'Number',
					value: 'number',
					description: 'Keep as numbers (may lose precision for very large values)',
				},
			],
			default: 'string',
			description: 'How to handle PostgreSQL BIGINT/NUMERIC types that exceed JavaScript limits',
		},
		{
			displayName: 'Query Mode',
			name: 'queryMode',
			type: 'options',
			noDataExpression: true,
			options: [
				{
					name: 'Single Query',
					value: 'single',
					description: 'A single query for all incoming items',
				},
				{
					name: 'Independent',
					value: 'independently',
					description: 'Execute one query per incoming item of the run',
				},
				{
					name: 'Transaction',
					value: 'transaction',
					description:
						'Execute all queries in a transaction, if a failure occurs, all changes are rolled back',
				},
			],
			default: 'single',
			description: 'The way queries should be sent to the database',
		},
		{
			displayName: 'Query Parameters',
			name: 'queryParameters',
			type: 'string',
			default: '',
			description:
				'Comma-separated list of the values you want to use as query parameters. <a href="https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/#use-query-parameters" target="_blank">More info</a>.',
			hint: 'Comma-separated list of values: reference them in your query as $1, $2, $3…',
			placeholder: 'e.g. value1,value2,value3',
			displayOptions: {
				show: { '/operation': ['executeQuery'] },
			},
		},
		{
			displayName: 'Replace Empty Strings with NULL',
			name: 'replaceEmptyStrings',
			type: 'boolean',
			default: false,
			description:
				'Whether to replace empty strings with NULL in input, could be useful when data come from spreadsheet',
			displayOptions: {
				show: {
					'/operation': ['insert', 'update', 'executeQuery'],
				},
			},
		},
		{
			displayName: 'Skip on Conflict',
			name: 'skipOnConflict',
			type: 'boolean',
			default: false,
			description:
				'Whether to skip the row and do not throw error if a unique constraint or exclusion constraint is violated',
			displayOptions: {
				show: {
					'/operation': ['insert'],
				},
			},
		},
	],
};

export const schemaRLC: INodeProperties = {
	displayName: 'Schema',
	name: 'schema',
	type: 'resourceLocator',
	default: { mode: 'list', value: 'public' },
	description: 'The schema to use',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'getSchemas',
			}
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			placeholder: 'e.g. public',
		},
	],
	displayOptions: {
		show: {
			'/operation': ['insert', 'select', 'update', 'delete'],
		},
	},
};

export const tableRLC: INodeProperties = {
	displayName: 'Table',
	name: 'table',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	description: 'The table to use',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'getTables',
			}
		},
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			placeholder: 'e.g. users',
		},
	],
	displayOptions: {
		show: {
			'/operation': ['insert', 'select', 'update', 'delete'],
		},
	},
};


export const whereFixedCollection: INodeProperties = {
	displayName: 'Select Rows',
	name: 'where',
	type: 'fixedCollection',
	typeOptions: {
		multipleValues: true,
	},
	placeholder: 'Add Condition',
	default: {},
	description: 'If not set, all rows will be selected',
	options: [
		{
			displayName: 'Values',
			name: 'values',
			values: [
				{
					displayName: 'Column Name or ID',
					name: 'column',
					type: 'options',
					description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/" target="_blank">expression</a>. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					default: '',
					placeholder: 'e.g. ID',
					typeOptions: {
						loadOptionsMethod: 'getTableColumns',
						loadOptionsDependsOn: ['schema', 'table'],
					},
				},
				{
					displayName: 'Operator',
					name: 'condition',
					type: 'options',
					description:
						"The operator to check the column against. When using 'LIKE' operator percent sign ( %) matches zero or more characters, underscore ( _ ) matches any single character.",
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
};

export const sortFixedCollection: INodeProperties = {
	displayName: 'Sort',
	name: 'sort',
	type: 'fixedCollection',
	typeOptions: {
		multipleValues: true,
	},
	placeholder: 'Add Sort Rule',
	default: {},
	options: [
		{
			displayName: 'Values',
			name: 'values',
			values: [
				{
					displayName: 'Column Name or ID',
					name: 'column',
					type: 'options',
					description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/" target="_blank">expression</a>. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					default: '',
					typeOptions: {
						loadOptionsMethod: 'getTableColumns',
						loadOptionsDependsOn: ['schema', 'table'],
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
};

export const combineConditionsCollection: INodeProperties = {
	displayName: 'Combine Conditions',
	name: 'combineConditions',
	type: 'options',
	description:
		'How to combine the conditions defined in "Select Rows": AND requires all conditions to be true, OR requires at least one condition to be true',
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
};

export function addReturning(
	query: string,
	outputColumns: string[],
	replacements: QueryValues,
): [string, QueryValues] {
	if (outputColumns.includes('*')) return [`${query} RETURNING *`, replacements];

	const replacementIndex = replacements.length + 1;

	return [`${query} RETURNING $${replacementIndex}:name`, [...replacements, outputColumns]];
}
