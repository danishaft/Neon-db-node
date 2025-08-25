import type { NeonNodeCredentials, NeonConnectionsData, NeonConnectionParameters, NeonNodeOptions } from '../helpers/interface';
import pgPromise from 'pg-promise';

// ============================================================================
// CONNECTION CONFIGURATION
// ============================================================================

/**
 * Builds connection configuration for Neon database
 */
export function buildNeonConfig(credentials: NeonNodeCredentials, options?: NeonNodeOptions): NeonConnectionParameters {
	return {
		host: credentials.host,
		port: credentials.port,
		database: credentials.database,
		user: credentials.user,
		password: credentials.password,
		ssl: credentials.ssl === 'require' ? true : false,

		keepAlive: true,
		max: 5,                          // Max connections in pool
		connectionTimeoutMillis: 30000,  // 30 seconds connection timeout
		keepAliveInitialDelayMillis: (options?.delayClosingIdleConnection || 0) * 1000, // Convert seconds to milliseconds
	};
}

// ============================================================================
// CONNECTION SETUP
// ============================================================================

/**
 * Sets up Neon database connection

 */
// Connection pool for reuse within the same node execution
let connectionPool: NeonConnectionsData | null = null;

export async function configureNeon(
	credentials: NeonNodeCredentials,
	options?: NeonNodeOptions,
): Promise<NeonConnectionsData> {
	// Reuse existing connection if available and not ended
	if (connectionPool && !connectionPool.db.$pool.ended) {
		return connectionPool;
	}

	// Create new connection with pooling settings
	const connectionParams = buildNeonConfig(credentials, options);
	const pgp = pgPromise();

	// Configure type parsers for large numbers if option is set to 'number'
	if (options?.outputLargeFormatNumberAs === 'number') {
		// Configure pg-promise to parse BIGINT (type 20) and NUMERIC (type 1700) as JavaScript numbers
		// Type 20 = BIGINT, Type 1700 = NUMERIC/DECIMAL
		pgp.pg.types.setTypeParser(20, (value: string) => {
			return parseInt(value, 10);
		});
		pgp.pg.types.setTypeParser(1700, (value: string) => {
			return parseFloat(value);
		});
	}

	const db = pgp(connectionParams);

	// Store in pool for reuse
	connectionPool = { db, client: pgp };
	return connectionPool;
}

// ============================================================================
// CONNECTION VALIDATION
// ============================================================================

/**
 * Validates Neon database credentials by attempting a connection
 */
export async function validateNeonCredentials(
	credentials: NeonNodeCredentials,
): Promise<{ success: boolean; message: string }> {
	try {
		const { db } = await configureNeon(credentials);
		await db.one('SELECT 1 as test');  // Simple test query
		return { success: true, message: 'Connection successful!' };
	} catch (error) {
		return { success: false, message: getConnectionErrorMessage(error) };
	}
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Converts database errors into user-friendly messages
 * Helps users understand what went wrong with their connection
 */
export function getConnectionErrorMessage(error: any): string {
	const errorCode = error.code;
	const errorMessage = error.message || 'Unknown error occurred';

	// Handle common PostgreSQL error codes
	switch (errorCode) {
		case 'ECONNREFUSED':
			return 'Connection refused. Please check your host and port settings.';

		case 'ENOTFOUND':
			return 'Host not found. Please check your host address.';

		case 'ETIMEDOUT':
			return 'Connection timed out. Please check your network connection.';

		case '28P01':
			return 'Authentication failed. Please check your username and password.';

		case '3D000':
			return 'Database does not exist. Please check your database name.';

		case '08001':
			return 'SSL connection failed. Please check your SSL settings.';

		case '08006':
			return 'Connection terminated. Please check your connection parameters.';

		case 'EAI_AGAIN':
			return 'DNS resolution failed. Please check your network connection and host address.';

		default:
			// For unknown errors, provide the original message but clean it up
			return errorMessage.replace(/^connection\s+failed:\s*/i, '');
	}
}
