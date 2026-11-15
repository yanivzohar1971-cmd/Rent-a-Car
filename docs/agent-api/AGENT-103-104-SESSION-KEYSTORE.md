# AGENT-103 / AGENT-104 — Session Binding & Keystore Tokens

**Status:** IMPLEMENTED (unit-tested); production wiring not activated

## AGENT-103

| Component | Role |
|-----------|------|
| `SessionBindingPolicy` | Rejects `agent-dev-uid` unless AgentDev mode |
| `FirebaseTrustedSessionBinder` | Real Firebase user; rejects anonymous/blank; never used in AgentDev |
| `AgentDevTrustedSessionBinder` | Fixed AgentDev uid only when `AGENT_DEV_MODE` |
| `BoundSessionIdentity.fromTrustedBinder` | Only factory (no raw uid) |

External MCP callers still cannot supply UID.

## AGENT-104

| Component | Role |
|-----------|------|
| `DeviceSigningKeyProvider` / `InMemoryDeviceSigningKeyProvider` | HMAC secret abstraction |
| `AndroidKeystoreHmacKeyProvider` | Non-exportable Android Keystore HMAC |
| `EncryptedPrefsDeviceTokenStore` | EncryptedSharedPreferences persistence |
| `PersistentDeviceTokenStore` | Interface for durable tokens |

JVM tests cover in-memory + fake persistent roundtrip. Keystore provider requires device/emulator (compiles; not JVM-exercised).

## Not yet production-wired

`standard` builds still use in-memory pairing in diagnostics. Encrypted store + Firebase binder ready for activation without enabling remote writes.
