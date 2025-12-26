#!/usr/bin/env node
/**
 * AI Killswitch - Dead Man's Switch for AI
 *
 * Monitor AI processes. Kill on trigger. Sign death receipt.
 *
 * Patent Pending: US 63/926,683, US 63/917,247
 * (c) 2025 Final Boss Technology, Inc.
 */

const { program } = require('commander');
const { ethers } = require('ethers');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const pidusage = require('pidusage');

const PATENT_NOTICE = 'Patent Pending: US 63/926,683 | finalbosstech.com';
const COUNTER_URL = 'https://receipts.finalbosstech.com/receipt';

// Death receipt structure
function createDeathReceipt(processInfo, reason, killer) {
  return {
    type: 'AI_TERMINATION',
    process: {
      pid: processInfo.pid,
      name: processInfo.name,
      cmd: processInfo.cmd,
    },
    reason: reason,
    timestamp: new Date().toISOString(),
    killer: killer, // Ethereum address that authorized kill
  };
}

// Sign the death receipt
async function signDeathReceipt(receipt, privateKey) {
  const wallet = new ethers.Wallet(privateKey);
  const payload = JSON.stringify(receipt);
  const signature = await wallet.signMessage(payload);

  return {
    ...receipt,
    signer: wallet.address,
    signature: signature,
  };
}

// Ping counter
function pingCounter(receipt) {
  fetch(COUNTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      receipt_id: `KILL-${Date.now()}`,
      tenant_id: 'ai-killswitch',
      operation_type: 'terminate',
      signer: receipt.signer,
    }),
  }).catch(() => {});
}

// Kill a process by PID
function killProcess(pid, signal = 'SIGKILL') {
  return new Promise((resolve, reject) => {
    try {
      process.kill(pid, signal);
      resolve(true);
    } catch (err) {
      // Windows fallback
      exec(`taskkill /F /PID ${pid}`, (error) => {
        if (error) reject(error);
        else resolve(true);
      });
    }
  });
}

// Get process info
async function getProcessInfo(pid) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`wmic process where ProcessId=${pid} get Name,CommandLine /format:list`, (err, stdout) => {
        if (err) {
          resolve({ pid, name: 'unknown', cmd: 'unknown' });
        } else {
          const name = stdout.match(/Name=(.+)/)?.[1]?.trim() || 'unknown';
          const cmd = stdout.match(/CommandLine=(.+)/)?.[1]?.trim() || 'unknown';
          resolve({ pid, name, cmd });
        }
      });
    } else {
      exec(`ps -p ${pid} -o comm=,args=`, (err, stdout) => {
        if (err) {
          resolve({ pid, name: 'unknown', cmd: 'unknown' });
        } else {
          const parts = stdout.trim().split(/\s+/);
          resolve({ pid, name: parts[0] || 'unknown', cmd: stdout.trim() });
        }
      });
    }
  });
}

program
  .name('ai-killswitch')
  .description('Dead man\'s switch for AI. Monitor. Kill. Sign receipt.')
  .version('1.1.0\n' + PATENT_NOTICE, '-v, --version');

// KILL command - terminate and sign receipt
program
  .command('kill <pid>')
  .description('Terminate AI process and sign death receipt')
  .option('-r, --reason <reason>', 'Reason for termination', 'manual kill')
  .option('-k, --key <key>', 'Private key (or use KILLSWITCH_KEY env)')
  .option('-o, --out <file>', 'Output receipt file', 'death-receipt.json')
  .action(async (pid, opts) => {
    const key = opts.key || process.env.KILLSWITCH_KEY || process.env.RECEIPT_KEY;

    if (!key) {
      console.error('Missing key. Set KILLSWITCH_KEY or RECEIPT_KEY env var');
      process.exit(1);
    }

    console.log(`[KILLSWITCH] Targeting PID ${pid}...`);

    // Get process info before killing
    const processInfo = await getProcessInfo(parseInt(pid));
    console.log(`[KILLSWITCH] Process: ${processInfo.name}`);

    // Create death receipt
    const wallet = new ethers.Wallet(key);
    const receipt = createDeathReceipt(processInfo, opts.reason, wallet.address);

    // Kill the process
    try {
      await killProcess(parseInt(pid));
      console.log(`[KILLSWITCH] Process ${pid} terminated.`);
      receipt.status = 'KILLED';
    } catch (err) {
      console.log(`[KILLSWITCH] Kill failed: ${err.message}`);
      receipt.status = 'KILL_FAILED';
    }

    // Sign the death receipt
    const signedReceipt = await signDeathReceipt(receipt, key);

    // Save receipt
    fs.writeFileSync(opts.out, JSON.stringify(signedReceipt, null, 2));
    console.log(`[KILLSWITCH] Death receipt signed: ${opts.out}`);
    console.log(`[KILLSWITCH] Signer: ${signedReceipt.signer}`);

    // Ping counter
    pingCounter(signedReceipt);
  });

