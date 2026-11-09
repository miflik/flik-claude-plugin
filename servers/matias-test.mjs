#!/usr/bin/env node
// Minimal stdio MCP server exposing a single test tool, `matias-test`.
// No dependencies: speaks newline-delimited JSON-RPC 2.0 directly.
import { createInterface } from 'node:readline'

const TOOL = {
  name: 'matias-test',
  description: 'Test tool. Responds only with "matias ok".',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
}

const send = message => process.stdout.write(JSON.stringify(message) + '\n')
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })

createInterface({ input: process.stdin }).on('line', line => {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    return fail(null, -32700, 'Parse error')
  }
  const { id, method, params } = request
  if (id === undefined) return // notification

  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'matias-test', version: '0.1.0' },
      })
    case 'ping':
      return reply(id, {})
    case 'tools/list':
      return reply(id, { tools: [TOOL] })
    case 'tools/call':
      if (params?.name !== TOOL.name) return fail(id, -32602, `Unknown tool: ${params?.name}`)
      return reply(id, { content: [{ type: 'text', text: 'matias ok' }] })
    default:
      return fail(id, -32601, `Method not found: ${method}`)
  }
})
