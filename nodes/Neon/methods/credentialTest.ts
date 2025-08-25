import { ICredentialTestFunctions, ICredentialsDecrypted, INodeCredentialTestResult } from "n8n-workflow";
import { NeonNodeCredentials } from "../helpers/interface";
import { validateNeonCredentials } from "../transport";

export async function neonApiCredentialTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
	try {
		// Convert credential data to our interface format
		if (!credential.data) {
			return {
				status: 'Error',
				message: 'Credential data is missing',
			};
		}

		const credentials: NeonNodeCredentials = {
			host: credential.data.host as string,
			port: credential.data.port as number,
			database: credential.data.database as string,
			user: credential.data.user as string,
			password: credential.data.password as string,
			ssl: credential.data.ssl as 'require' | 'allow',
		};

		// Test the connection using our helper function
		const result = await validateNeonCredentials(credentials);

		if (result.success) {
			return {
				status: 'OK',
				message: result.message,
			};
		} else {
			return {
				status: 'Error',
				message: result.message,
			};
		}
	} catch (error) {
		return {
			status: 'Error',
			message: `Connection test failed: ${error.message}`,
		};
	}
}
