const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { BuildynoteClient } = require('../client/buildynote');
const { TOOLS, handleTool } = require('./tools');

const apiToken = process.env.BUILDYNOTE_API_TOKEN;
if (!apiToken) {
  console.error('Error: BUILDYNOTE_API_TOKEN environment variable is required');
  process.exit(1);
}
const client = new BuildynoteClient(apiToken);

const server = new Server(
  { name: 'buildynote-mcp', version: '1.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(client, name, args || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('BUILDYNOTE MCP server running (stdio)');
}

main().catch((e) => { console.error(e); process.exit(1); });
