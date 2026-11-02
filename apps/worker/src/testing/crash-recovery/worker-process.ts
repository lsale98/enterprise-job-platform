import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

export type WorkerProcessMode = "normal" | "crash";

export interface WorkerProcessOptions {
  databaseUrl: string;
  mode?: WorkerProcessMode;
  environment?: Record<string, string>;
}

export interface StartedWorkerProcess {
  process: ChildProcess;
  waitForStart: () => Promise<void>;
  waitForClaim: (jobId: string) => Promise<void>;
  kill: () => Promise<void>;
  getOutput: () => string;
}

const START_TIMEOUT_MS = 10000;
const CLAIM_TIMEOUT_MS = 10000;
const STOP_TIMEOUT_MS = 10000;

const ENTRY_POINTS: Record<WorkerProcessMode, string> = {
  normal: resolve(import.meta.dirname, "../../main.js"),
  crash: resolve(import.meta.dirname, "./crash-worker.js"),
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitUntil(
  condition: () => boolean,
  timeoutMs: number,
  getOutput: () => string,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) {
      return;
    }

    await delay(25);
  }

  throw new Error(`Worker condition timed out:\n${getOutput()}`);
}

export function startWorkerProcess({
  databaseUrl,
  mode = "normal",
  environment = {},
}: WorkerProcessOptions): StartedWorkerProcess {
  const parsedUrl = new URL(databaseUrl);

  if (parsedUrl.pathname !== "/lab_test") {
    throw new Error("Worker integration tests require the lab_test database");
  }

  const child = spawn(process.execPath, [ENTRY_POINTS[mode]], {
    cwd: resolve(import.meta.dirname, "../../../"),
    env: {
      ...process.env,
      ...environment,
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: databaseUrl,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let output = "";
  let exited = false;

  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  child.once("exit", () => {
    exited = true;
  });

  const getOutput = () => output;

  return {
    process: child,
    getOutput,

    async waitForStart(): Promise<void> {
      await waitUntil(
        () => output.includes("Global worker started") || exited,
        START_TIMEOUT_MS,
        getOutput,
      );

      if (exited) {
        throw new Error(`Worker exited before startup:\n${output}`);
      }
    },

    async waitForClaim(jobId: string): Promise<void> {
      if (mode !== "crash") {
        throw new Error("waitForClaim is only supported in crash mode");
      }

      await waitUntil(
        () =>
          (output.includes("CRASH_TEST_JOB_CLAIMED") &&
            output.includes(jobId)) ||
          exited,
        CLAIM_TIMEOUT_MS,
        getOutput,
      );

      if (exited) {
        throw new Error(`Worker exited before claiming job:\n${output}`);
      }
    },

    async kill(): Promise<void> {
      if (exited) {
        return;
      }

      const exitPromise = new Promise<void>((resolveExit) => {
        child.once("exit", () => resolveExit());
      });

      if (process.platform === "win32") {
        await new Promise<void>((resolveKill, reject) => {
          const killer = spawn(
            "taskkill",
            ["/PID", String(child.pid), "/F", "/T"],
            { windowsHide: true },
          );

          killer.once("error", reject);

          killer.once("exit", (code) => {
            if (code === 0 || exited) {
              resolveKill();
            } else {
              reject(new Error(`taskkill failed: ${code}`));
            }
          });
        });
      } else {
        child.kill("SIGKILL");
      }

      let timeout: ReturnType<typeof setTimeout> | undefined;

      try {
        await Promise.race([
          exitPromise,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              reject(new Error(`Worker termination timed out:\n${output}`));
            }, STOP_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timeout !== undefined) {
          clearTimeout(timeout);
        }
      }
    },
  };
}
