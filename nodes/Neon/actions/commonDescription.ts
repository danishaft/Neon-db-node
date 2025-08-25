import type { INodeProperties } from 'n8n-workflow';

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
			name: 'queryReplacement',
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

	],
};

