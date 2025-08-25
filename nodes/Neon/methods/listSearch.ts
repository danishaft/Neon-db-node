import { ILoadOptionsFunctions, INodeListSearchResult, NodeOperationError } from "n8n-workflow";
import { NeonNodeCredentials } from "../helpers/interface";
import { configureNeon } from "../transport";

export async function getSchemas(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
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
}

export async function getTables(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
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
}
