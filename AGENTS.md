<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Private shared project memory

If `.agent-memory/PROJECT_MEMORY.md` exists, read it before making changes. It is
the private durable handoff for Codex and Claude. The directory is a separate
private repository and is intentionally ignored by this public repository.

After meaningful product, architecture, security, or workflow decisions, update
the private memory in the same work session and commit it separately in the
private repository. Keep it concise and durable. Never copy its contents into
this public repository or add passwords, secrets, real member data, or temporary
debugging details.
