// Reference pm2 process for gpuunlock.com — the shape the deploy renders, not what runs.
//
// remote-bootstrap.sh generates /opt/gpuunlock/ecosystem.config.cjs from its own APP_DIR/LIVE so
// the cwd cannot drift from where the tree was actually swapped. This file is kept as the
// documented contract: read it to see what the live process looks like, do not hand-edit the
// copy on the host, since the next deploy overwrites it.
//
// cwd is the standalone tree, exactly like the stratat deploy: server.js resolves
// `.next` relative to its own location, so the process must be started from there.
module.exports = {
  apps: [
    {
      name: "gpuunlock",
      cwd: "/opt/gpuunlock/.next/standalone",
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: "3300",
        HOSTNAME: "127.0.0.1",
      },
      max_memory_restart: "512M",
      instances: 1,
      exec_mode: "fork",
    },
  ],
};
