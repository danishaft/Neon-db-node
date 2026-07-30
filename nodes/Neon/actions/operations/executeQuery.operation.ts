import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	getResolvables,
	stringToArray,
	isJSON,
	mergeDisplayOptions,
	replaceEmptyStringsByNulls,
} from '../../helpers/utils';
import type { NeonNodeOptions, QueryWithValues } from '../../helpers/interface';
import { executeQueries, toExecutionData } from '../../helpers/query-runner';
import { optionsCollection } from '../common.description';

const properties: INodeProperties[] = [
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		default: '',
		placeholder: 'e.g. SELECT id, name FROM product WHERE quantity > $1 AND price <= $2',
		noDataExpression: true,
		required: true,
		description:
			"The SQL query to execute. You can use n8n expressions and $1, $2, $3, etc to refer to the 'Query Parameters' set in options below.",
		typeOptions: {
			editor: 'sqlEditor',
			sqlDialect: 'PostgreSQL',
		},
		hint: 'Consider using query parameters to prevent SQL injection attacks. Add them in the options below',
	},
	optionsCollection,
];

const displayOptions = {
	show: {
		resource: ['row'],
		operation: ['executeQuery'],
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
			'Database connection not provided to executeQuery operation',
		);
	}

	const queries: QueryWithValues[] = replaceEmptyStringsByNulls(
		items,
		nodeOptions.replaceEmptyStrings || false,
	).map((_, index) => {
		let query = this.getNodeParameter('query', index) as string;

		// Resolve n8n expressions in the query
		for (const resolvable of getResolvables(query)) {
			query = query.replace(resolvable, this.evaluateExpression(resolvable, index) as string);
		}

		let values: Array<IDataObject | string> = [];

		// Get query parameters
		let queryParameter = nodeOptions.queryParameters;

		if (typeof queryParameter === 'number') {
			queryParameter = String(queryParameter);
		}

		if (typeof queryParameter === 'string') {
			// const node = this.getNode();
			// const rawReplacements = (node.parameters.options as IDataObject)?.query as string;
			const rawReplacements = queryParameter;

			if (rawReplacements) {
				const rawValues = rawReplacements.replace(/^=+/, '');
				const resolvables = getResolvables(rawValues);

				if (resolvables.length) {
					// Handle expressions in parameters
					for (const resolvable of resolvables) {
						const evaluatedExpression = this.evaluateExpression(`${resolvable}`, index);
						if (evaluatedExpression !== undefined) {
							const evaluatedValues = isJSON(evaluatedExpression)
								? [evaluatedExpression as IDataObject]
								: stringToArray(String(evaluatedExpression));

							if (evaluatedValues.length) values.push(...evaluatedValues);
						}
					}
				} else {
					// Handle comma-separated values
					values.push(...stringToArray(rawValues));
				}
			}
		} else if (Array.isArray(queryParameter)) {
			values = queryParameter as Array<IDataObject | string>;
		} else {
			throw new NodeOperationError(
				this.getNode(),
				'Query Parameters must be a string of comma-separated values or an array of values',
				{ itemIndex: index },
			);
		}

		// Handle quoted literals (e.g., '$1' becomes $1) - simplified for Neon
		if (!queryParameter) {
			let nextValueIndex = values.length + 1;
			const literals = query.match(/'\$[0-9]+'/g) ?? [];
			for (const literal of literals) {
				query = query.replace(literal, `$${nextValueIndex}`);
				values.push(literal.replace(/'/g, ''));
				nextValueIndex++;
			}
		}

		return { query, values, options: { partial: true } };
	});

	const results = await executeQueries(db, queries, nodeOptions.queryMode ?? 'single');
	return toExecutionData(results);
}
