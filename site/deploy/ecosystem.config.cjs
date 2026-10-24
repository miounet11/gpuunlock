// pm2 process for gpuunlock.com.
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
