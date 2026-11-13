// npm run token -- --tenant acme --perms metadata.read,metadata.write --hours 8
import { signJwt } from '../server/jwt'

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf('--' + n)
  return i > 0 ? process.argv[i + 1] : d
}
const secret = process.env.NIMBUS_JWT_SECRET
if (!secret) {
  console.error('Set NIMBUS_JWT_SECRET (the same secret your API verifies with).')
  process.exit(1)
}
console.log(
  signJwt(
    {
      sub: arg('sub', 'dev-user'),
      tenant: arg('tenant', 'default'),
      permissions: arg('perms', '*')
        .split(',')
        .map((s) => s.trim()),
      exp: Math.floor(Date.now() / 1000) + Number(arg('hours', '8')) * 3600,
    },
    secret,
  ),
)