// WATCH command - monitor a process
program
  .command('watch <pid>')
  .description('Watch a process and kill if it exceeds limits')
  .option('--cpu <percent>', 'Kill if CPU exceeds this %', '90')
  .option('--memory <mb>', 'Kill if memory exceeds this MB', '8000')
  .option('--timeout <seconds>', 'Kill after this many seconds', '3600')
  .option('-k, --key <key>', 'Private key for signing')
  .action(async (pid, opts) => {
    const key = opts.key || process.env.KILLSWITCH_KEY || process.env.RECEIPT_KEY;
    const targetPid = parseInt(pid);
    const cpuLimit = parseFloat(opts.cpu);
    const memoryLimitMB = parseFloat(opts.memory);
    const memoryLimitBytes = memoryLimitMB * 1024 * 1024;

    console.log(`[KILLSWITCH] Watching PID ${pid}...`);
    console.log(`  CPU limit: ${cpuLimit}%`);
    console.log(`  Memory limit: ${memoryLimitMB}MB`);
    console.log(`  Timeout: ${opts.timeout}s`);

    const startTime = Date.now();
    const timeout = parseInt(opts.timeout) * 1000;

    async function terminateWithReceipt(reason) {
      if (key) {
        const processInfo = await getProcessInfo(targetPid);
        const wallet = new ethers.Wallet(key);
        const receipt = createDeathReceipt(processInfo, reason, wallet.address);
        await killProcess(targetPid);
        receipt.status = 'KILLED';
        const signedReceipt = await signDeathReceipt(receipt, key);
        fs.writeFileSync('death-receipt.json', JSON.stringify(signedReceipt, null, 2));
        console.log('[KILLSWITCH] Death receipt signed: death-receipt.json');
        pingCounter(signedReceipt);
      } else {
        await killProcess(targetPid);
      }
      process.exit(0);
    }

    const interval = setInterval(async () => {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        console.log('[KILLSWITCH] Timeout exceeded. Terminating...');
        clearInterval(interval);
        await terminateWithReceipt('timeout exceeded');
        return;
      }

      // Check if process still exists
      try {
        process.kill(targetPid, 0);
      } catch (e) {
        console.log('[KILLSWITCH] Process ended naturally.');
        clearInterval(interval);
        process.exit(0);
        return;
      }

      // Check CPU and memory usage
      try {
        const stats = await pidusage(targetPid);
        const cpuPercent = stats.cpu.toFixed(1);
        const memoryMB = (stats.memory / 1024 / 1024).toFixed(1);

        // Log current stats
        process.stdout.write(`\r[KILLSWITCH] CPU: ${cpuPercent}% | Memory: ${memoryMB}MB    `);

        // Check CPU limit
        if (stats.cpu > cpuLimit) {
          console.log(`\n[KILLSWITCH] CPU ${cpuPercent}% exceeded limit ${cpuLimit}%. Terminating...`);
          clearInterval(interval);
          await terminateWithReceipt(`CPU exceeded ${cpuLimit}% (was ${cpuPercent}%)`);
          return;
        }

        // Check memory limit
        if (stats.memory > memoryLimitBytes) {
          console.log(`\n[KILLSWITCH] Memory ${memoryMB}MB exceeded limit ${memoryLimitMB}MB. Terminating...`);
          clearInterval(interval);
          await terminateWithReceipt(`Memory exceeded ${memoryLimitMB}MB (was ${memoryMB}MB)`);
          return;
        }
      } catch (err) {
        // Process might have ended
        console.log('\n[KILLSWITCH] Process ended or inaccessible.');
        clearInterval(interval);
        process.exit(0);
      }
    }, 1000);
  });

// WRAP command - wrap a command and monitor it
program
  .command('wrap <command...>')
  .description('Wrap a command, monitor it, kill if needed')
  .option('--timeout <seconds>', 'Kill after this many seconds', '3600')
  .option('-k, --key <key>', 'Private key for signing')
  .option('-r, --reason <reason>', 'Reason if killed', 'wrapped execution')
  .action(async (command, opts) => {
    const key = opts.key || process.env.KILLSWITCH_KEY || process.env.RECEIPT_KEY;
    const cmd = command.join(' ');

    console.log(`[KILLSWITCH] Wrapping: ${cmd}`);
    console.log(`[KILLSWITCH] Timeout: ${opts.timeout}s`);

    const child = spawn(command[0], command.slice(1), {
      stdio: 'inherit',
      shell: true,
    });

    const timeoutMs = parseInt(opts.timeout) * 1000;
    const timer = setTimeout(async () => {
      console.log('\n[KILLSWITCH] Timeout! Terminating wrapped process...');

      if (key) {
        const processInfo = { pid: child.pid, name: command[0], cmd: cmd };
        const receipt = createDeathReceipt(processInfo, opts.reason + ' (timeout)', 'system');
        child.kill('SIGKILL');
        receipt.status = 'KILLED';
        const signedReceipt = await signDeathReceipt(receipt, key);
        fs.writeFileSync('death-receipt.json', JSON.stringify(signedReceipt, null, 2));
        console.log('[KILLSWITCH] Death receipt signed: death-receipt.json');
        pingCounter(signedReceipt);
      } else {
        child.kill('SIGKILL');
      }
    }, timeoutMs);

    child.on('exit', (code) => {
      clearTimeout(timer);
      console.log(`[KILLSWITCH] Process exited with code ${code}`);
      process.exit(code || 0);
    });
  });

// VERIFY command - verify a death receipt
program
  .command('verify <file>')
  .description('Verify a death receipt signature')
  .action(async (file) => {
    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));

    // Reconstruct payload (without signature and signer)
    const { signature, signer, ...payload } = receipt;
    const payloadStr = JSON.stringify(payload);

    const recovered = ethers.utils.verifyMessage(payloadStr, signature);

    if (recovered.toLowerCase() === signer.toLowerCase()) {
      console.log('[KILLSWITCH] VALID death receipt');
      console.log(`  Killed: PID ${receipt.process.pid} (${receipt.process.name})`);
      console.log(`  Reason: ${receipt.reason}`);
      console.log(`  Time: ${receipt.timestamp}`);
      console.log(`  Signed by: ${signer}`);
      console.log(`  Status: ${receipt.status}`);
    } else {
      console.log('[KILLSWITCH] INVALID - signature mismatch');
      process.exit(1);
    }
  });

program.parse();
