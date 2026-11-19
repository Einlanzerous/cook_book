// Connect screen (COOK-15): what to show and how to build each client config.
// The MCP listener is internal; agents reach it only through the estate gateway
// (heitan), authenticated by Cloudflare Access. Which bundles/URLs to list is an
// open owner decision, so they live in this one table.
export const GATEWAY_ORIGIN = 'https://heitan.zerogravity.industries'

export const BUNDLES = [{ id: 'commonplace.read', label: 'Read', note: 'Search and read recipes.' }]

export const SERVER_NAME = 'commonplace'

export function bundleUrl(bundle, origin = GATEWAY_ORIGIN) {
  return `${origin}/mcp/${bundle.id}`
}

/** The tabs on the screen. Each has where the text goes and the text to copy. */
export function clientConfigs(url) {
  return [
    {
      id: 'claude',
      label: 'Claude',
      where: 'Settings → Connectors → Add custom connector',
      text: url,
    },
    {
      id: 'desktop',
      label: 'Claude Desktop',
      where: 'claude_desktop_config.json',
      text: JSON.stringify(
        { mcpServers: { [SERVER_NAME]: { command: 'npx', args: ['-y', 'mcp-remote', url] } } },
        null,
        2
      ),
    },
    {
      id: 'code',
      label: 'Claude Code',
      where: 'Terminal',
      text: `claude mcp add --transport http ${SERVER_NAME} ${url}`,
    },
  ]
}
