// Runs the contract test against the reference server with auth enforced.
import { spawn } from 'node:child_process'
import fs from 'node:fs'

process.env.NIMBUS_JWT_SECRET = 'contract-test-secret'
process.env.NIMBUS_LATENCY = '0'
const { createServer } = await import('vite')
const server = await createServer({ server: { port: 5188, strictPort: true }, logLevel: 'silent' })
await server.listen()
// async spawn: a sync exec would block the event loop the in-process server runs on
const code = await new Promise<number>((done) => spawn('node', ['tests/contract.mjs'], { stdio: 'inherit', env: { ...process.env, BASE_URL: 'http://localhost:5188' } }).on('exit', (c) => done(c ?? 1)))
await server.close()
for (const d of fs.readdirSync('metadata')) if (d.startsWith('contract-')) fs.rmSync(`metadata/${d}`, { recursive: true })
process.exit(code)
