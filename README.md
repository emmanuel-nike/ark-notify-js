# ark-notify

JavaScript SDK for [Ark Notify](https://github.com/ark-notify/ark-notify) — real-time pub/sub, presence, SSE streaming, and platform management.

- **Core API** (`ark-notify`) — imperative client, WebSocket, and SSE classes for any JavaScript environment
- **React bindings** (`ark-notify/react`) — hooks and provider for React 18+ applications

## Install

```bash
npm install ark-notify
```

For React apps, `react` 18+ is a peer dependency.

## Quick start (React)

Wrap your app with the provider, connect a WebSocket client, and subscribe to a channel:

```tsx
import { ArkNotifyProvider, useConnection, useChannel } from 'ark-notify/react'

function App() {
  return (
    <ArkNotifyProvider baseUrl="http://localhost:3000">
      <Chat />
    </ArkNotifyProvider>
  )
}

function Chat() {
  const { connection, state } = useConnection({
    appKey: 'app_abc',
    clientId: 'user-42',
    // Recommended: fetch a connection token from your backend
    // token: () => fetchTokenFromYourApi(),
  })

  const { publish, bind } = useChannel(connection, 'room-1', {
    onEvent: (event, data) => console.log(event, data),
  })

  return (
    <div>
      <p>Status: {state}</p>
      <button onClick={() => publish('message', { text: 'Hello!' })}>
        Send
      </button>
    </div>
  )
}
```

## Architecture

Ark Notify has two API planes:

| Plane | Purpose | Auth |
|-------|---------|------|
| **Control** | Register, login, manage applications | JWT (`Authorization: Bearer`) |
| **Data** | WebSocket/SSE clients, server-side publish | `clientId` / connection token (clients) or app key + secret (servers) |

**Never expose your app `secret` in browser code.** Issue connection tokens and private-channel auth from your backend.

## Provider

```tsx
import { ArkNotifyProvider } from 'ark-notify/react'

<ArkNotifyProvider
  baseUrl="https://notify.example.com"
  token={platformJwt} // optional — for admin dashboards
>
  {children}
</ArkNotifyProvider>
```

## Platform auth (control plane)

For admin dashboards that manage applications:

```tsx
import { usePlatformAuth, useApplications } from 'ark-notify/react'

function Dashboard() {
  const { user, login, logout, isAuthenticated } = usePlatformAuth()
  const { apps, create, remove } = useApplications()

  if (!isAuthenticated) {
    return (
      <button onClick={() => login({ email: '...', password: '...' })}>
        Log in
      </button>
    )
  }

  return (
    <div>
      <p>Hello, {user?.firstName}</p>
      <button onClick={() => create({ name: 'My App' })}>New app</button>
      {apps.map((app) => (
        <div key={app.id}>{app.name} — {app.appKey}</div>
      ))}
    </div>
  )
}
```

## WebSocket connection

### `useConnection`

```tsx
import { useConnection } from 'ark-notify/react'

const {
  connection,
  state,           // 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
  connectionId,
  clientId,
  authenticated,
  connect,
  disconnect,
} = useConnection({
  appKey: 'app_abc',
  clientId: 'user-42',           // when requireClientAuth is false
  token: 'app_abc.payload.sig',  // recommended — from your backend
  autoReconnect: true,
  onPrivateChannelAuth: async (channel, connectionId) => {
    const res = await fetch('/api/channel-auth', {
      method: 'POST',
      body: JSON.stringify({ channel, connectionId }),
    })
    const { auth } = await res.json()
    return auth
  },
})
```

### `useChannel`

Auto-subscribes on mount and unsubscribes on unmount:

```tsx
import { useChannel } from 'ark-notify/react'

const { subscribed, publish, unsubscribe } = useChannel(connection, 'room-1', {
  history: true,
  presence: true,
  presence_data: { name: 'Alice' },
})

publish('typing', { typing: true })
```

### `usePresence`

Track channel presence members:

```tsx
import { usePresence } from 'ark-notify/react'

const { members, update, leave } = usePresence(connection, 'room-1', {
  initialData: { status: 'online' },
})

// members: [{ clientId, connectionId, data, updatedAt }, ...]
update({ status: 'away' })
```

## SSE (subscribe-only)

For read-only event streams without WebSocket:

```tsx
import { useSSE } from 'ark-notify/react'

const { connected, bind } = useSSE({
  appKey: 'app_abc',
  channels: ['room-1', 'room-2'],
  clientId: 'user-42',
  history: true,
  onEvent: (event, data) => console.log(event, data),
})
```

## Imperative API

Use core classes directly outside React or in server code:

```ts
import {
  ArkNotifyClient,
  ArkNotifyConnection,
  ArkNotifySSE,
  fetchConnectionToken,
} from 'ark-notify'

// REST client
const client = new ArkNotifyClient({ baseUrl: 'http://localhost:3000' })
await client.login({ email, password })
const { app } = await client.createApplication({ name: 'My App' })

// Server-side publish (use app credentials — never in browser)
await client.publishEvent(app.appKey, { appKey, secret }, {
  channel: 'room-1',
  event: 'order.created',
  data: { id: 123 },
})

// Fetch a connection token (server-side)
const { token } = await fetchConnectionToken({
  baseUrl: 'http://localhost:3000',
  appKey: app.appKey,
  credentials: { appKey: app.appKey, secret: app.secret! },
  client_id: 'user-42',
  user_data: { name: 'Alice' },
})

// WebSocket — pass token directly
const conn = new ArkNotifyConnection({
  baseUrl: 'http://localhost:3000',
  appKey: 'app_abc',
  token,
})
await conn.connect()

// WebSocket — auto-fetch token when credentials + clientId are provided (server-side)
const autoConn = new ArkNotifyConnection({
  baseUrl: 'http://localhost:3000',
  appKey: app.appKey,
  clientId: 'user-42',
  credentials: { appKey: app.appKey, secret: app.secret! },
  user_data: { name: 'Alice' },
})
await autoConn.connect()

autoConn.on('event', (msg) => console.log(msg))
await autoConn.subscribe('private-room-1', { auth: 'app_abc:...' })
autoConn.publish('room-1', 'message', { text: 'hi' })
```

When `token` is omitted, `ArkNotifyConnection` automatically calls `POST /api/v1/apps/:appKey/connection-token` if both `clientId` and `credentials` are set. On reconnect, a fresh token is fetched.

## System admin

```tsx
import { useAdminChannels } from 'ark-notify/react'

const { data, loading, refresh } = useAdminChannels()
// Requires SYSTEM_ADMIN JWT via ArkNotifyProvider token
```

## API coverage

| Feature | Hook / Class | Method |
|---------|--------------|--------|
| Health | `ArkNotifyClient` | `.health()` |
| Register / login / me | `usePlatformAuth`, `ArkNotifyClient` | `.register()`, `.login()`, `.me()` |
| Application CRUD | `useApplications`, `ArkNotifyClient` | `.listApplications()`, `.createApplication()`, … |
| Regenerate secret | `useApplications` | `.regenerateSecret()` |
| Admin channels | `useAdminChannels` | `.adminChannels()` |
| Publish (server) | `ArkNotifyClient` | `.publishEvent()` |
| Channel auth (server) | `ArkNotifyClient` | `.authorizeChannel()` |
| Connection token (server) | `ArkNotifyClient`, `fetchConnectionToken` | `.issueConnectionToken()`, `fetchConnectionToken()` |
| WebSocket connect | `useConnection`, `ArkNotifyConnection` | `.connect()` |
| Subscribe / unsubscribe | `useChannel`, `ArkNotifyConnection` | `.subscribe()`, `.unsubscribe()` |
| Publish (client) | `useChannel`, `ArkNotifyConnection` | `.publish()` |
| Presence | `usePresence`, `ArkNotifyConnection` | `.presenceEnter()`, `.presenceUpdate()`, … |
| SSE stream | `useSSE`, `ArkNotifySSE` | `.connect()` |
| Private channels | `onPrivateChannelAuth` callback | — |
| Auto-reconnect | `useConnection` | `autoReconnect: true` |
| Heartbeat | `ArkNotifyConnection` | Server ping auto-replied |

## Error handling

All REST errors throw `ArkNotifyError` with `status`, `code`, and `message`:

```ts
import { ArkNotifyError } from 'ark-notify'

try {
  await client.login({ email, password })
} catch (err) {
  if (err instanceof ArkNotifyError) {
    console.log(err.code, err.status, err.retryAfterSec)
  }
}
```

WebSocket errors are emitted via `connection.on('error', …)` or the `useConnection` state.

## License

MIT
