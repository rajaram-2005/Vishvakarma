# SUTRA Discovery

Finds what is available **on this machine**: local model runtimes (Ollama,
any OpenAI-compatible server), MCP servers, and their health.

- `GET /runtimes` — live probes (3s timeout) of configured runtimes
- `GET /mcp` — MCP server catalog (transport, tools, scopes, version)
- `POST /mcp/{id}/health` — health probe; HTTP targets only, and **private
  hosts only** in local privacy mode (refuses to probe public hosts)
- `GET /health`

Discovery is read-only. Installing/enabling a server goes through the MCP
surface with explicit permissions (web app) or `services/registry`.
