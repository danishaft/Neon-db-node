import type { INode } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { addWhereClauses } from '../nodes/Neon/helpers/utils';

const node = {} as INode;

describe('addWhereClauses', () => {
	it('parameterizes identifiers and values', () => {
		const [query, values] = addWhereClauses(
			node,
			0,
			'SELECT * FROM $1:name.$2:name',
			[{ column: 'status', condition: 'equal', value: 'active' }],
			['public', 'users'],
			'AND',
		);

		expect(query).toBe('SELECT * FROM $1:name.$2:name WHERE $3:name = $4');
		expect(values).toEqual(['public', 'users', 'status', 'active']);
	});

	it('rejects operator text outside the supported set', () => {
		expect(() =>
			addWhereClauses(
				node,
				0,
				'SELECT * FROM $1:name.$2:name',
				[
					{
						column: 'id',
						condition: '= 1; DROP TABLE users; --',
						value: '1',
					},
				],
				['public', 'users'],
				'AND',
			),
		).toThrow('Unsupported operator');
	});
});
