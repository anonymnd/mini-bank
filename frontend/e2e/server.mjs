import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const child =
    process.platform === 'win32'
        ? spawn(
              'wsl.exe',
              ['-d', 'Ubuntu', '--cd', root, '--', 'python3', 'tools/web_test_server.py'],
              { stdio: 'inherit' },
          )
        : spawn('python3', ['tools/web_test_server.py'], { cwd: root, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
