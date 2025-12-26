# ai-killswitch

**Dead man's switch for AI. Monitor. Kill. Sign receipt.**

```bash
npx ai-killswitch kill 12345 --reason "hallucination detected"
```

Every termination generates a cryptographically signed death receipt. Verifiable. Immutable. Proof that you killed it.

## Install

```bash
npm install -g ai-killswitch
```

## Usage

### Kill a process and sign death receipt

```bash
export KILLSWITCH_KEY="0xYOUR_PRIVATE_KEY"
ai-killswitch kill <pid> --reason "exceeded safety threshold"
```

Output: `death-receipt.json` - signed proof of termination.

### Watch a process (real-time CPU/memory monitoring)

```bash
ai-killswitch watch 12345 --timeout 3600 --cpu 90 --memory 8000
```

**v1.1.0**: Now with real-time CPU and memory monitoring!
- Shows live `CPU: X% | Memory: XMB` updates
- Kills immediately when limits exceeded
- Signs death receipt with exact trigger reason

### Wrap a command (monitor + kill)

```bash
ai-killswitch wrap "python run_model.py" --timeout 300
```

Runs the command. If it exceeds timeout → killed → receipt signed.

### Verify a death receipt

```bash
ai-killswitch verify death-receipt.json
```

## Death Receipt Format

```json
{
  "type": "AI_TERMINATION",
  "process": {
    "pid": 12345,
    "name": "python",
    "cmd": "python run_model.py"
  },
  "reason": "CPU exceeded 90% (was 95.2%)",
  "timestamp": "2025-12-26T12:00:00.000Z",
  "status": "KILLED",
  "signer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "signature": "0x..."
}
```

## Why

- **Compliance**: Prove to auditors you terminated a misbehaving AI
- **Safety**: Cryptographic proof of kill decisions
- **Accountability**: Who authorized the kill, when, why
- **Real-time**: CPU/memory monitoring with instant response

## Telemetry (Opt-in)

By default, ai-killswitch works **completely offline**. No data is sent anywhere.

If you opt in, minimal metadata is sent to help track receipt volume:

| Enable | Method |
|--------|--------|
| Env var | `VAULT_SYNC=on` |
| Flag | `--vault-sync` |

**Fields sent:**
- `signature_prefix` (first 32 chars - correlator for dedup)
- `signer` (your Ethereum address)
- `timestamp`
- `event_type` (AI_TERMINATION)
- `status` (KILLED/KILL_FAILED)
- `sdk_source` (ai-killswitch)
- `sdk_version`

**NOT sent:** Process names, PIDs, command lines, reasons, or any process details.

## Part of FinalBoss SDK

| SDK | Purpose |
|-----|---------|
| [receipt-cli-eth](https://npmjs.com/package/receipt-cli-eth) | General receipt signing |
| **ai-killswitch** | AI termination receipts |
| [langchain-receipts](https://github.com/805-ai/langchain-receipts) | Agent action receipts |
| [Juggernaut Gatekeeper](https://github.com/805-ai/juggernaut-gatekeeper) | Code healing receipts |

## Patent Notice

**Patent Pending:** US 63/926,683, US 63/917,247

The cryptographic receipt architecture is protected by pending patents.

(c) 2025 Final Boss Technology, Inc.
