import type { IDataObject, INodeExecutionData } from 'n8n-workflow';

import type { NeonDatabase, QueryMode, QueryWithValues } from './interface';
import { getErrorMessage } from './errors';

export type QueryExecutionResult =
	| {
			itemIndex: number;
			rows: IDataObject[];
	  }
	| {
			itemIndex: number;
			error: string;
	  };

type Queryable = Pick<NeonDatabase, 'any'>;

async function executeSequentially(
	db: Queryable,
	queries: QueryWithValues[],
): Promise<QueryExecutionResult[]> {
	const results: QueryExecutionResult[] = [];

	for (const [itemIndex, { query, values }] of queries.entries()) {
		const rows = (await db.any(query, values)) as IDataObject[];
		results.push({ itemIndex, rows });
	}

	return results;
}

/**
 * Executes a prepared query batch with one explicit failure contract per mode.
 */
export async function executeQueries(
	db: NeonDatabase,
	queries: QueryWithValues[],
	mode: QueryMode,
): Promise<QueryExecutionResult[]> {
	if (mode === 'transaction') {
		return db.tx((transaction) => executeSequentially(transaction, queries));
	}

	if (mode === 'single') {
		return executeSequentially(db, queries);
	}

	const results: QueryExecutionResult[] = [];
	for (const [itemIndex, { query, values }] of queries.entries()) {
		try {
			const rows = (await db.any(query, values)) as IDataObject[];
			results.push({ itemIndex, rows });
		} catch (error) {
			results.push({ itemIndex, error: getErrorMessage(error) });
		}
	}

	return results;
}

export function toExecutionData(results: QueryExecutionResult[]): INodeExecutionData[] {
	return results.flatMap((result) => {
		if ('error' in result) {
			return [
				{
					json: { error: result.error },
					pairedItem: { item: result.itemIndex },
				},
			];
		}

		return result.rows.map((row) => ({
			json: row,
			pairedItem: { item: result.itemIndex },
		}));
	});
}
