import { spawn } from 'child_process';
import { BaseCommand } from './base-command';

export interface DockerBuilderPruneArgs {
    all?: boolean;
    force?: boolean;
}

export class DockerBuilderPruneCommand extends BaseCommand<DockerBuilderPruneArgs | undefined, string> {
    execute(args?: DockerBuilderPruneArgs): Promise<string> {
        const all = args?.all ?? true;
        const force = args?.force ?? true;

        const dockerArgs = ['builder', 'prune'];
        if (all) dockerArgs.push('-a');
        if (force) dockerArgs.push('-f');

        return new Promise((resolve, reject) => {
            const child = spawn('docker', dockerArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

            let stdout = '';
            let stderr = '';

            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');

            child.stdout.on('data', (chunk) => {
                stdout += chunk;
            });
            child.stderr.on('data', (chunk) => {
                stderr += chunk;
            });

            child.on('error', (err) => {
                reject(err);
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout.trim() || 'OK');
                    return;
                }
                const message = (stderr || stdout || `docker exited with code ${code}`).trim();
                reject(new Error(message));
            });
        });
    }
}

