![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

# n8n-nodes-neon

This is an n8n community node. It lets you use Neon Database in your n8n workflows.

Neon is a serverless PostgreSQL database that automatically scales to zero and provides instant branching. This node enables you to perform CRUD operations, execute custom SQL queries, and integrate Neon databases directly into your n8n automation workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)  
[Version history](#version-history)  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

**Quick Installation:**
1. In your n8n instance, go to Settings > Community Nodes
2. Click "Install a community node"
3. Enter: `n8n-nodes-neon`
4. Click Install

## Operations

The Neon node provides comprehensive database operations:

### Core CRUD Operations
- **INSERT** - Insert new records with auto-mapping or manual column mapping
- **SELECT** - Query data with filtering, sorting, and column selection
- **UPDATE** - Update existing records with multi-column matching
- **DELETE** - Delete records, truncate tables, or drop tables entirely

### Advanced Features
- **Execute Query** - Run custom SQL queries with parameter binding
- **Schema Introspection** - Automatic discovery of schemas, tables, and columns
- **Parameterized Queries** - Secure SQL execution preventing injection attacks
- **Execution Modes** - Single, Transaction, and Independent execution strategies


## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

Create, Read, Update, Delete operations for database rows, plus custom SQL query execution with parameter binding. The node also provides dynamic schema introspection for automatic table and column discovery.

## Credentials

To use this node, you need a Neon database account and connection details.

**Prerequisites:**
1. Sign up for a [Neon account](https://neon.tech/)
2. Create a new project and database
3. Note your connection details

**Required connection parameters:**
- **Host** - Your Neon database host (e.g., `ep-xxx-pooler.region.aws.neon.tech`)
- **Port** - Database port (default: 5432)
- **Database** - Database name
- **Username** - Database username
- **Password** - Database password
- **SSL** - SSL mode (required for Neon)

The node enforces SSL connections for security and uses parameter binding to prevent SQL injection.

## Compatibility

- **Minimum n8n version**: 1.0.0
- **Tested with**: n8n 1.104.2 (Self Hosted)
- **Node.js**: 20+ (required by n8n)
- **Database**: Neon PostgreSQL (compatible with PostgreSQL 15+)

## Usage

Add the Neon node to your workflow, configure your database credentials using the "Test Connection" button, and select your operation. The node automatically discovers your database schema and provides dynamic table and column selection.

For custom SQL queries, use the "Execute Query" operation with parameter binding:
```sql
SELECT * FROM users WHERE active = true
INSERT INTO logs (message, timestamp) VALUES ($1, $2)
UPDATE products SET price = $1 WHERE id = $2
```

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Neon Database documentation](https://neon.tech/docs)
* [PostgreSQL documentation](https://www.postgresql.org/docs/)
* [n8n Postgres node reference](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Postgres)

## Version history

**v1.0.0** - Initial release with basic CRUD operations, custom SQL queries, and schema introspection.

## License

[MIT](https://github.com/n8n-io/n8n-nodes-starter/blob/master/LICENSE.md)
