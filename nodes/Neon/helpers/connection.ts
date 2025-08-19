import type { NeonNodeCredentials, NeonConnectionsData, NeonConnectionParameters } from './interface';
import pgPromise from 'pg-promise';

// ============================================================================
// CONNECTION CONFIGURATION
// ============================================================================

/**
 * Builds connection configuration for Neon database
 * Following n8n Postgres pattern for consistency
 */
export function buildNeonConfig(credentials: NeonNodeCredentials): NeonConnectionParameters {
	return {
		host: credentials.host,
		port: credentials.port,
		database: credentials.database,
		user: credentials.user,
		password: credentials.password,
		ssl: credentials.ssl === 'require' ? true : false,

		// Production-ready connection settings (following n8n Postgres pattern)
		keepAlive: true,                 // Maintain connections
		max: 5,                          // Max connections in pool (lower than Postgres default)
		connectionTimeoutMillis: 30000,  // 30 seconds connection timeout
	};
}

// ============================================================================
// CONNECTION SETUP
// ============================================================================

/**
 * Sets up Neon database connection (similar to configurePostgres)
 * Following n8n Postgres pattern for consistency
 */
// Connection pool for reuse within the same node execution
let connectionPool: NeonConnectionsData | null = null;

export async function configureNeon(
	credentials: NeonNodeCredentials,
): Promise<NeonConnectionsData> {
	// Reuse existing connection if available and not ended
	if (connectionPool && !connectionPool.db.$pool.ended) {
		return connectionPool;
	}

	// Create new connection with pooling settings
	const connectionParams = buildNeonConfig(credentials);
	const pgp = pgPromise();
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
 * Following n8n Postgres pattern for consistency
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
