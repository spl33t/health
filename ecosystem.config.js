module.exports = {
    apps: [
        {
            name: 'health-monitor',
            script: 'dist/index.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '512M',
            cwd: __dirname,
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
