import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class NeonApi implements ICredentialType {
	name = 'neonApi';
	displayName = 'Neon Postgres API';
	icon: Icon = {
		light: 'file:../nodes/Neon/neon.svg',
		dark: 'file:../nodes/Neon/neon.dark.svg',
	};
	documentationUrl = 'https://neon.com/docs/connect/connect-from-any-app';

	properties: INodeProperties[] = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: '',
			description: 'Neon host from the project connection details',
			placeholder: 'ep-example-pooler.us-east-2.aws.neon.tech',
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
			default: '',
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
					description: 'Allow an unencrypted connection for local development',
				},
			],
			default: 'require',
			description: 'Whether the database connection must use SSL',
		},
	];
}
