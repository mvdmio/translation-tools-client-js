import { mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientPackageDir = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
  'packages/client',
);

/** Installs the built workspace client in a temp project, as `npm install` would. */
export async function linkClient(projectDir: string): Promise<void> {
  await mkdir(path.join(projectDir, 'node_modules', '@mvdmio'), { recursive: true });
  await symlink(
    clientPackageDir,
    path.join(projectDir, 'node_modules', '@mvdmio', 'translation-tools-client'),
    'junction',
  );
}
