import {
	IAuthenticateGeneric,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class NeonApi implements ICredentialType {
	name = 'neonApi';
	displayName = 'Neon Database API';
	documentationUrl = 'https://docs.n8n.io/integrations/creating-nodes/build/declarative-style-node/';

	properties: INodeProperties[] = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: 'ep-delicate-grass-ddgx46j3-pooler.c-2.us-east-1.aws.neon.tech',
			description: 'Your Neon database host (found in Project Settings > Connection Details)',
			placeholder: 'ep-delicate-grass-ddgx46j3-pooler.c-2.us-east-1.aws.neon.tech',
		},
		{
			displayName: 'Database',
			name: 'database',
			type: 'string',
			default: 'neondb',
			description: 'Your Neon database name',
			placeholder: 'neondb',
		},
		{
			displayName: 'Username',
			name: 'user',
			type: 'string',
			default: 'neondb_owner',
			description: 'Your Neon database username',
			placeholder: 'neondb_owner',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '={{ $env.NEON_PASSWORD }}',
			description: 'Your Neon database password',
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 5432,
			description: 'Your Neon database port (usually 5432)',
			typeOptions: {
				minValue: 1,
				maxValue: 65535,
			},
		},
		{
			displayName: 'SSL',
			name: 'ssl',
			type: 'options',
			options: [
				{
					name: 'Require',
					value: 'require',
				},
				{
					name: 'Allow',
					value: 'allow',
					description: 'Allow connections without a valid certificate (not recommended).'
				}
			],
			default: 'require',
			description: 'Neon requires SSL for all connections. `Require` is the recommended setting.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			// Note: For Postgres connections, we'll handle authentication in the node logic
			// rather than through HTTP headers like Supabase
		},
	};


}
