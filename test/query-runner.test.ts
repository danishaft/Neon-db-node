import { describe, expect, it, vi } from 'vitest';

import type { NeonDatabase, QueryWithValues } from '../nodes/Neon/helpers/interface';
import { executeQueries } from '../nodes/Neon/helpers/query-runner';

const queries: QueryWithValues[] = [
	{ query: 'SELECT 1', values: [] },
	{ query: 'SELECT 2', values: [] },
	{ query: 'SELECT 3', values: [] },
];

describe('executeQueries', () => {
	it('uses one transaction for the complete query batch', async () => {
		const transaction = {
			any: vi.fn(async (query: string) => [{ query }]),
		};
		const db = {
			any: vi.fn(),
			tx: vi.fn(async (callback: (task: typeof transaction) => unknown) => callback(transaction)),
		} as unknown as NeonDatabase;

		const result = await executeQueries(db, queries, 'transaction');

		expect(db.tx).toHaveBeenCalledOnce();
		expect(db.any).not.toHaveBeenCalled();
		expect(transaction.any).toHaveBeenCalledTimes(3);
		expect(result).toHaveLength(3);
	});

	it('returns an error for a failed independent query and continues', async () => {
		const any = vi
			.fn()
			.mockResolvedValueOnce([{ id: 1 }])
			.mockRejectedValueOnce(new Error('duplicate key'))
			.mockResolvedValueOnce([{ id: 3 }]);
		const db = { any } as unknown as NeonDatabase;

		const result = await executeQueries(db, queries, 'independently');

		expect(any).toHaveBeenCalledTimes(3);
		expect(result).toEqual([
			{ itemIndex: 0, rows: [{ id: 1 }] },
			{ itemIndex: 1, error: 'duplicate key' },
			{ itemIndex: 2, rows: [{ id: 3 }] },
		]);
	});

	it('stops a single-mode batch at the first failed query', async () => {
		const any = vi
			.fn()
			.mockResolvedValueOnce([{ id: 1 }])
			.mockRejectedValueOnce(new Error('query failed'));
		const db = { any } as unknown as NeonDatabase;

		await expect(executeQueries(db, queries, 'single')).rejects.toThrow('query failed');
		expect(any).toHaveBeenCalledTimes(2);
	});
});
