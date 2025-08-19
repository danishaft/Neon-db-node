import type { IDataObject, INodeExecutionData } from 'n8n-workflow';
import type pgPromise from 'pg-promise';
import { type IFormattingOptions } from 'pg-promise';
import type pg from 'pg-promise/typescript/pg-subset';

// ============================================================================
// QUERY EXECUTION TYPES
// ============================================================================

/**
 * How multiple queries should be executed
 * - 'single': Execute one query at a time
 * - 'transaction': Execute all queries in a single transaction (rollback on error)
 * - 'independently': Execute each query separately (continue on individual errors)
 */
export type QueryMode = 'single' | 'transaction' | 'independently';

/**
 * Valid values that can be used in SQL queries
 * Supports strings, numbers, objects (for JSON columns), and arrays
 */
export type QueryValue = string | number | IDataObject | string[];
export type QueryValues = QueryValue[];

/**
 * A SQL query with optional parameter values and formatting options
 * Used for executing parameterized queries safely
 */
export type QueryWithValues = {
	query: string;
	values?: QueryValues;
	options?: IFormattingOptions
};

// ============================================================================
// QUERY BUILDING TYPES
// ============================================================================

/**
 * Used to build WHERE clauses dynamically
 * Example: { column: 'name', condition: '=', value: 'John' } → WHERE name = 'John'
 */
export type WhereClause = {
	column: string;
	condition: string;
	value: string | number
};

/**
 * Used to build ORDER BY clauses dynamically
 * Example: { column: 'created_at', direction: 'DESC' } → ORDER BY created_at DESC
 */
export type SortRule = {
	column: string;
	direction: string
};

// ============================================================================
// DATABASE SCHEMA TYPES
// ============================================================================

/**
 * Information about a database column
 * Used for schema introspection and dynamic UI generation
 * Enhanced with additional metadata for better resource mapping
 */
export type ColumnInfo = {
    column_name: string;        // Name of the column
    data_type: string;          // Neon database data type (e.g., 'text', 'integer')
    is_nullable: string;        // Whether column can be NULL ('YES' or 'NO')
    udt_name?: string;          // User-defined type name if applicable
    column_default?: string | null;  // Default value for the column
    is_generated?: 'ALWAYS' | 'NEVER';  // If column is auto-generated
    identity_generation?: 'ALWAYS' | 'NEVER';  // If column uses identity
    character_maximum_length?: number;  // Length for character types
    numeric_precision?: number;         // Precision for numeric types
    numeric_scale?: number;             // Scale for numeric types
};

/**
 * Information about Neon database enum types
 * Used for handling enum columns in the UI
 */
export type EnumInfo = {
	typname: string;     // Name of the enum type
	enumlabel: string;   // One of the possible enum values
};

// ============================================================================
// FIELD TYPE MAPPING TYPES
// ============================================================================

/**
 * Maps PostgreSQL data types to n8n field types
 * Used for resource mapping and better data type handling
 */
export type FieldTypeMapping = {
    string: string[];
    number: string[];
    boolean: string[];
    dateTime: string[];
    object: string[];
    options: string[];
    array: string[];
    binary: string[];
};

/**
 * Neon-specific field type mapping
 * Focused on PostgreSQL 15+ types that Neon supports
 */
export const neonFieldTypeMapping: FieldTypeMapping = {
    string: [
        'text', 'varchar', 'character varying', 'character', 'char',
        'uuid', 'citext', 'name'
    ],
    number: [
        'integer', 'smallint', 'bigint', 'int', 'int2', 'int4', 'int8',
        'decimal', 'numeric', 'real', 'double precision',
        'smallserial', 'serial', 'bigserial', 'money'
    ],
    boolean: ['boolean', 'bool'],
    dateTime: [
        'timestamp', 'timestamp without time zone',
        'timestamp with time zone', 'timestamptz',
        'date', 'time', 'time without time zone', 'time with time zone',
        'interval'
    ],
    object: ['json', 'jsonb'],
    options: ['enum', 'USER-DEFINED'],
    array: ['ARRAY'],
    binary: ['bytea'],
};

// ============================================================================
// DATABASE CONNECTION TYPES
// ============================================================================

/**
 * The main pg-promise client instance for Neon
 * Used to create database connections and manage the connection pool
 */
export type NeonClient = pgPromise.IMain<{}, pg.IClient>;

/**
 * An active Neon database connection
 * Used to execute queries and manage transactions
 */
export type NeonDatabase = pgPromise.IDatabase<{}, pg.IClient>;

/**
 * Connection parameters for establishing Neon database connections
 * Built from our credential fields (host, port, database, etc.)
 */
export type NeonConnectionParameters = pg.IConnectionParameters<pg.IClient>;

/**
 * A connected Neon database instance
 * Used for executing queries and managing the connection lifecycle
 */
export type NeonConnection = pgPromise.IConnected<{}, pg.IClient>;

/**
 * Container for Neon database connection and client
 * Keeps both the connection and client instance together
 */
export type NeonConnectionsData = {
	db: NeonDatabase;
	client: NeonClient
};

// ============================================================================
// QUERY EXECUTION TYPES
// ============================================================================

/**
 * Function type for executing multiple queries
 * Handles bulk operations and transaction management
 * Used when users want to run multiple SQL operations in one node execution
 */
export type QueriesRunner = (
	queries: QueryWithValues[],
	items: INodeExecutionData[],
	options: IDataObject,
) => Promise<INodeExecutionData[]>;

// ============================================================================
// NODE CONFIGURATION TYPES
// ============================================================================

/**
 * Configuration options for the Neon node
 * Simplified from the full Postgres node options to focus on Neon-specific needs
 */
export type NeonNodeOptions = {
	/** The operation to perform (create, read, update, delete, execute) */
	operation?: string;

	/** How to handle multiple queries (single, transaction, independently) */
	queryMode?: QueryMode;

	/** Connection timeout in milliseconds */
	connectionTimeout?: number;

	/** Neon-specific: which database branch to use */
	branchName?: string;

	/** Neon-specific: whether to check compute status before connecting */
	checkComputeStatus?: boolean;
};

// ============================================================================
// CREDENTIAL TYPES
// ============================================================================

/**
 * Neon database credentials
 * Simplified to focus on Neon's connection requirements
 */
export type NeonNodeCredentials = {
	host: string;           // Neon database host (e.g., ep-xxx-pooler.region.aws.neon.tech)
	port: number;           // Database port (usually 5432)
	database: string;       // Database name
	user: string;           // Username
	password: string;       // Password
	ssl: 'require' | 'allow';  // SSL mode (Neon requires SSL)
};
