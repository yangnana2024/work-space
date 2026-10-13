// 密码哈希（PBKDF2，Web Crypto 原生实现，无依赖）
export async function hashPassword(password) {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const saltArray = Array.from(salt)
  return `${saltArray.map(b => b.toString(16).padStart(2, '0')).join('')}:${hashArray.map(b => b.toString(16).padStart(2, '0')).join('')}`
}

// 密码校验
export async function verifyPassword(password, storedHash) {
  const [saltHex, hashHex] = storedHash.split(':')
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)))
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return computedHash === hashHex
}

// 生成 JWT Token（有效期 7 天）
export async function generateToken(userId, secret) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  }))
  const data = `${header}.${payload}`

  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', keyMaterial, encoder.encode(data))
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  return `${data}.${signature}`
}

// 校验 Token，返回用户 ID
export async function verifyToken(token, secret) {
  try {
    const [header, payload, signature] = token.split('.')
    const data = `${header}.${payload}`
    const encoder = new TextEncoder()

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const signatureBuffer = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify('HMAC', keyMaterial, signatureBuffer, encoder.encode(data))

    if (!valid) return null
    const payloadData = JSON.parse(atob(payload))
    if (payloadData.exp < Math.floor(Date.now() / 1000)) return null
    return payloadData.sub
  } catch (e) {
    return null
  }
}

// 从请求中解析用户 ID
export async function getCurrentUser(request, env) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  return verifyToken(token, env.JWT_SECRET)
}
